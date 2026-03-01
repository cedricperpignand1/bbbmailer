import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  id?: number;
  name?: string;
  active?: boolean;
  categoryId: number;
  addressesText: string;

  // Template: either pick an existing one by id, or supply inline subject+body
  templateId?: number | null;
  templateSubject?: string;
  templateBody?: string;

  maxPerDay?: number;
  sendHourET?: number;
  sendMinuteET?: number;
};

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeAddresses(text: string) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5000)
    .join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const id = body?.id ? Number(body.id) : null;
  const name = (body?.name || "Monthly Project Invites").slice(0, 120);
  const active = body?.active !== undefined ? Boolean(body.active) : true;

  const categoryId = Number(body?.categoryId);
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }

  const addressesText = normalizeAddresses(String(body?.addressesText || ""));
  if (!addressesText) {
    return NextResponse.json(
      { error: "addressesText required (paste one address per line)" },
      { status: 400 }
    );
  }

  // templateId takes priority; null means "use inline"
  const templateId =
    body?.templateId != null ? Number(body.templateId) : null;

  // Validate templateId if provided
  if (templateId) {
    const tmpl = await prisma.template.findUnique({ where: { id: templateId } });
    if (!tmpl) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
  }

  const templateSubject = templateId
    ? ""
    : String(body?.templateSubject ?? "").slice(0, 500);
  const templateBody = templateId ? "" : String(body?.templateBody ?? "");

  const maxPerDay = clampInt(Number(body?.maxPerDay ?? 45), 1, 500);
  const sendHourET = clampInt(Number(body?.sendHourET ?? 11), 0, 23);
  const sendMinuteET = clampInt(Number(body?.sendMinuteET ?? 0), 0, 59);

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const data = {
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
  };

  const saved = id
    ? await prisma.autoCampaign.update({ where: { id }, data })
    : await prisma.autoCampaign.create({ data });

  return NextResponse.json({ ok: true, autoCampaign: saved });
}
