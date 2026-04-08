import { prisma } from '../prisma';
import { log, error } from '../logger';

export type ClickGapReport = {
  googleReportedClicks: number;
  actualDbClicks: number;
  gapPercent: number;
  isSuspicious: boolean;
  recommendation: string;
};

export async function weeklyClickGapAnalysis(): Promise<ClickGapReport> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const metricsAgg = await prisma.gadsCampaignMetrics.aggregate({
      _sum: { clicks: true },
      where: { date: { gte: sevenDaysAgo } },
    });

    const googleReportedClicks = metricsAgg._sum.clicks ?? 0;

    const actualDbClicks = await prisma.gadsAdClick.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    const gapPercent =
      googleReportedClicks > 0
        ? ((googleReportedClicks - actualDbClicks) / googleReportedClicks) * 100
        : 0;

    const isSuspicious = gapPercent > 20;

    const recommendation = isSuspicious
      ? `Google reported ${googleReportedClicks} clicks but only ${actualDbClicks} were tracked in the DB (${gapPercent.toFixed(1)}% gap). This suggests click fraud, bot traffic bypassing the landing page, or a tracking script misconfiguration. Review IP exclusions and verify the tracking snippet is present on all landing pages.`
      : `Click tracking looks healthy. Google reported ${googleReportedClicks} clicks, DB recorded ${actualDbClicks} (${gapPercent.toFixed(1)}% gap — within normal range).`;

    if (isSuspicious) {
      await prisma.gadsAiDecision.create({
        data: {
          type: 'FRAUD_ALERT',
          action: 'REVIEW_CAMPAIGNS',
          confidence: 0.9,
          requiresApproval: true,
          reasoning: recommendation,
        },
      });
      log('ClickAnalyzer', `Suspicious click gap detected: ${gapPercent.toFixed(1)}%`);
    }

    log(
      'ClickAnalyzer',
      `Weekly gap analysis: google=${googleReportedClicks} db=${actualDbClicks} gap=${gapPercent.toFixed(1)}%`
    );

    return { googleReportedClicks, actualDbClicks, gapPercent, isSuspicious, recommendation };
  } catch (err) {
    error('ClickAnalyzer', 'Failed to run click gap analysis', err);
    throw err;
  }
}
