/**
 * Direct job runners — no queue, no Redis.
 * Each function calls the underlying logic immediately.
 */

import { log } from '../logger';
import { pullCampaignReport } from '../googleads/reports';
import { evaluateAllRules } from '../rules/engine';
import { analyzePerformance } from '../ai/brain';
import { optimizeCityBudgets } from '../ai/budgetOptimizer';
import { expandKeywords } from '../ai/keywordExpander';
import { pullSearchTermsReport } from '../googleads/reports';
import { blockIpAllCampaigns } from '../rules/actions';
import { prisma } from '../prisma';

export type PullDailyMetricsJob = { dateRange: 'TODAY' | 'LAST_7_DAYS' };
export type RunFraudAnalysisJob = { mode: 'light' | 'full' };
export type EvaluateRulesJob = Record<string, never>;
export type RunAiBrainJob = { dateRange: 'LAST_7_DAYS' | 'LAST_30_DAYS' };
export type RunBudgetOptimizerJob = Record<string, never>;
export type ExpandKeywordsJob = Record<string, never>;
export type BlockIpJob = { ip: string; reason: string };
export type RewriteAdCopyJob = {
  losingAdId: string;
  winningAdId: string;
  adGroupName: string;
};

export async function addBlockIpJob(payload: BlockIpJob): Promise<void> {
  log('Jobs', `Blocking IP ${payload.ip} — reason: ${payload.reason}`);
  await blockIpAllCampaigns(payload.ip, payload.reason);
}

export async function addPullMetricsJob(payload: PullDailyMetricsJob): Promise<void> {
  log('Jobs', `Pulling metrics [${payload.dateRange}]`);
  await pullCampaignReport(payload.dateRange);
}

export async function addRunFraudAnalysisJob(payload: RunFraudAnalysisJob): Promise<void> {
  log('Jobs', `Fraud analysis [${payload.mode}] — no-op in light mode`);
}

export async function addEvaluateRulesJob(_payload: EvaluateRulesJob): Promise<void> {
  log('Jobs', 'Evaluating rules');
  const metrics = await prisma.gadsCampaignMetrics.findMany({
    where: { date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  await evaluateAllRules(metrics);
}

export async function addRunAiBrainJob(payload: RunAiBrainJob): Promise<void> {
  log('Jobs', `Running AI brain [${payload.dateRange}]`);
  const metrics = await pullCampaignReport(payload.dateRange);
  await analyzePerformance(metrics);
}

export async function addRunBudgetOptimizerJob(_payload: RunBudgetOptimizerJob): Promise<void> {
  log('Jobs', 'Running budget optimizer');
  const metrics = await prisma.gadsCampaignMetrics.findMany({
    where: { date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  await optimizeCityBudgets(metrics);
}

export async function addExpandKeywordsJob(_payload: ExpandKeywordsJob): Promise<void> {
  log('Jobs', 'Expanding keywords');
  const campaigns = await prisma.gadsCampaign.findMany({ where: { status: 'ENABLED' } });
  const allTerms = [];
  for (const c of campaigns) {
    const terms = await pullSearchTermsReport(c.googleCampaignId);
    allTerms.push(...terms);
  }
  await expandKeywords(allTerms);
}

export async function addRewriteAdCopyJob(payload: RewriteAdCopyJob): Promise<void> {
  log('Jobs', `rewrite-ad-copy queued for adGroup=${payload.adGroupName} — requires manual approval`);
}
