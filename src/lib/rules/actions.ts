import { log, error } from '../logger';
import { pauseCampaignApi, resumeCampaignApi, setBidModifierApi } from '../googleads/campaigns';
import { addIpExclusionAllCampaigns } from '../googleads/ipExclusions';
import { prisma } from '../prisma';

export async function pauseCampaign(googleCampaignId: string): Promise<void> {
  await pauseCampaignApi(googleCampaignId);
  log('Rules', `Campaign ${googleCampaignId} paused`);
}

export async function resumeCampaign(googleCampaignId: string): Promise<void> {
  await resumeCampaignApi(googleCampaignId);
  log('Rules', `Campaign ${googleCampaignId} resumed`);
}

export async function setBidModifier(
  googleCampaignId: string,
  modifier: number
): Promise<void> {
  await setBidModifierApi(googleCampaignId, modifier);
  log('Rules', `Bid modifier ${modifier} applied to campaign ${googleCampaignId}`);
}

export async function blockIpAllCampaigns(ip: string, reason: string): Promise<void> {
  await prisma.gadsIpBlock.upsert({
    where: { ip },
    update: { reason },
    create: { ip, reason },
  });

  await addIpExclusionAllCampaigns(ip);
  log('Rules', `IP ${ip} blocked across all campaigns — reason: ${reason}`);
}

export async function sendAlert(
  message: string,
  severity: 'info' | 'warning' | 'critical'
): Promise<void> {
  log('Alert', `[${severity.toUpperCase()}] ${message}`);
  if (severity === 'critical') {
    error('Alert', `CRITICAL: ${message}`);
  }
}
