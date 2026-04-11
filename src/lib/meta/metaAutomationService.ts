// src/lib/meta/metaAutomationService.ts
// Main orchestration loop — runs on every cron tick.
// Fetches insights → runs optimization rules → generates AI review → refreshes creatives.
// Designed to be idempotent and safe: multiple calls in the same hour are harmless.

import { prisma } from "@/lib/prisma";
import { fetchAndStoreInsights } from "./metaInsightsService";
import { runOptimizationRules, checkCreativeFatigueNeeded } from "./metaOptimizationService";
import { generatePerformanceReview, type PerformanceContext } from "./metaAiJudgeService";
import { refreshCreativesForCampaign, type CreativeAngle } from "./metaCreativeService";
import {
  createAdSet,
  createAdCreative,
  createMetaAd,
  getPageId,
  getIgActorId,
} from "./metaApiClient";
import { buildCityTargeting } from "./metaTargetingService";

// How often (ms) to re-fetch insights — avoid hammering Meta's API
const INSIGHTS_INTERVAL_MS = 55 * 60 * 1000;       // 55 minutes
// How often (ms) to run AI review — once per day is enough
const AI_REVIEW_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23 hours

export type AutomationResult = {
  skipped?: boolean;
  reason?: string;
  ok?: boolean;
  insightsFetched?: boolean;
  optimizationActions?: number;
  aiReviewGenerated?: boolean;
  creativesRefreshed?: boolean;
  error?: string;
};

/**
 * Main automation loop — call this from the cron route.
 * Safe to call multiple times; guards prevent duplicate work.
 */
export async function runAutomationLoop(): Promise<AutomationResult> {
  // ── Load state ─────────────────────────────────────────────────────────────
  const state = await prisma.metaAutomationState.findUnique({ where: { id: 1 } });

  if (!state?.isRunning || !state.activeCampaignId) {
    return { skipped: true, reason: "Automation not running or no active campaign" };
  }

  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: state.activeCampaignId },
  });

  if (!campaign || campaign.status !== "active") {
    return { skipped: true, reason: `Campaign status is "${campaign?.status ?? "not found"}"` };
  }

  const result: AutomationResult = { ok: true };

  // ── Step 1: Fetch insights (rate-limited) ──────────────────────────────────
  const shouldFetchInsights =
    !state.lastInsightsFetchAt ||
    Date.now() - state.lastInsightsFetchAt.getTime() > INSIGHTS_INTERVAL_MS;

  let latestSnapshot = null;

  if (shouldFetchInsights && campaign.metaCampaignId) {
    try {
      latestSnapshot = await fetchAndStoreInsights(
        campaign.id,
        campaign.metaCampaignId
      );
      result.insightsFetched = true;

      await prisma.metaAutomationState.update({
        where: { id: 1 },
        data: { lastInsightsFetchAt: new Date() },
      });
    } catch (err) {
      console.error("[metaAutomation] Insights fetch failed:", err);
      // Non-fatal — continue optimization with existing data
    }
  }

  // ── Step 2: Run optimization rules ────────────────────────────────────────
  try {
    const actions = await runOptimizationRules(campaign.id);
    result.optimizationActions = actions.length;

    await prisma.metaAutomationState.update({
      where: { id: 1 },
      data: {
        lastOptimizedAt: new Date(),
        consecutiveErrors: 0,
        error: null,
      },
    });
  } catch (err) {
    console.error("[metaAutomation] Optimization rules failed:", err);
    await prisma.metaAutomationState.update({
      where: { id: 1 },
      data: {
        consecutiveErrors: { increment: 1 },
        error: String(err).slice(0, 1000),
      },
    });
  }

  // ── Step 3: Creative fatigue check → refresh ───────────────────────────────
  try {
    const needsRefresh = await checkCreativeFatigueNeeded(campaign.id);

    if (needsRefresh) {
      // Find currently active angles to rotate away from
      const activeVariants = await prisma.metaCreativeVariant.findMany({
        where: { campaignId: campaign.id, isActive: true },
        select: { angle: true },
      });
      const usedAngles = activeVariants.map((v: { angle: string }) => v.angle as CreativeAngle);

      // Generate fresh variants
      const newVariantIds = await refreshCreativesForCampaign(campaign.id, usedAngles);

      if (newVariantIds.length > 0) {
        // Attach new variants to existing active ad sets
        await attachVariantsToAdSets(campaign.id, newVariantIds);
        result.creativesRefreshed = true;

        await prisma.metaAutomationState.update({
          where: { id: 1 },
          data: {
            lastCreativeRefreshAt: new Date(),
            lastActionTaken: "Creative variants refreshed due to fatigue",
            lastActionAt: new Date(),
          },
        });
      }
    }
  } catch (err) {
    console.error("[metaAutomation] Creative refresh failed:", err);
  }

  // ── Step 4: AI performance review (once per day) ───────────────────────────
  const shouldRunAiReview =
    !state.lastInsightsFetchAt || // first run
    Date.now() - (state.lastInsightsFetchAt?.getTime() ?? 0) > AI_REVIEW_INTERVAL_MS;

  if (shouldRunAiReview && latestSnapshot && latestSnapshot.leads > 0) {
    try {
      const adSets = await prisma.metaAdSet.findMany({
        where: { campaignId: campaign.id },
        include: {
          ads: { include: { variant: { select: { angle: true } } } },
        },
      });

      const citySummary: PerformanceContext["citySummary"] = {};
      const angleSummary: PerformanceContext["angleSummary"] = {};
      const adDetails: PerformanceContext["adDetails"] = [];

      for (const adSet of adSets) {
        citySummary[adSet.city] = {
          leads: adSet.leads,
          spend: adSet.spend,
          clicks: 0,
        };
        for (const ad of adSet.ads) {
          const angle = ad.variant?.angle ?? "unknown";
          if (!angleSummary[angle]) {
            angleSummary[angle] = { leads: 0, spend: 0 };
          }
          angleSummary[angle].leads += ad.leads;
          angleSummary[angle].spend += ad.spend;
          adDetails.push({
            angle,
            city: adSet.city,
            leads: ad.leads,
            spend: ad.spend,
            status: ad.status,
          });
        }
      }

      const context: PerformanceContext = {
        totalSpend: latestSnapshot.spend,
        totalLeads: latestSnapshot.leads,
        totalClicks: latestSnapshot.clicks,
        totalImpressions: latestSnapshot.impressions,
        citySummary,
        angleSummary,
        adDetails,
      };

      await generatePerformanceReview(campaign.id, context);
      result.aiReviewGenerated = true;
    } catch (err) {
      console.error("[metaAutomation] AI review failed:", err);
    }
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Attach newly generated creative variants to all active ad sets in a campaign.
 * Creates new ads for each approved variant in each active ad set.
 */
async function attachVariantsToAdSets(
  campaignId: string,
  variantIds: string[]
): Promise<void> {
  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: campaignId },
    select: { metaLeadFormId: true },
  });

  const adSets = await prisma.metaAdSet.findMany({
    where: { campaignId, status: "active" },
  });

  const variants = await prisma.metaCreativeVariant.findMany({
    where: {
      id: { in: variantIds },
      aiVerdict: { in: ["approved", "needs_revision"] },
      metaImageHash: { not: null },
    },
  });

  if (!campaign?.metaLeadFormId || adSets.length === 0 || variants.length === 0) {
    return;
  }

  const pageId = getPageId();
  const igActorId = getIgActorId();

  for (const adSet of adSets) {
    if (!adSet.metaAdSetId) continue;

    for (const variant of variants) {
      if (!variant.metaImageHash) continue;

      try {
        const creativeName = `BBB — ${adSet.city} — ${variant.angle} (refresh)`;

        const metaCreativeId = await createAdCreative({
          name: creativeName,
          pageId,
          imageHash: variant.metaImageHash,
          headline: variant.headline,
          primaryText: variant.primaryText,
          description: variant.description ?? undefined,
          ctaType: variant.ctaType,
          leadFormId: campaign.metaLeadFormId,
          igActorId,
        });

        const metaAdId = await createMetaAd(
          adSet.metaAdSetId,
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

        await prisma.metaCreativeVariant.update({
          where: { id: variant.id },
          data: { isActive: true },
        });
      } catch (err) {
        console.warn(`[metaAutomation] Attach variant failed for ${adSet.city}/${variant.angle}:`, err);
      }
    }
  }
}

/** Validate that all required Meta env vars are present. */
export function validateMetaConfig(): { ok: boolean; missing: string[] } {
  const required = [
    "META_ACCESS_TOKEN",
    "META_AD_ACCOUNT_ID",
    "META_PAGE_ID",
  ];
  const missing = required.filter((k) => !process.env[k]);
  return { ok: missing.length === 0, missing };
}
