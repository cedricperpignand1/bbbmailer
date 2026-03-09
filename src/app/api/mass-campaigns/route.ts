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
  const [categories, templates] = await Promise.all([
    prisma.category.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.template.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, subject: true },
    }),
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
  const todayRun = massCampaign
    ? await prisma.massCampaignDailyRun.findFirst({
        where: { campaignId: massCampaign.id, dateET },
      })
    : null;

  const lastFailedSend = massCampaign && todayRun && todayRun.failedCount > 0
    ? await prisma.massCampaignSend.findFirst({
        where: { campaignId: massCampaign.id, status: "FAILED" },
        orderBy: { createdAt: "desc" },
        select: { error: true },
      })
    : null;

  return NextResponse.json({
    categories,
    templates,
    todayRun: todayRun ? { ...todayRun, lastError: lastFailedSend?.error ?? null } : null,
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
  });
}
