import { prisma } from '../prisma';
import { log, error } from '../logger';
import { pauseCampaign, setBidModifier, sendAlert } from './actions';
import { autoNegativeFromSearchTerms } from '../googleads/keywords';
import type { GadsCampaignMetrics } from '@prisma/client';

export type RuleResult = {
  ruleName: string;
  fired: boolean;
  action: string;
  result: string;
};

function nowET(): { day: number; hour: number } {
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);
  return { day: etDate.getDay(), hour: etDate.getHours() };
}

async function ruleZeroConversionPause(
  metrics: GadsCampaignMetrics[]
): Promise<RuleResult> {
  const ruleName = 'ZERO_CONVERSION_PAUSE';
  const threshold25usd = 25_000_000n;

  const bad = metrics.filter(
    (m) =>
      m.clicks > 40 &&
      m.conversions === 0 &&
      m.costMicros > threshold25usd
  );

  if (bad.length === 0) {
    return { ruleName, fired: false, action: 'none', result: 'No campaigns triggered' };
  }

  const results: string[] = [];

  for (const m of bad) {
    try {
      const campaign = await prisma.gadsCampaign.findUnique({
        where: { id: m.campaignId },
      });
      if (!campaign) continue;

      await pauseCampaign(campaign.googleCampaignId);
      await sendAlert(
        `Campaign "${campaign.name}" paused — ${m.clicks} clicks, $0 conversions, $${Number(m.costMicros) / 1_000_000} spent`,
        'critical'
      );
      results.push(campaign.name);
    } catch (err) {
      error('Engine', `ZERO_CONVERSION_PAUSE failed for campaign ${m.campaignId}`, err);
    }
  }

  return {
    ruleName,
    fired: true,
    action: 'pauseCampaign',
    result: `Paused ${results.length} campaign(s): ${results.join(', ')}`,
  };
}

async function ruleClickSpike(metrics: GadsCampaignMetrics[]): Promise<RuleResult> {
  const ruleName = 'CLICK_SPIKE';
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentClicks = await prisma.gadsAdClick.count({
    where: { createdAt: { gte: oneHourAgo } },
  });

  const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);

  if (recentClicks <= 10 || totalConversions > 0) {
    return { ruleName, fired: false, action: 'none', result: `Recent clicks: ${recentClicks}` };
  }

  const campaigns = await prisma.gadsCampaign.findMany({
    where: { status: 'ENABLED' },
  });

  for (const campaign of campaigns) {
    try {
      await pauseCampaign(campaign.googleCampaignId);
      await sendAlert(
        `Click spike detected: ${recentClicks} clicks in last 60 min with 0 conversions — paused "${campaign.name}"`,
        'critical'
      );
    } catch (err) {
      error('Engine', `CLICK_SPIKE pause failed for campaign ${campaign.id}`, err);
    }
  }

  return {
    ruleName,
    fired: true,
    action: 'pauseCampaign',
    result: `Spike of ${recentClicks} clicks — paused ${campaigns.length} campaign(s)`,
  };
}

async function ruleWeekendShutdown(): Promise<RuleResult> {
  const ruleName = 'WEEKEND_SHUTDOWN';
  const { day } = nowET();

  if (day !== 0 && day !== 6) {
    return { ruleName, fired: false, action: 'none', result: 'Weekday — no action' };
  }

  const campaigns = await prisma.gadsCampaign.findMany({
    where: { status: 'ENABLED' },
  });

  for (const campaign of campaigns) {
    try {
      await setBidModifier(campaign.googleCampaignId, -1.0);
    } catch (err) {
      error('Engine', `WEEKEND_SHUTDOWN bid modifier failed for ${campaign.id}`, err);
    }
  }

  return {
    ruleName,
    fired: true,
    action: 'setBidModifier(-1.0)',
    result: `Weekend shutdown applied to ${campaigns.length} campaign(s)`,
  };
}

async function rulePeakHourBoost(): Promise<RuleResult> {
  const ruleName = 'PEAK_HOUR_BOOST';
  const { day, hour } = nowET();
  const isPeakDay = day >= 2 && day <= 4; // Tue=2, Wed=3, Thu=4
  const isPeakHour = hour >= 9 && hour <= 11;

  if (!isPeakDay || !isPeakHour) {
    return { ruleName, fired: false, action: 'none', result: 'Not peak window' };
  }

  const campaigns = await prisma.gadsCampaign.findMany({
    where: { status: 'ENABLED' },
  });

  for (const campaign of campaigns) {
    try {
      await setBidModifier(campaign.googleCampaignId, 0.2);
    } catch (err) {
      error('Engine', `PEAK_HOUR_BOOST failed for ${campaign.id}`, err);
    }
  }

  return {
    ruleName,
    fired: true,
    action: 'setBidModifier(0.2)',
    result: `Peak boost applied to ${campaigns.length} campaign(s)`,
  };
}

async function ruleAutoNegative(): Promise<RuleResult> {
  const ruleName = 'AUTO_NEGATIVE';
  try {
    const added = await autoNegativeFromSearchTerms();
    return {
      ruleName,
      fired: added.length > 0,
      action: 'addNegativeKeyword',
      result: `Added ${added.length} negative keyword(s)`,
    };
  } catch (err) {
    error('Engine', 'AUTO_NEGATIVE rule failed', err);
    return { ruleName, fired: false, action: 'none', result: `Error: ${String(err)}` };
  }
}

export async function evaluateAllRules(
  metrics: GadsCampaignMetrics[]
): Promise<RuleResult[]> {
  const results: RuleResult[] = [];

  // Hardcoded rules
  const hardcoded: Array<() => Promise<RuleResult>> = [
    () => ruleZeroConversionPause(metrics),
    () => ruleClickSpike(metrics),
    ruleWeekendShutdown,
    rulePeakHourBoost,
    ruleAutoNegative,
  ];

  for (const fn of hardcoded) {
    try {
      const result = await fn();
      results.push(result);
      if (result.fired) {
        log('Engine', `Rule ${result.ruleName} fired — ${result.result}`);
      }
    } catch (err) {
      error('Engine', `Hardcoded rule failed`, err);
      results.push({ ruleName: 'UNKNOWN', fired: false, action: 'none', result: `Error: ${String(err)}` });
    }
  }

  // DB-driven automation rules
  let dbRules: Array<{ id: string; name: string; condition: string; action: string }> = [];
  try {
    dbRules = await prisma.gadsAutomationRule.findMany({ where: { enabled: true } });
  } catch (err) {
    error('Engine', 'Failed to load automation rules from DB', err);
  }

  for (const rule of dbRules) {
    try {
      // DB rules are evaluated as declarative condition strings — log for now,
      // extend with an expression evaluator when rule types are defined.
      log('Engine', `DB rule "${rule.name}" loaded — condition: ${rule.condition}`);
      results.push({
        ruleName: rule.name,
        fired: false,
        action: rule.action,
        result: 'DB rule logged — manual evaluation required',
      });
    } catch (err) {
      error('Engine', `DB rule "${rule.name}" evaluation error`, err);
    }
  }

  return results;
}
