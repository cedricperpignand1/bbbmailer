import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function todayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [categories, templates, allGmailAccounts] = await Promise.all([
    prisma.category.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.template.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, subject: true },
    }),
    prisma.gmailAccount.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const massCampaign = await prisma.massCampaign.findFirst({
    orderBy: { createdAt: "desc" },
    include: { category: true, template: true },
  });

  const dailyRuns = massCampaign
    ? await prisma.massCampaignDailyRun.findMany({
        where: { campaignId: massCampaign.id },
        orderBy: { ranAt: "desc" },
        take: 30,
      })
    : [];

  const dateET = todayET();

  // Per-account daily runs for today
  const accountDailyRuns = massCampaign
    ? await prisma.massCampaignAccountDailyRun.findMany({
        where: { campaignId: massCampaign.id, dateET },
        orderBy: { gmailAccountId: "asc" },
      })
    : [];

  // Lifetime totals per account
  const accountTotals = massCampaign
    ? await prisma.massCampaignAccountDailyRun.groupBy({
        by: ["gmailAccountId"],
        where: { campaignId: massCampaign.id },
        _sum: { sentCount: true, failedCount: true },
      })
    : [];

  const totalsMap = new Map(
    accountTotals.map((r) => [r.gmailAccountId, r._sum])
  );

  // Enrich gmail accounts with warmup + today stats
  const gmailAccountsEnriched = allGmailAccounts.map((a) => {
    let effectiveLimit = a.maxPerDay;
    let warmupDay = 0;
    if (a.warmupEnabled && a.warmupStartDate) {
      const schedule = a.warmupSchedule.split(",").map(Number).filter((n) => n > 0);
      const msSinceStart = Date.now() - a.warmupStartDate.getTime();
      warmupDay = Math.floor(msSinceStart / (1000 * 60 * 60 * 24)) + 1;
      effectiveLimit = warmupDay <= schedule.length ? schedule[warmupDay - 1] : a.maxPerDay;
    }
    const todayRun = accountDailyRuns.find((r) => r.gmailAccountId === a.id);
    const totals = totalsMap.get(a.id);
    return {
      id: a.id,
      email: a.email,
      label: a.label,
      connected: Boolean(a.refreshToken),
      usedForMass: a.usedForMass,
      maxPerDay: a.maxPerDay,
      warmupEnabled: a.warmupEnabled,
      warmupStartDate: a.warmupStartDate,
      warmupSchedule: a.warmupSchedule,
      effectiveLimit,
      warmupDay,
      warmupComplete:
        a.warmupEnabled
          ? warmupDay > a.warmupSchedule.split(",").filter(Boolean).length
          : true,
      todaySent: todayRun?.sentCount ?? 0,
      todayFailed: todayRun?.failedCount ?? 0,
      lifetimeSent: totals?.sentCount ?? 0,
      lifetimeFailed: totals?.failedCount ?? 0,
    };
  });

  // Overall send stats for this campaign
  const sendStats = massCampaign
    ? await prisma.massCampaignSend.groupBy({
        by: ["status"],
        where: { campaignId: massCampaign.id },
        _count: true,
      })
    : [];

  const totalSent = sendStats.find((r) => r.status === "SENT")?._count ?? 0;
  const totalFailed = sendStats.find((r) => r.status === "FAILED")?._count ?? 0;

  const categoryContactCount = massCampaign?.categoryId
    ? await prisma.contact.count({
        where: { categoryId: massCampaign.categoryId, status: "active" },
      })
    : 0;

  const totalAlreadySentIds = massCampaign
    ? await prisma.massCampaignSend.count({ where: { campaignId: massCampaign.id } })
    : 0;

  const todayRun = massCampaign
    ? await prisma.massCampaignDailyRun.findFirst({
        where: { campaignId: massCampaign.id, dateET },
      })
    : null;

  return NextResponse.json({
    categories,
    templates,
    gmailAccounts: gmailAccountsEnriched,
    massCampaign: massCampaign
      ? {
          id: massCampaign.id,
          name: massCampaign.name,
          active: massCampaign.active,
          categoryId: massCampaign.categoryId,
          templateId: massCampaign.templateId,
          templateSubject: massCampaign.templateSubject,
          templateBody: massCampaign.templateBody,
          addressesText: massCampaign.addressesText,
          maxPerDay: massCampaign.maxPerDay,
          sendHourET: massCampaign.sendHourET,
          sendMinuteET: massCampaign.sendMinuteET,
          createdAt: massCampaign.createdAt,
          updatedAt: massCampaign.updatedAt,
        }
      : null,
    dailyRuns,
    todayRun,
    stats: {
      totalContacts: categoryContactCount,
      totalSent,
      totalFailed,
      totalAttempted: totalAlreadySentIds,
      remaining: Math.max(0, categoryContactCount - totalAlreadySentIds),
      todaySent: todayRun?.sentCount ?? 0,
    },
    dateET,
  });
}
