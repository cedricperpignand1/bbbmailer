import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** GET /api/gmail/accounts — list all connected Gmail accounts with today's stats */
export async function GET() {
  const dateET = todayET();

  const accounts = await prisma.gmailAccount.findMany({
    orderBy: { createdAt: "asc" },
  });

  // For each account, fetch today's sent count across all mass campaigns
  const todayRuns = await prisma.massCampaignAccountDailyRun.findMany({
    where: { dateET },
    select: { gmailAccountId: true, sentCount: true, failedCount: true, warmupDay: true, dailyLimit: true },
  });

  const runsByAccount = new Map<
    number,
    { sentCount: number; failedCount: number; warmupDay: number; dailyLimit: number }
  >();
  for (const r of todayRuns) {
    const existing = runsByAccount.get(r.gmailAccountId);
    if (existing) {
      existing.sentCount += r.sentCount;
      existing.failedCount += r.failedCount;
    } else {
      runsByAccount.set(r.gmailAccountId, {
        sentCount: r.sentCount,
        failedCount: r.failedCount,
        warmupDay: r.warmupDay,
        dailyLimit: r.dailyLimit,
      });
    }
  }

  const result = accounts.map((a) => {
    const todayStats = runsByAccount.get(a.id) ?? {
      sentCount: 0,
      failedCount: 0,
      warmupDay: 0,
      dailyLimit: 0,
    };

    // Calculate current effective daily limit
    let effectiveLimit = a.maxPerDay;
    let warmupDay = 0;
    if (a.warmupEnabled && a.warmupStartDate) {
      const schedule = a.warmupSchedule
        .split(",")
        .map(Number)
        .filter((n) => n > 0);
      const msSinceStart = Date.now() - a.warmupStartDate.getTime();
      warmupDay = Math.floor(msSinceStart / (1000 * 60 * 60 * 24)) + 1;
      effectiveLimit =
        warmupDay <= schedule.length ? schedule[warmupDay - 1] : a.maxPerDay;
    }

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
      warmupComplete: a.warmupEnabled
        ? warmupDay > a.warmupSchedule.split(",").filter(Boolean).length
        : true,
      todaySent: todayStats.sentCount,
      todayFailed: todayStats.failedCount,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });

  return NextResponse.json({ accounts: result, dateET });
}
