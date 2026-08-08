import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGmassAccounts, getAccountDailyLimit } from "@/lib/gmass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** GET /api/gmass/accounts — list gmass1/gmass2 with today's stats (auto-creates rows if missing) */
export async function GET() {
  const dateET = todayET();
  const accounts = await getGmassAccounts();

  const [autoRuns, massRuns] = await Promise.all([
    prisma.autoCampaignAccountDailyRun.findMany({
      where: { dateET },
      select: { gmassAccountId: true, sentCount: true, failedCount: true },
    }),
    prisma.massCampaignAccountDailyRun.findMany({
      where: { dateET },
      select: { gmassAccountId: true, sentCount: true, failedCount: true },
    }),
  ]);

  const todayByAccount = new Map<number, { sentCount: number; failedCount: number }>();
  for (const r of [...autoRuns, ...massRuns]) {
    const existing = todayByAccount.get(r.gmassAccountId) ?? { sentCount: 0, failedCount: 0 };
    existing.sentCount += r.sentCount;
    existing.failedCount += r.failedCount;
    todayByAccount.set(r.gmassAccountId, existing);
  }

  const [autoLifetime, massLifetime] = await Promise.all([
    prisma.autoCampaignAccountDailyRun.groupBy({
      by: ["gmassAccountId"],
      _sum: { sentCount: true },
    }),
    prisma.massCampaignAccountDailyRun.groupBy({
      by: ["gmassAccountId"],
      _sum: { sentCount: true },
    }),
  ]);
  const lifetimeByAccount = new Map<number, number>();
  for (const r of [...autoLifetime, ...massLifetime]) {
    lifetimeByAccount.set(
      r.gmassAccountId,
      (lifetimeByAccount.get(r.gmassAccountId) ?? 0) + (r._sum.sentCount ?? 0)
    );
  }

  const result = accounts.map((a) => {
    const { limit: effectiveLimit, warmupDay } = getAccountDailyLimit(a);
    const scheduleLen = a.warmupSchedule.split(",").filter(Boolean).length;
    const today = todayByAccount.get(a.id) ?? { sentCount: 0, failedCount: 0 };

    return {
      id: a.id,
      key: a.key,
      label: a.label,
      apiKeyMasked: a.apiKey ? `••••${a.apiKey.slice(-4)}` : "",
      connected: Boolean(a.apiKey),
      fromEmail: a.fromEmail,
      fromName: a.fromName,
      active: a.active,
      maxPerDay: a.maxPerDay,
      warmupEnabled: a.warmupEnabled,
      warmupStartDate: a.warmupStartDate,
      warmupSchedule: a.warmupSchedule,
      effectiveLimit,
      warmupDay,
      warmupComplete: a.warmupEnabled ? warmupDay > scheduleLen : true,
      todaySent: today.sentCount,
      todayFailed: today.failedCount,
      lifetimeSent: lifetimeByAccount.get(a.id) ?? 0,
    };
  });

  return NextResponse.json({ accounts: result, dateET });
}
