import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickTemplate(template: any) {
  if (!template) return null;
  return { id: template.id, name: template.name, subject: template.subject };
}

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

  // kept for backward compat display
  const template = templates[0] ?? null;

  const autoCampaign = await prisma.autoCampaign.findFirst({
    orderBy: { createdAt: "desc" },
    include: { category: true, template: true },
  });

  // Legacy runs (weekday bucket system)
  const runs = autoCampaign
    ? await prisma.autoCampaignRun.findMany({
        where: { autoCampaignId: autoCampaign.id },
        orderBy: { ranAt: "desc" },
        take: 30,
      })
    : [];

  // New Gmail daily runs
  const dailyRuns = autoCampaign
    ? await prisma.autoCampaignDailyRun.findMany({
        where: { campaignId: autoCampaign.id },
        orderBy: { ranAt: "desc" },
        take: 30,
      })
    : [];

  return NextResponse.json({
    categories,
    templates,
    template: pickTemplate(template),
    autoCampaign: autoCampaign
      ? {
          id: autoCampaign.id,
          name: autoCampaign.name,
          active: autoCampaign.active,
          categoryId: autoCampaign.categoryId,
          templateId: autoCampaign.templateId,
          templateSubject: autoCampaign.templateSubject,
          templateBody: autoCampaign.templateBody,
          addressesText: autoCampaign.addressesText,
          maxPerDay: autoCampaign.maxPerDay,
          dayOfMonth: autoCampaign.dayOfMonth,
          sendHourET: autoCampaign.sendHourET,
          sendMinuteET: autoCampaign.sendMinuteET,
          createdAt: autoCampaign.createdAt,
          updatedAt: autoCampaign.updatedAt,
        }
      : null,
    runs,
    dailyRuns,
  });
}
