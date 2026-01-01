import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  id?: number; // optional if updating
  name?: string;
  active?: boolean;

  categoryId: number;
  addressesText: string;

  dayOfMonth?: number;   // 1..28 recommended
  sendHourET?: number;   // 0..23
  sendMinuteET?: number; // 0..59
};

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeAddresses(text: string) {
  // keep it simple: one per line; remove empty lines; limit size to avoid accidental mega-pastes
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const limited = lines.slice(0, 5000); // safety cap
  return limited.join("\n");
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

  const addressesTextRaw = String(body?.addressesText || "");
  const addressesText = normalizeAddresses(addressesTextRaw);
  if (!addressesText) {
    return NextResponse.json(
      { error: "addressesText required (paste one address per line)" },
      { status: 400 }
    );
  }

  const dayOfMonth = clampInt(Number(body?.dayOfMonth ?? 1), 1, 28);
  const sendHourET = clampInt(Number(body?.sendHourET ?? 9), 0, 23);
  const sendMinuteET = clampInt(Number(body?.sendMinuteET ?? 0), 0, 59);

  // find the fixed template
  const template =
    (await prisma.template.findFirst({
      where: { name: "Project Invite (Auto)" },
      orderBy: { createdAt: "desc" },
    })) ??
    null;

  if (!template) {
    return NextResponse.json(
      { error: 'Template "Project Invite (Auto)" not found. Create it under Templates.' },
      { status: 400 }
    );
  }

  // validate category exists
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // upsert
  const saved = id
    ? await prisma.autoCampaign.update({
        where: { id },
        data: {
          name,
          active,
          categoryId,
          templateId: template.id,
          addressesText,
          dayOfMonth,
          sendHourET,
          sendMinuteET,
        },
      })
    : await prisma.autoCampaign.create({
        data: {
          name,
          active,
          categoryId,
          templateId: template.id,
          addressesText,
          dayOfMonth,
          sendHourET,
          sendMinuteET,
        },
      });

  return NextResponse.json({ ok: true, autoCampaign: saved });
}
