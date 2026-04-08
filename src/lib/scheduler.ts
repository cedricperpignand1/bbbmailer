import cron from 'node-cron';
import { log } from './logger';
import {
  addPullMetricsJob,
  addEvaluateRulesJob,
  addRunFraudAnalysisJob,
  addRunAiBrainJob,
  addRunBudgetOptimizerJob,
  addExpandKeywordsJob,
} from './queue/jobs';
import { weeklyClickGapAnalysis } from './fraud/clickAnalyzer';

export async function dailyJob(): Promise<void> {
  await addPullMetricsJob({ dateRange: 'TODAY' });
  await addEvaluateRulesJob({});
  await addRunFraudAnalysisJob({ mode: 'light' });
  log('Scheduler', 'daily job queued');
}

export async function weeklyJob(): Promise<void> {
  await addRunAiBrainJob({ dateRange: 'LAST_7_DAYS' });
  await addRunBudgetOptimizerJob({});
  await addExpandKeywordsJob({});

  try {
    const gapReport = await weeklyClickGapAnalysis();
    log('Scheduler', `Click gap analysis: ${gapReport.recommendation}`);
  } catch (err) {
    log('Scheduler', `Click gap analysis failed: ${String(err)}`);
  }

  log('Scheduler', 'weekly review queued');
}

export function initScheduler(): void {
  // Mon–Fri 6:30 AM ET
  cron.schedule('30 6 * * 1-5', dailyJob, { timezone: 'America/New_York' });

  // Sunday 11:59 PM ET
  cron.schedule('59 23 * * 0', weeklyJob, { timezone: 'America/New_York' });

  log('Scheduler', 'Cron jobs registered — daily (Mon-Fri 6:30 AM ET), weekly (Sun 11:59 PM ET)');
}
