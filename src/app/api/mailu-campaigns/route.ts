import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMailuConfigured, FROM_EMAIL } from "@/lib/mailu-smtp";

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

export async function GET() {
  const [categories, templates, campaign] = await Promise.all([
    prisma.category.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.template.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, subject: true },
    }),
    prisma.mailuCampaign.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  const dateET = todayET();

  const [dailyRuns, todayRun, totalSent, totalFailed, totalBounced, totalAttempted, suppressionCount] =
    campaign
      ? await Promise.all([
          prisma.mailuCampaignDailyRun.findMany({
            where: { campaignId: campaign.id },
            orderBy: { ranAt: "desc" },
            take: 60,
          }),
          prisma.mailuCampaignDailyRun.findFirst({
            where: { campaignId: campaign.id, dateET },
          }),
          prisma.mailuCampaignSend.count({ where: { campaignId: campaign.id, status: "SENT" } }),
          prisma.mailuCampaignSend.count({ where: { campaignId: campaign.id, status: "FAILED" } }),
          prisma.mailuCampaignSend.count({ where: { campaignId: campaign.id, status: "BOUNCED" } }),
          prisma.mailuCampaignSend.count({ where: { campaignId: campaign.id } }),
          prisma.mailuSuppression.count(),
        ])
      : [[], null, 0, 0, 0, 0, 0];

  const totalContacts =
    campaign?.categoryId
      ? await prisma.contact.count({
          where: { categoryId: campaign.categoryId, status: "active" },
        })
      : 0;

  // Remaining = active contacts not yet sent to AND not suppressed
  let remaining = 0;
  if (campaign?.categoryId) {
    const sentIds = await prisma.mailuCampaignSend.findMany({
      where: { campaignId: campaign.id },
      select: { contactId: true },
    });
    const suppressedEmails = await prisma.mailuSuppression.findMany({
      select: { email: true },
    });
    remaining = await prisma.contact.count({
      where: {
        categoryId: campaign.categoryId,
        status: "active",
        ...(sentIds.length > 0 ? { id: { notIn: sentIds.map((r) => r.contactId) } } : {}),
        ...(suppressedEmails.length > 0
          ? { email: { notIn: suppressedEmails.map((s) => s.email) } }
          : {}),
      },
    });
  }

  return NextResponse.json({
    categories,
    templates,
    campaign: campaign
      ? {
          ...campaign,
          warmupStartDate: campaign.warmupStartDate?.toISOString() ?? null,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
        }
      : null,
    dailyRuns,
    todayRun: todayRun ?? null,
    stats: {
      totalContacts,
      remaining,
      totalSent,
      totalFailed,
      totalBounced,
      totalAttempted,
      suppressionCount,
      sentToday: todayRun?.sentCount ?? 0,
    },
    smtp: {
      configured: isMailuConfigured(),
      fromEmail: FROM_EMAIL,
    },
    dateET,
  });
}
