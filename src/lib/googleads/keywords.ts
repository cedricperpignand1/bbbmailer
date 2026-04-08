import { prisma } from '../prisma';
import { log, error } from '../logger';
import { googleAdsFetch } from './client';
import { pullSearchTermsReport } from './reports';

const BAD_TERMS = [
  'job', 'salary', 'residential', 'free', 'diy',
  'homeowner', 'hiring', 'resume', 'course', 'training',
  'government', 'permit', 'license renewal', 'how to',
  'what is', 'definition',
];

export async function addKeyword(
  adGroupId: string,
  text: string,
  matchType: 'EXACT' | 'PHRASE' | 'BROAD',
  bidMicros: bigint
): Promise<void> {
  await googleAdsFetch('adGroupCriteria:mutate', 'POST', {
    operations: [
      {
        create: {
          adGroup: `customers/${process.env.GADS_ACCOUNT_ID}/adGroups/${adGroupId}`,
          keyword: { text, matchType },
          cpcBidMicros: bidMicros.toString(),
          status: 'ENABLED',
        },
      },
    ],
  });
  log('Keywords', `Added keyword "${text}" [${matchType}] to adGroup ${adGroupId}`);
}

export async function addNegativeKeyword(text: string, campaignId: string): Promise<void> {
  await googleAdsFetch('campaignCriteria:mutate', 'POST', {
    operations: [
      {
        create: {
          campaign: `customers/${process.env.GADS_ACCOUNT_ID}/campaigns/${campaignId}`,
          negative: true,
          keyword: { text, matchType: 'BROAD' },
        },
      },
    ],
  });

  await prisma.gadsNegativeKeyword.upsert({
    where: { text },
    update: { addedBy: 'api' },
    create: { text, addedBy: 'api' },
  });

  log('Keywords', `Added negative keyword "${text}" to campaign ${campaignId}`);
}

export async function pauseKeyword(keywordId: string): Promise<void> {
  await googleAdsFetch('adGroupCriteria:mutate', 'POST', {
    operations: [
      {
        update: {
          resourceName: `customers/${process.env.GADS_ACCOUNT_ID}/adGroupCriteria/${keywordId}`,
          status: 'PAUSED',
        },
        updateMask: 'status',
      },
    ],
  });
  log('Keywords', `Paused keyword ${keywordId}`);
}

export async function autoNegativeFromSearchTerms(): Promise<string[]> {
  const campaigns = await prisma.gadsCampaign.findMany({
    where: { status: 'ENABLED' },
  });

  const existingNegatives = await prisma.gadsNegativeKeyword.findMany({
    select: { text: true },
  });
  const existingSet = new Set(existingNegatives.map((n: { text: string }) => n.text.toLowerCase()));

  const added: string[] = [];

  for (const campaign of campaigns) {
    let terms;
    try {
      terms = await pullSearchTermsReport(campaign.googleCampaignId);
    } catch (err) {
      error('Keywords', `Failed to pull search terms for campaign ${campaign.id}`, err);
      continue;
    }

    for (const term of terms) {
      const lowerTerm = term.text.toLowerCase();
      if (existingSet.has(lowerTerm)) continue;

      const isBad = BAD_TERMS.some((bad) => lowerTerm.includes(bad));
      if (!isBad) continue;

      try {
        await googleAdsFetch('campaignCriteria:mutate', 'POST', {
          operations: [
            {
              create: {
                campaign: `customers/${process.env.GADS_ACCOUNT_ID}/campaigns/${campaign.googleCampaignId}`,
                negative: true,
                keyword: { text: term.text, matchType: 'BROAD' },
              },
            },
          ],
        });

        await prisma.gadsNegativeKeyword.upsert({
          where: { text: term.text },
          update: { addedBy: 'auto' },
          create: { text: term.text, addedBy: 'auto' },
        });

        existingSet.add(lowerTerm);
        added.push(term.text);
        log('Keywords', `Auto-negated "${term.text}" for campaign ${campaign.name}`);
      } catch (err) {
        error('Keywords', `Failed to add negative "${term.text}"`, err);
      }
    }
  }

  log('Keywords', `Auto-negative run complete — added ${added.length} new negatives`);
  return added;
}
