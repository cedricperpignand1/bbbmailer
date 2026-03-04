import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isoWeekKey(d: Date): string {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 4 - (t.getDay() || 7));
  const yearStart = new Date(t.getFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function etWeekdayKey(d: Date) {
  return (d.getDay() + 6) % 7; // Mon=0 … Fri=4
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Categories with phone count so the UI can show "347 numbers"
  const rawCategories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { phoneContacts: true } },
    },
  });

  const categories = rawCategories.map((c) => ({
    id: c.id,
    name: c.name,
    phoneCount: c._count.phoneContacts,
  }));

  const auto = await prisma.autoSmsCampaign.findFirst({
    orderBy: { id: "asc" },
  });

  const selectedCategoryId = auto?.categoryId ?? null;

  const phoneCount = selectedCategoryId
    ? await prisma.phoneContact.count({
        where: { categoryId: selectedCategoryId, status: "active" },
      })
    : 0;

  const addressCount = (auto?.addressesText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean).length;

  const recentRuns = auto
    ? await prisma.autoSmsRun.findMany({
        where: { autoSmsCampaignId: auto.id },
        orderBy: { ranAt: "desc" },
        take: 20,
      })
    : [];

  const recentLogs = auto
    ? await prisma.smsSendLog.findMany({
        where: { autoSmsCampaignId: auto.id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          toPhone: true,
          body: true,
          status: true,
          error: true,
          createdAt: true,
        },
      })
    : [];

  // Today's run status (ET-based week + weekday key)
  const now = new Date();
  const todayWeekKey = isoWeekKey(now);
  const todayWeekday = etWeekdayKey(now);
  const todayRun = auto
    ? await prisma.autoSmsRun.findUnique({
        where: {
          autoSmsCampaignId_monthKey_weekdayKey: {
            autoSmsCampaignId: auto.id,
            monthKey: todayWeekKey,
            weekdayKey: todayWeekday,
          },
        },
      })
    : null;

  return NextResponse.json({
    categories,
    auto: auto ?? null,
    stats: { phoneCount, addressCount },
    recentRuns,
    recentLogs,
    todayRun: todayRun ?? null,
  });
}
