// src/lib/meta/metaOptimizationService.ts
// Hard-coded rules-based optimization engine.
// AI is used only for explanation (in metaAiJudgeService).
// These rules fire deterministically based on spend/lead thresholds.

import { prisma } from "@/lib/prisma";
import {
  updateAdStatus,
  updateAdSetStatus,
  updateAdSetBudget,
} from "./metaApiClient";
import {
  reallocateBudgetByPerformance,
} from "./metaTargetingService";

// ── Thresholds ────────────────────────────────────────────────────────────────
// Adjust these constants to tune the optimization aggressiveness.

const AD_SPEND_WEAK_CTR_THRESHOLD = 10.0;      // $10 spent
const AD_WEAK_CTR_PCT = 0.5;                    // CTR < 0.5% = weak
const AD_SPEND_NO_LEAD_THRESHOLD = 25.0;        // $25 spent with 0 leads = pause
const AD_SPEND_WINNER_THRESHOLD = 15.0;         // $15+ to be called a winner
const AD_LEAD_WINNER_MULTIPLIER = 2.0;          // 2× others in same city = winner
const CITY_BAD_CPL_MULTIPLIER = 3.0;            // CPL > 3× avg = reduce budget
const CITY_GOOD_CPL_MULTIPLIER = 0.5;           // CPL < 0.5× avg = best performer
const CREATIVE_FATIGUE_DAYS = 14;               // after 14 days active, refresh
const MIN_AD_SET_BUDGET_CENTS = 100;            // $1/day minimum per ad set

// ── Types ─────────────────────────────────────────────────────────────────────

export type OptimizationAction = {
  type: "PAUSE_AD" | "PAUSE_AD_SET" | "REALLOCATE_BUDGET" | "FLAG_CREATIVE_FATIGUE";
  targetId: string;
  reason: string;
  city?: string;
  angle?: string;
};

// ── Main optimization runner ──────────────────────────────────────────────────

/**
 * Run all optimization rules against the current campaign state.
 * Returns a list of actions taken.
 */
export async function runOptimizationRules(campaignId: string): Promise<OptimizationAction[]> {
  const actions: OptimizationAction[] = [];

  const campaign = await prisma.metaCampaign.findUnique({
    where: { id: campaignId },
    include: {
      adSets: {
        include: {
          ads: {
            include: { variant: { select: { angle: true } } },
          },
        },
      },
    },
  });

  if (!campaign) return actions;

  // ── Rule 1: Pause weak ads (high spend, low CTR) ──────────────────────────
  for (const adSet of campaign.adSets) {
    if (adSet.status !== "active") continue;

    for (const ad of adSet.ads) {
      if (ad.status !== "active") continue;

      // Rule 1a: spent past threshold, CTR below minimum
      const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : null;
      if (
        ad.spend >= AD_SPEND_WEAK_CTR_THRESHOLD &&
        ctr !== null &&
        ctr < AD_WEAK_CTR_PCT
      ) {
        const reason = `Paused: spent $${ad.spend.toFixed(2)} with CTR ${ctr.toFixed(2)}% (< ${AD_WEAK_CTR_PCT}%)`;
        await pauseAd(ad.id, ad.metaAdId, reason);
        actions.push({
          type: "PAUSE_AD",
          targetId: ad.id,
          reason,
          city: adSet.city,
          angle: ad.variant?.angle,
        });
      }

      // Rule 1b: spent past threshold with zero leads (only if not already caught by rule 1a)
      if (ad.spend >= AD_SPEND_NO_LEAD_THRESHOLD && ad.leads === 0) {
        {
          const reason = `Paused: spent $${ad.spend.toFixed(2)} with 0 leads`;
          await pauseAd(ad.id, ad.metaAdId, reason);
          actions.push({
            type: "PAUSE_AD",
            targetId: ad.id,
            reason,
            city: adSet.city,
            angle: ad.variant?.angle,
          });
        }
      }
    }
  }

  // ── Rule 2: Pause under-performing ad sets (cities) ───────────────────────
  const activeAdSets = campaign.adSets.filter((s) => s.status === "active");
  if (activeAdSets.length > 1) {
    const totalLeads = activeAdSets.reduce((s: number, a) => s + a.leads, 0);
    const totalSpend = activeAdSets.reduce((s: number, a) => s + a.spend, 0);

    if (totalLeads > 0 && totalSpend > 50) {
      const avgCpl = totalSpend / totalLeads;

      for (const adSet of activeAdSets) {
        if (adSet.leads === 0 && adSet.spend < AD_SPEND_NO_LEAD_THRESHOLD) continue;
        const cityCpl = adSet.leads > 0 ? adSet.spend / adSet.leads : Infinity;

        if (cityCpl > avgCpl * CITY_BAD_CPL_MULTIPLIER) {
          const reason = `Paused: ${adSet.city} CPL $${cityCpl === Infinity ? "∞" : cityCpl.toFixed(2)} is > ${CITY_BAD_CPL_MULTIPLIER}× campaign avg $${avgCpl.toFixed(2)}`;
          await pauseAdSet(adSet.id, adSet.metaAdSetId, reason);
          actions.push({
            type: "PAUSE_AD_SET",
            targetId: adSet.id,
            reason,
            city: adSet.city,
          });
        }
      }
    }
  }

  // ── Rule 3: Reallocate budget toward better cities ─────────────────────────
  const stillActiveAdSets = await prisma.metaAdSet.findMany({
    where: { campaignId, status: "active" },
  });

  if (stillActiveAdSets.length > 1) {
    const performanceMap: Record<string, { leads: number; spend: number }> = {};
    for (const adSet of stillActiveAdSets) {
      performanceMap[adSet.city] = { leads: adSet.leads, spend: adSet.spend };
    }

    const currentAllocations = new Map<string, number>(
      stillActiveAdSets.map((a) => [a.city, a.dailyBudgetCents])
    );

    const newAllocations = reallocateBudgetByPerformance(
      campaign.dailyBudgetCents,
      currentAllocations,
      performanceMap
    );

    for (const adSet of stillActiveAdSets) {
      const newBudget = newAllocations.get(adSet.city);
      if (
        newBudget !== undefined &&
        Math.abs(newBudget - adSet.dailyBudgetCents) > 50 // only update if change > $0.50
      ) {
        try {
          if (adSet.metaAdSetId) {
            await updateAdSetBudget(adSet.metaAdSetId, newBudget);
          }
          await prisma.metaAdSet.update({
            where: { id: adSet.id },
            data: { dailyBudgetCents: newBudget },
          });
          actions.push({
            type: "REALLOCATE_BUDGET",
            targetId: adSet.id,
            reason: `Budget shifted to $${(newBudget / 100).toFixed(2)}/day (was $${(adSet.dailyBudgetCents / 100).toFixed(2)}/day) based on performance`,
            city: adSet.city,
          });
        } catch (err) {
          console.warn(`[metaOptimization] Budget update failed for ${adSet.city}:`, err);
        }
      }
    }
  }

  // ── Rule 4: Flag creative fatigue ─────────────────────────────────────────
  const fatigueThreshold = new Date(
    Date.now() - CREATIVE_FATIGUE_DAYS * 24 * 60 * 60 * 1000
  );

  const activeVariants = await prisma.metaCreativeVariant.findMany({
    where: {
      campaignId,
      isActive: true,
      createdAt: { lt: fatigueThreshold },
    },
  });

  if (activeVariants.length > 0) {
    for (const variant of activeVariants) {
      actions.push({
        type: "FLAG_CREATIVE_FATIGUE",
        targetId: variant.id,
        reason: `Creative "${variant.angle}" has been running for ${CREATIVE_FATIGUE_DAYS}+ days — refresh recommended`,
        angle: variant.angle,
      });
    }
  }

  // Update automation state with last action
  if (actions.length > 0) {
    const summary = actions
      .slice(0, 3)
      .map((a) => a.reason)
      .join("; ");
    await prisma.metaAutomationState.upsert({
      where: { id: 1 },
      create: {
        lastActionTaken: summary,
        lastActionAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        lastActionTaken: summary,
        lastActionAt: new Date(),
      },
    });
  }

  return actions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pauseAd(
  adId: string,
  metaAdId: string | null,
  reason: string
): Promise<void> {
  try {
    if (metaAdId) {
      await updateAdStatus(metaAdId, "PAUSED");
    }
  } catch (err) {
    console.warn(`[metaOptimization] Meta API pause ad failed for ${metaAdId}:`, err);
  }
  await prisma.metaAd.update({
    where: { id: adId },
    data: { status: "paused", pauseReason: reason.slice(0, 500) },
  });
}

async function pauseAdSet(
  adSetId: string,
  metaAdSetId: string | null,
  reason: string
): Promise<void> {
  try {
    if (metaAdSetId) {
      await updateAdSetStatus(metaAdSetId, "PAUSED");
    }
  } catch (err) {
    console.warn(`[metaOptimization] Meta API pause ad set failed for ${metaAdSetId}:`, err);
  }
  await prisma.metaAdSet.update({
    where: { id: adSetId },
    data: { status: "paused", pauseReason: reason.slice(0, 500) },
  });
}

/**
 * Check if any active creatives show fatigue signals.
 * Used by the automation loop to decide if creative refresh should be queued.
 */
export async function checkCreativeFatigueNeeded(campaignId: string): Promise<boolean> {
  const fatigueThreshold = new Date(
    Date.now() - CREATIVE_FATIGUE_DAYS * 24 * 60 * 60 * 1000
  );

  const count = await prisma.metaCreativeVariant.count({
    where: {
      campaignId,
      isActive: true,
      createdAt: { lt: fatigueThreshold },
    },
  });

  return count > 0;
}
