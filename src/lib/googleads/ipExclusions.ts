import { prisma } from '../prisma';
import { log, error } from '../logger';
import { googleAdsFetch } from './client';

export async function addIpExclusion(ip: string, campaignId: string): Promise<void> {
  await googleAdsFetch('campaignCriteria:mutate', 'POST', {
    operations: [
      {
        create: {
          campaign: `customers/${process.env.GADS_ACCOUNT_ID}/campaigns/${campaignId}`,
          negative: true,
          ipBlock: { ipAddress: ip },
        },
      },
    ],
  });
  log('IPExclusion', `Added IP ${ip} to campaign ${campaignId}`);
}

export async function addIpExclusionAllCampaigns(ip: string): Promise<void> {
  const campaigns = await prisma.gadsCampaign.findMany({
    where: { status: 'ENABLED' },
    select: { googleCampaignId: true },
  });

  let successCount = 0;

  for (const campaign of campaigns) {
    try {
      await addIpExclusion(ip, campaign.googleCampaignId);
      successCount++;
    } catch (err) {
      error('IPExclusion', `Failed to exclude IP ${ip} from campaign ${campaign.googleCampaignId}`, err);
    }
  }

  if (successCount === campaigns.length) {
    await prisma.gadsIpBlock.update({
      where: { ip },
      data: { googleExcluded: true },
    });
  }

  log('IPExclusion', `IP ${ip} excluded from ${successCount}/${campaigns.length} campaigns`);
}
