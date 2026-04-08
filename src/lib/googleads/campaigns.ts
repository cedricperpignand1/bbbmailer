import { prisma } from '../prisma';
import { log, error } from '../logger';
import { googleAdsFetch } from './client';
import type { GadsCampaign } from '@prisma/client';

type GaqlCampaignRow = {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    campaignBudget?: string;
  };
  campaign_budget?: { amountMicros?: string };
};

type GaqlResponse = { results?: GaqlCampaignRow[] };

export async function getCampaigns(): Promise<GadsCampaign[]> {
  try {
    return await prisma.gadsCampaign.findMany({ orderBy: { city: 'asc' } });
  } catch (err) {
    error('Campaigns', 'Failed to fetch campaigns from DB', err);
    throw err;
  }
}

export async function syncCampaignsFromApi(): Promise<void> {
  const query = `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `.trim();

  let response: GaqlResponse;
  try {
    response = (await googleAdsFetch(
      'googleAds:searchStream',
      'POST',
      { query }
    )) as GaqlResponse;
  } catch (err) {
    error('Campaigns', 'Failed to pull campaigns from API', err);
    throw err;
  }

  const rows = response.results ?? [];
  let upserted = 0;

  for (const row of rows) {
    const googleCampaignId = row.campaign?.id ?? '';
    const name = row.campaign?.name ?? '';
    const status = row.campaign?.status ?? 'ENABLED';
    const budgetMicros = parseInt(row.campaign_budget?.amountMicros ?? '0', 10);
    const dailyBudgetCents = Math.round(budgetMicros / 10000);

    if (!googleCampaignId || !name) continue;

    try {
      await prisma.gadsCampaign.upsert({
        where: { googleCampaignId },
        update: { name, status, dailyBudgetCents },
        create: {
          googleCampaignId,
          name,
          status,
          dailyBudgetCents,
          city: '',
        },
      });
      upserted++;
    } catch (err) {
      error('Campaigns', `Failed to upsert campaign ${googleCampaignId}`, err);
    }
  }

  log('Campaigns', `Synced ${upserted} campaigns from API`);
}

export async function pauseCampaignApi(googleCampaignId: string): Promise<void> {
  await googleAdsFetch('campaigns:mutate', 'POST', {
    operations: [
      {
        update: {
          resourceName: `customers/${process.env.GADS_ACCOUNT_ID}/campaigns/${googleCampaignId}`,
          status: 'PAUSED',
        },
        updateMask: 'status',
      },
    ],
  });

  await prisma.gadsCampaign.update({
    where: { googleCampaignId },
    data: { status: 'PAUSED' },
  });

  log('Campaigns', `Paused campaign ${googleCampaignId}`);
}

export async function resumeCampaignApi(googleCampaignId: string): Promise<void> {
  await googleAdsFetch('campaigns:mutate', 'POST', {
    operations: [
      {
        update: {
          resourceName: `customers/${process.env.GADS_ACCOUNT_ID}/campaigns/${googleCampaignId}`,
          status: 'ENABLED',
        },
        updateMask: 'status',
      },
    ],
  });

  await prisma.gadsCampaign.update({
    where: { googleCampaignId },
    data: { status: 'ENABLED' },
  });

  log('Campaigns', `Resumed campaign ${googleCampaignId}`);
}

export async function setBidModifierApi(
  googleCampaignId: string,
  modifier: number
): Promise<void> {
  // Bid modifiers on ad schedules use campaignCriteria — here we apply it as
  // a flat campaign-level bidding adjustment via the campaign's manual CPC modifier.
  // modifier: 0 = no change, -1.0 = effectively off, 0.2 = +20%
  const bidModifier = 1.0 + modifier;

  await googleAdsFetch('campaignCriteria:mutate', 'POST', {
    operations: [
      {
        update: {
          resourceName: `customers/${process.env.GADS_ACCOUNT_ID}/campaignCriteria/${googleCampaignId}~-7`,
          bidModifier: Math.max(0, bidModifier),
        },
        updateMask: 'bid_modifier',
      },
    ],
  });

  log('Campaigns', `Set bid modifier ${modifier} on campaign ${googleCampaignId}`);
}
