// src/lib/meta/metaCampaignService.ts
// Creates, pauses, resumes, and stops Meta campaigns.
// Orchestrates the full ad stack: campaign → ad sets → creatives → ads.

import { prisma } from "@/lib/prisma";
import {
  getPageId,
  getIgActorId,
  createMetaCampaign,
  updateCampaignStatus,
  createAdSet,
  createAdCreative,
  createMetaAd,
  updateAdSetStatus,
  updateAdStatus,
  createLeadForm,
} from "./metaApiClient";
import {
  buildTargetingForCities,
  allocateBudget,
} from "./metaTargetingService";
import { generateCreativeVariants } from "./metaCreativeService";
import { judgeAllVariants, generatePreLaunchReview } from "./metaAiJudgeService";

// ── Launch ────────────────────────────────────────────────────────────────────

export type LaunchParams = {
  cities: string[];
  dailyBudgetCents: number;
};

export type LaunchResult = {
  ok: boolean;
  campaignId: string;
  metaCampaignId?: string;
  adsCreated: number;
  errors: string[];
};

/**
 * Full campaign launch:
 * 1. Validate no active campaign running
 * 2. Generate creative variants
 * 3. AI judge scores + approves creatives
 * 4. Create Meta campaign
 * 5. Create lead form (or reuse)
 * 6. For each city: create ad set + ads
 * 7. Save automation state
 */
export async function launchCampaign(params: LaunchParams): Promise<LaunchResult> {
  const errors: string[] = [];
  let adsCreated = 0;

  // ── Guard: prevent duplicate launches ─────────────────────────────────────
  const state = await prisma.metaAutomationState.findUnique({ where: { id: 1 } });
  if (state?.isRunning && state.activeCampaignId) {
    const existing = await prisma.metaCampaign.findUnique({
      where: { id: state.activeCampaignId },
    });
    if (existing && ["active", "paused", "launching"].includes(existing.status)) {
      throw new Error(
        `A campaign is already ${existing.status}. Stop it before launching a new one.`
      );
    }
  }

  // ── Create DB campaign record ──────────────────────────────────────────────
  const campaign = await prisma.metaCampaign.create({
    data: {
      name: `BBB Lead Acquisition — ${params.cities.slice(0, 2).join(" & ")}`,
      status: "launching",
      dailyBudgetCents: params.dailyBudgetCents,
      cities: params.cities,
    },
  });

  // Update automation state immediately so UI shows "launching"
  await prisma.metaAutomationState.upsert({
    where: { id: 1 },
    create: {
      isRunning: true,
      activeCampaignId: campaign.id,
      updatedAt: new Date(),
    },
    update: {
      isRunning: true,
      activeCampaignId: campaign.id,
      lastActionTaken: "Campaign launch initiated",
      lastActionAt: new Date(),
      error: null,
      consecutiveErrors: 0,
    },
  });

  try {
    // ── Generate creative variants ─────────────────────────────────────────
    const primaryCity = params.cities[0];
    const variantIds = await generateCreativeVariants(campaign.id, {
      cityHint: primaryCity,
    });

    if (variantIds.length === 0) {
      throw new Error("No creative variants could be generated");
    }

    // ── AI judge ──────────────────────────────────────────────────────────
    const judgeResult = await judgeAllVariants(campaign.id);

    // Get approved variants sorted by score descending
    const approvedVariants = await prisma.metaCreativeVariant.findMany({
      where: { campaignId: campaign.id, aiVerdict: "approved" },
      orderBy: { aiScore: "desc" },
      take: 3, // max 3 variants to control spend
    });

    if (approvedVariants.length === 0) {
      // Fall back to needs_revision if nothing is approved
      const fallback = await prisma.metaCreativeVariant.findMany({
        where: { campaignId: campaign.id, aiVerdict: { in: ["needs_revision", "approved"] } },
        orderBy: { aiScore: "desc" },
        take: 2,
      });
      approvedVariants.push(...(fallback as typeof approvedVariants));
    }

    await generatePreLaunchReview(
      campaign.id,
      judgeResult.approved,
      judgeResult.rejected,
      params.cities
    );

    if (approvedVariants.length === 0 || approvedVariants.every((v) => !v.metaImageHash)) {
      throw new Error("No approved variants with uploaded images — cannot launch ads");
    }

    // ── Create Meta campaign ───────────────────────────────────────────────
    const metaCampaignId = await createMetaCampaign(
      campaign.name,
      params.dailyBudgetCents
    );

    await prisma.metaCampaign.update({
      where: { id: campaign.id },
      data: { metaCampaignId },
    });

    // ── Create lead form ───────────────────────────────────────────────────
    let leadFormId: string;
    try {
      leadFormId = await createLeadForm(`BBB Lead Form — ${campaign.id.slice(0, 8)}`);
      await prisma.metaCampaign.update({
        where: { id: campaign.id },
        data: { metaLeadFormId: leadFormId },
      });
    } catch (err) {
      throw new Error(`Lead form creation failed: ${String(err)}`);
    }

    // ── Build targeting for all cities ────────────────────────────────────
    const targetingMap = await buildTargetingForCities(params.cities);
    const budgetMap = allocateBudget(params.dailyBudgetCents, params.cities);

    if (targetingMap.size === 0) {
      throw new Error("Could not resolve geo targeting for any of the selected cities");
    }

    // ── Create ad sets + ads per city ──────────────────────────────────────
    const pageId = getPageId();
    const igActorId = getIgActorId();

    for (const city of params.cities) {
      const targeting = targetingMap.get(city);
      if (!targeting) {
        errors.push(`Skipped "${city}": geo key not found`);
        continue;
      }

      const cityBudget = budgetMap.get(city) ?? Math.floor(params.dailyBudgetCents / params.cities.length);

      // Create ad set
      let metaAdSetId: string;
      try {
        metaAdSetId = await createAdSet({
          name: `BBB — ${city}`,
          campaignId: metaCampaignId,
          dailyBudgetCents: cityBudget,
          targeting,
          leadFormId,
        });
      } catch (err) {
        errors.push(`Ad set creation failed for ${city}: ${String(err)}`);
        continue;
      }

      const adSet = await prisma.metaAdSet.create({
        data: {
          campaignId: campaign.id,
          metaAdSetId,
          city,
          dailyBudgetCents: cityBudget,
        },
      });

      // Create ads for approved variants
      for (const variant of approvedVariants) {
        if (!variant.metaImageHash) continue;

        try {
          const creativeName = `BBB — ${city} — ${variant.angle}`;

          const metaCreativeId = await createAdCreative({
            name: creativeName,
            pageId,
            imageHash: variant.metaImageHash,
            headline: variant.headline,
            primaryText: variant.primaryText,
            description: variant.description ?? undefined,
            ctaType: variant.ctaType,
            leadFormId,
            igActorId,
          });

          const metaAdId = await createMetaAd(
            metaAdSetId,
            metaCreativeId,
            creativeName
          );

          await prisma.metaAd.create({
            data: {
              adSetId: adSet.id,
              variantId: variant.id,
              metaAdId,
              metaCreativeId,
            },
          });

          // Mark variant as active
          await prisma.metaCreativeVariant.update({
            where: { id: variant.id },
            data: { isActive: true },
          });

          adsCreated++;
        } catch (err) {
          errors.push(`Ad creation failed for ${city}/${variant.angle}: ${String(err)}`);
        }
      }
    }

    if (adsCreated === 0) {
      throw new Error("No ads were created successfully");
    }

    // ── Mark campaign active ───────────────────────────────────────────────
    await prisma.metaCampaign.update({
      where: { id: campaign.id },
      data: { status: "active", startedAt: new Date() },
    });

    await prisma.metaAutomationState.update({
      where: { id: 1 },
      data: {
        lastActionTaken: `Campaign launched: ${adsCreated} ads across ${params.cities.length} cities`,
        lastActionAt: new Date(),
        lastOptimizedAt: new Date(),
      },
    });

    return {
      ok: true,
      campaignId: campaign.id,
      metaCampaignId,
      adsCreated,
      errors,
    };
  } catch (err) {
    const msg = String(err);
    await prisma.metaCampaign.update({
      where: { id: campaign.id },
      data: { status: "error", error: msg.slice(0, 2000) },
    });
    await prisma.metaAutomationState.update({
      where: { id: 1 },
      data: {
        isRunning: false,
        error: msg.slice(0, 2000),
        consecutiveErrors: { increment: 1 },
      },
    });
    errors.push(msg);
    return { ok: false, campaignId: campaign.id, adsCreated, errors };
  }
}

// ── Pause ─────────────────────────────────────────────────────────────────────

export async function pauseCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.metaCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  if (campaign.metaCampaignId) {
    await updateCampaignStatus(campaign.metaCampaignId, "PAUSED");
  }

  await prisma.metaCampaign.update({
    where: { id: campaignId },
    data: { status: "paused" },
  });

  await prisma.metaAutomationState.update({
    where: { id: 1 },
    data: {
      lastActionTaken: "Campaign paused by user",
      lastActionAt: new Date(),
    },
  });
}

// ── Resume ────────────────────────────────────────────────────────────────────

export async function resumeCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: campaignId },
    include: { adSets: { include: { ads: true } } },
  });
  if (!campaign) throw new Error("Campaign not found");

  if (campaign.metaCampaignId) {
    await updateCampaignStatus(campaign.metaCampaignId, "ACTIVE");
  }

  // Resume all active ad sets and ads
  for (const adSet of campaign.adSets) {
    if (adSet.status === "paused" && adSet.metaAdSetId) {
      try {
        await updateAdSetStatus(adSet.metaAdSetId, "ACTIVE");
      } catch { /* continue */ }
    }
    for (const ad of adSet.ads) {
      if (ad.status === "active" && ad.metaAdId) {
        try {
          await updateAdStatus(ad.metaAdId, "ACTIVE");
        } catch { /* continue */ }
      }
    }
  }

  await prisma.metaCampaign.update({
    where: { id: campaignId },
    data: { status: "active" },
  });

  await prisma.metaAutomationState.update({
    where: { id: 1 },
    data: {
      isRunning: true,
      lastActionTaken: "Campaign resumed by user",
      lastActionAt: new Date(),
    },
  });
}

// ── Stop ──────────────────────────────────────────────────────────────────────

export async function stopCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.metaCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  if (campaign.metaCampaignId) {
    try {
      await updateCampaignStatus(campaign.metaCampaignId, "PAUSED");
    } catch { /* best effort */ }
  }

  await prisma.metaCampaign.update({
    where: { id: campaignId },
    data: { status: "stopped", stoppedAt: new Date() },
  });

  // Mark all variants inactive
  await prisma.metaCreativeVariant.updateMany({
    where: { campaignId },
    data: { isActive: false },
  });

  await prisma.metaAutomationState.update({
    where: { id: 1 },
    data: {
      isRunning: false,
      activeCampaignId: null,
      lastActionTaken: "Campaign stopped by user",
      lastActionAt: new Date(),
    },
  });
}
