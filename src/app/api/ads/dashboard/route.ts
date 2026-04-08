import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [campaigns, recentMetrics, recentDecisions, recentClicks, blockedIps, negativeKeywords] =
      await Promise.all([
        prisma.gadsCampaign.findMany({ orderBy: { city: 'asc' } }),

        prisma.gadsCampaignMetrics.findMany({
          where: { date: { gte: sevenDaysAgo } },
          orderBy: { date: 'desc' },
          include: { campaign: { select: { name: true, city: true } } },
        }),

        prisma.gadsAiDecision.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),

        prisma.gadsAdClick.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        prisma.gadsIpBlock.findMany({
          orderBy: { blockedAt: 'desc' },
          take: 20,
        }),

        prisma.gadsNegativeKeyword.findMany({
          orderBy: { addedAt: 'desc' },
          take: 20,
        }),
      ]);

    // Summary stats
    const totalClicks7d = recentMetrics.reduce((s, m) => s + m.clicks, 0);
    const totalConversions7d = recentMetrics.reduce((s, m) => s + m.conversions, 0);
    const totalSpendCents7d = recentMetrics.reduce(
      (s, m) => s + Number(m.costMicros) / 10_000,
      0
    );
    const flaggedClicks = recentClicks.filter((c) => c.flagged).length;
    const blockedClicks = recentClicks.filter((c) => c.blocked).length;

    return NextResponse.json({
      campaigns,
      recentMetrics: recentMetrics.map((m) => ({
        ...m,
        costMicros: m.costMicros.toString(),
      })),
      recentDecisions,
      recentClicks: recentClicks.map((c) => ({
        id: c.id,
        ip: c.ip,
        fraudScore: c.fraudScore,
        flags: c.flags,
        flagged: c.flagged,
        blocked: c.blocked,
        city: c.city,
        createdAt: c.createdAt,
      })),
      blockedIps,
      negativeKeywords,
      stats: {
        totalClicks7d,
        totalConversions7d,
        totalSpendCents7d: Math.round(totalSpendCents7d),
        flaggedClicks,
        blockedClicks,
        activeCampaigns: campaigns.filter((c) => c.status === 'ENABLED').length,
        pendingDecisions: recentDecisions.filter(
          (d) => d.requiresApproval && d.approved === null
        ).length,
      },
    });
  } catch (err) {
    console.error('[ADS Dashboard]', err);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
