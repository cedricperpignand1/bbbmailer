import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAddresses(text: string): string {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5000)
    .join("\n");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const {
    name,
    active,
    categoryId,
    templateId,
    templateSubject,
    templateBody,
    addressesText,
    maxPerDay,
    sendHourET,
    sendMinuteET,
  } = body;

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }

  // Resolve template
  let resolvedTemplateId: number | null = null;
  let resolvedSubject = String(templateSubject ?? "").trim();
  let resolvedBody = String(templateBody ?? "").trim();

  if (templateId && Number(templateId) > 0) {
    const tmpl = await prisma.template.findUnique({ where: { id: Number(templateId) } });
    if (!tmpl) {
      return NextResponse.json({ error: "Template not found" }, { status: 400 });
    }
    resolvedTemplateId = tmpl.id;
    resolvedSubject = "";
    resolvedBody = "";
  }

  const addresses = normalizeAddresses(addressesText || "");
  const clampedMax = Math.min(Math.max(Number(maxPerDay ?? 45), 1), 500);
  const clampedHour = Math.min(Math.max(Number(sendHourET ?? 11), 0), 23);
  const clampedMin = Math.min(Math.max(Number(sendMinuteET ?? 0), 0), 59);

  const data = {
    name: String(name || "Mass Campaign").trim().slice(0, 120),
    active: Boolean(active),
    categoryId: Number(categoryId),
    templateId: resolvedTemplateId,
    templateSubject: resolvedSubject,
    templateBody: resolvedBody,
    addressesText: addresses,
    maxPerDay: clampedMax,
    sendHourET: clampedHour,
    sendMinuteET: clampedMin,
  };

  const existing = await prisma.massCampaign.findFirst({ orderBy: { createdAt: "desc" } });

  const campaign = existing
    ? await prisma.massCampaign.update({ where: { id: existing.id }, data })
    : await prisma.massCampaign.create({ data });

  return NextResponse.json({ ok: true, campaign });
}
