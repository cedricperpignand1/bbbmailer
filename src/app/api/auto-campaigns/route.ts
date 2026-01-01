import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickTemplate(template: any) {
  if (!template) return null;
  return { id: template.id, name: template.name, subject: template.subject };
}

export async function GET() {
  // load categories (your "lists")
  const categories = await prisma.category.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });

  // fixed template (Project Invite (Auto))
  const template =
    (await prisma.template.findFirst({
      where: { name: "Project Invite (Auto)" },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.template.findFirst({
      orderBy: { createdAt: "desc" },
    }));

  // MVP: use the most recent AutoCampaign as "the" auto campaign
  const autoCampaign = await prisma.autoCampaign.findFirst({
    orderBy: { createdAt: "desc" },
    include: { category: true, template: true },
  });

  const runs = autoCampaign
    ? await prisma.autoCampaignRun.findMany({
        where: { autoCampaignId: autoCampaign.id },
        orderBy: { ranAt: "desc" },
        take: 30,
      })
    : [];

  return NextResponse.json({
    categories,
    template: pickTemplate(template),
    autoCampaign: autoCampaign
      ? {
          id: autoCampaign.id,
          name: autoCampaign.name,
          active: autoCampaign.active,
          categoryId: autoCampaign.categoryId,
          templateId: autoCampaign.templateId,
          addressesText: autoCampaign.addressesText,
          dayOfMonth: autoCampaign.dayOfMonth,
          sendHourET: autoCampaign.sendHourET,
          sendMinuteET: autoCampaign.sendMinuteET,
          createdAt: autoCampaign.createdAt,
          updatedAt: autoCampaign.updatedAt,
        }
      : null,
    runs,
  });
}
