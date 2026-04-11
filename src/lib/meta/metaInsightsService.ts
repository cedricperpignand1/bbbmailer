// src/lib/meta/metaInsightsService.ts
// Fetches performance data from Meta Insights API and stores snapshots.
// Runs on the automation interval (every hour).

import { prisma } from "@/lib/prisma";
import { fetchInsights, type InsightRecord } from "./metaApiClient";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLeads(record: InsightRecord): number {
  if (!record.actions) return 0;
  const leadAction = record.actions.find(
    (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
  );
  return leadAction ? parseInt(leadAction.value, 10) : 0;
}

// ── Campaign-level insights ───────────────────────────────────────────────────

export type CampaignInsightSummary = {
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  cpl: number | null;
  ctr: number | null;
};

/**
 * Fetch campaign-level insights from Meta and return a summary.
 */
export async function fetchCampaignInsights(
  metaCampaignId: string
): Promise<CampaignInsightSummary> {
  const records = await fetchInsights(metaCampaignId, "campaign", "last_7_days");
  const record = records[0]; // campaign level returns one aggregate row

  if (!record) {
    return { impressions: 0, clicks: 0, leads: 0, spend: 0, cpl: null, ctr: null };
  }

  const impressions = parseInt(record.impressions, 10) || 0;
  const clicks = parseInt(record.clicks, 10) || 0;
  const leads = extractLeads(record);
  const spend = parseFloat(record.spend) || 0;
  const cpl = leads > 0 ? spend / leads : null;
  const ctr = impressions > 0 ? clicks / impressions : null;

  return { impressions, clicks, leads, spend, cpl, ctr };
}

// ── Ad-set-level breakdown ────────────────────────────────────────────────────

export type AdSetInsight = {
  metaAdSetId: string;
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  cpl: number | null;
  ctr: number | null;
};

/**
 * Fetch per-ad-set insights for a campaign.
 */
export async function fetchAdSetInsights(
  metaCampaignId: string
): Promise<AdSetInsight[]> {
  const records = await fetchInsights(metaCampaignId, "adset", "last_7_days");

  return records.map((r) => {
    const impressions = parseInt(r.impressions, 10) || 0;
    const clicks = parseInt(r.clicks, 10) || 0;
    const leads = extractLeads(r);
    const spend = parseFloat(r.spend) || 0;
    return {
      metaAdSetId: (r as Record<string, unknown>).adset_id as string ?? "",
      impressions,
      clicks,
      leads,
      spend,
      cpl: leads > 0 ? spend / leads : null,
      ctr: impressions > 0 ? clicks / impressions : null,
    };
  });
}

// ── Ad-level breakdown ────────────────────────────────────────────────────────

export type AdInsight = {
  metaAdId: string;
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  cpl: number | null;
  ctr: number | null;
};

export async function fetchAdInsights(
  metaCampaignId: string
): Promise<AdInsight[]> {
  const records = await fetchInsights(metaCampaignId, "ad", "last_7_days");

  return records.map((r) => {
    const impressions = parseInt(r.impressions, 10) || 0;
    const clicks = parseInt(r.clicks, 10) || 0;
    const leads = extractLeads(r);
    const spend = parseFloat(r.spend) || 0;
    return {
      metaAdId: (r as Record<string, unknown>).ad_id as string ?? "",
      impressions,
      clicks,
      leads,
      spend,
      cpl: leads > 0 ? spend / leads : null,
      ctr: impressions > 0 ? clicks / impressions : null,
    };
  });
}

// ── Snapshot storage ──────────────────────────────────────────────────────────

/**
 * Fetch all insights, update DB records for ads/ad sets,
 * and save a new MetaPerformanceSnapshot.
 * Returns the snapshot.
 */
export async function fetchAndStoreInsights(
  campaignId: string,
  metaCampaignId: string
) {
  // Fetch all levels in parallel
  const [campaignSummary, adSetInsights, adInsights] = await Promise.all([
    fetchCampaignInsights(metaCampaignId),
    fetchAdSetInsights(metaCampaignId).catch(() => [] as AdSetInsight[]),
    fetchAdInsights(metaCampaignId).catch(() => [] as AdInsight[]),
  ]);

  // Update ad set records
  if (adSetInsights.length > 0) {
    await Promise.all(
      adSetInsights.map((asi) =>
        prisma.metaAdSet.updateMany({
          where: { metaAdSetId: asi.metaAdSetId },
          data: { leads: asi.leads, spend: asi.spend },
        })
      )
    );
  }

  // Update ad records
  if (adInsights.length > 0) {
    await Promise.all(
      adInsights.map((ai) =>
        prisma.metaAd.updateMany({
          where: { metaAdId: ai.metaAdId },
          data: {
            leads: ai.leads,
            spend: ai.spend,
            clicks: ai.clicks,
            impressions: ai.impressions,
          },
        })
      )
    );
  }

  // Build city summary from ad sets
  const adSetsInDb = await prisma.metaAdSet.findMany({
    where: { campaignId },
    select: { city: true, leads: true, spend: true, metaAdSetId: true },
  });

  const citySummary: Record<
    string,
    { impressions: number; clicks: number; leads: number; spend: number }
  > = {};
  for (const adSet of adSetsInDb) {
    const asi = adSetInsights.find((a) => a.metaAdSetId === adSet.metaAdSetId);
    citySummary[adSet.city] = {
      impressions: asi?.impressions ?? 0,
      clicks: asi?.clicks ?? 0,
      leads: adSet.leads,
      spend: adSet.spend,
    };
  }

  // Build angle summary from ads
  const adsInDb = await prisma.metaAd.findMany({
    where: { adSet: { campaignId } },
    include: { variant: { select: { angle: true } } },
  });

  const angleSummary: Record<string, { leads: number; spend: number; cpl: number | null }> = {};
  for (const ad of adsInDb) {
    const angle = ad.variant?.angle ?? "unknown";
    if (!angleSummary[angle]) {
      angleSummary[angle] = { leads: 0, spend: 0, cpl: null };
    }
    angleSummary[angle].leads += ad.leads;
    angleSummary[angle].spend += ad.spend;
  }
  // Calculate CPL per angle
  for (const angle in angleSummary) {
    const a = angleSummary[angle];
    a.cpl = a.leads > 0 ? a.spend / a.leads : null;
  }

  // Find top city and angle
  const topCityEntry = Object.entries(citySummary).sort(
    (a, b) => b[1].leads - a[1].leads
  )[0];
  const topAngleEntry = Object.entries(angleSummary).sort(
    (a, b) => b[1].leads - a[1].leads
  )[0];

  const snapshot = await prisma.metaPerformanceSnapshot.create({
    data: {
      campaignId,
      impressions: campaignSummary.impressions,
      clicks: campaignSummary.clicks,
      leads: campaignSummary.leads,
      spend: campaignSummary.spend,
      cpl: campaignSummary.cpl,
      ctr: campaignSummary.ctr,
      topCity: topCityEntry?.[0] ?? null,
      topAngle: topAngleEntry?.[0] ?? null,
      citySummary,
      angleSummary,
    },
  });

  return snapshot;
}
