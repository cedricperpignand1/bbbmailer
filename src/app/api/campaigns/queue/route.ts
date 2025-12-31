import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  categoryId: number;
  phaseNumber: number;
  templateId: number;
};

type ContactIdRow = { id: number };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const categoryId = Number(body?.categoryId);
  const phaseNumber = Number(body?.phaseNumber);
  const templateId = Number(body?.templateId);

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }
  if (!Number.isFinite(phaseNumber) || phaseNumber <= 0) {
    return NextResponse.json({ error: "phaseNumber required" }, { status: 400 });
  }
  if (!Number.isFinite(templateId) || templateId <= 0) {
    return NextResponse.json({ error: "templateId required" }, { status: 400 });
  }

  const [category, template] = await Promise.all([
    prisma.category.findUnique({ where: { id: categoryId } }),
    prisma.template.findUnique({ where: { id: templateId } }),
  ]);

  if (!category)
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (!template)
    return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Only queue contacts that are "active".
  const contacts: ContactIdRow[] = await prisma.contact.findMany({
    where: {
      categoryId,
      phaseNumber,
      status: "active",
    },
    select: { id: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "No active contacts found in that phase" },
      { status: 400 }
    );
  }

  // Create Campaign first
  const campaign = await prisma.campaign.create({
    data: {
      categoryId,
      phaseNumber,
      templateId,
      status: "queued",
    },
  });

  // Create SendLogs in bulk.
  const logsData = contacts.map((c: ContactIdRow) => ({
    campaignId: campaign.id,
    contactId: c.id,
    status: "queued",
  }));

  const result = await prisma.sendLog.createMany({
    data: logsData,
  });

  return NextResponse.json({
    campaign,
    queued: result.count,
  });
}
