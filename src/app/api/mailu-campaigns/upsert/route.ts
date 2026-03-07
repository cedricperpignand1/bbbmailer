import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseSchedule(raw: string): number[] {
  return String(raw || "")
    .split(/[\n,]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const {
    id,
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
    warmupEnabled,
    warmupSchedule,
  } = body;

  // Validate category
  const catId = Number(categoryId);
  if (!catId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  const category = await prisma.category.findUnique({ where: { id: catId } });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 400 });

  // Validate addresses
  const normalizedAddresses = String(addressesText || "")
    .split(/\r?\n/)
    .map((s: string) => s.trim())
    .filter(Boolean)
    .join("\n");
  if (!normalizedAddresses)
    return NextResponse.json({ error: "At least one address required" }, { status: 400 });

  // Validate template
  const tmplId = templateId ? Number(templateId) : null;
  if (tmplId) {
    const tmpl = await prisma.template.findUnique({ where: { id: tmplId } });
    if (!tmpl) return NextResponse.json({ error: "Template not found" }, { status: 400 });
  }

  // Validate warmup schedule
  const scheduleNums = parseSchedule(String(warmupSchedule || "20,30,45,60,80,100,125,150,180,210,240,275"));
  if (scheduleNums.length === 0)
    return NextResponse.json({ error: "Warmup schedule must have at least one positive number" }, { status: 400 });

  const isActive = Boolean(active);
  const isWarmup = warmupEnabled !== false; // default true

  const data = {
    name: String(name || "Mailu Campaign").slice(0, 120),
    active: isActive,
    categoryId: catId,
    templateId: tmplId,
    templateSubject: tmplId ? "" : String(templateSubject || "").slice(0, 500),
    templateBody: tmplId ? "" : String(templateBody || ""),
    addressesText: normalizedAddresses,
    maxPerDay: clampInt(Number(maxPerDay), 1, 1000),
    sendHourET: clampInt(Number(sendHourET), 0, 23),
    sendMinuteET: clampInt(Number(sendMinuteET), 0, 59),
    warmupEnabled: isWarmup,
    warmupSchedule: scheduleNums.join(","),
  };

  let campaign;

  if (id) {
    const existing = await prisma.mailuCampaign.findUnique({ where: { id: Number(id) } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Set warmupStartDate when campaign first becomes active with warmup enabled
    const shouldSetStart = isActive && isWarmup && !existing.warmupStartDate && !existing.active;

    campaign = await prisma.mailuCampaign.update({
      where: { id: Number(id) },
      data: {
        ...data,
        ...(shouldSetStart ? { warmupStartDate: new Date() } : {}),
      },
    });
  } else {
    campaign = await prisma.mailuCampaign.create({
      data: {
        ...data,
        warmupStartDate: isActive && isWarmup ? new Date() : null,
      },
    });
  }

  return NextResponse.json({ ok: true, campaign });
}
