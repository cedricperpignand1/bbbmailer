import { prisma } from '../prisma';
import { log, error } from '../logger';
import { googleAdsFetch } from './client';
import type { GadsCampaignMetrics } from '@prisma/client';

export type SearchTerm = {
  text: string;
  clicks: number;
  impressions: number;
  costMicros: bigint;
  campaignId: string;
};

type GaqlRow = {
  campaign?: { id?: string; name?: string };
  metrics?: {
    clicks?: string;
    impressions?: string;
    cost_micros?: string;
    conversions?: string;
    invalid_clicks?: string;
  };
  search_term_view?: { search_term?: string };
};

type GaqlResponse = { results?: GaqlRow[] };

export async function pullCampaignReport(
  dateRange: 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'TODAY'
): Promise<GadsCampaignMetrics[]> {
  const query = `
    SELECT campaign.id, campaign.name,
           metrics.clicks, metrics.impressions,
           metrics.cost_micros, metrics.conversions, metrics.invalid_clicks
    FROM campaign
    WHERE segments.date DURING ${dateRange}
  `.trim();

  let response: GaqlResponse;
  try {
    response = (await googleAdsFetch(
      'googleAds:searchStream',
      'POST',
      { query }
    )) as GaqlResponse;
  } catch (err) {
    error('Reports', 'Failed to pull campaign report', err);
    throw err;
  }

  const rows = response.results ?? [];
  const saved: GadsCampaignMetrics[] = [];

  for (const row of rows) {
    const googleCampaignId = row.campaign?.id ?? '';
    if (!googleCampaignId) continue;

    try {
      const campaign = await prisma.gadsCampaign.findUnique({
        where: { googleCampaignId },
      });
      if (!campaign) {
        log('Reports', `No local campaign found for googleCampaignId=${googleCampaignId}, skipping`);
        continue;
      }

      const date = new Date();
      date.setHours(0, 0, 0, 0);

      const record = await prisma.gadsCampaignMetrics.upsert({
        where: { campaignId_date: { campaignId: campaign.id, date } },
        update: {
          clicks: parseInt(row.metrics?.clicks ?? '0', 10),
          impressions: parseInt(row.metrics?.impressions ?? '0', 10),
          costMicros: BigInt(row.metrics?.cost_micros ?? '0'),
          conversions: parseInt(row.metrics?.conversions ?? '0', 10),
          invalidClicks: parseInt(row.metrics?.invalid_clicks ?? '0', 10),
          city: campaign.city,
        },
        create: {
          campaignId: campaign.id,
          date,
          clicks: parseInt(row.metrics?.clicks ?? '0', 10),
          impressions: parseInt(row.metrics?.impressions ?? '0', 10),
          costMicros: BigInt(row.metrics?.cost_micros ?? '0'),
          conversions: parseInt(row.metrics?.conversions ?? '0', 10),
          invalidClicks: parseInt(row.metrics?.invalid_clicks ?? '0', 10),
          city: campaign.city,
        },
      });
      saved.push(record);
    } catch (err) {
      error('Reports', `Failed to upsert metrics for campaign ${googleCampaignId}`, err);
    }
  }

  log('Reports', `Pulled and saved ${saved.length} campaign metric records`);
  return saved;
}

export async function pullSearchTermsReport(campaignId: string): Promise<SearchTerm[]> {
  const query = `
    SELECT search_term_view.search_term,
           metrics.clicks, metrics.impressions, metrics.cost_micros
    FROM search_term_view
    WHERE campaign.id = '${campaignId}'
      AND segments.date DURING LAST_7_DAYS
  `.trim();

  let response: GaqlResponse;
  try {
    response = (await googleAdsFetch(
      'googleAds:searchStream',
      'POST',
      { query }
    )) as GaqlResponse;
  } catch (err) {
    error('Reports', `Failed to pull search terms for campaign ${campaignId}`, err);
    throw err;
  }

  const rows = response.results ?? [];
  return rows.map((row) => ({
    text: row.search_term_view?.search_term ?? '',
    clicks: parseInt(row.metrics?.clicks ?? '0', 10),
    impressions: parseInt(row.metrics?.impressions ?? '0', 10),
    costMicros: BigInt(row.metrics?.cost_micros ?? '0'),
    campaignId,
  }));
}
