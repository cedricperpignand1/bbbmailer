import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { defaultFromNumber } from "@/lib/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  active?: boolean;
  categoryId?: number | null;
  dayOfMonth?: number;
  sendHourET?: number;
  sendMinuteET?: number;
  fromNumber?: string;
  messageTemplate?: string;
  addressesText?: string;
  stopAfterDays?: number;
};

function clampInt(x: unknown, min: number, max: number, fallback: number) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function safeErr(e: unknown) {
  const msg =
    e instanceof Error
      ? `${e.name}: ${e.message}`
      : typeof e === "string"
      ? e
      : JSON.stringify(e);
  return String(msg ?? "Unknown error").slice(0, 2000);
}

async function coerceCategoryId(input: unknown): Promise<number | null> {
  // Accept null/undefined/empty => null
  if (input === null || input === undefined) return null;

  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Only allow if category actually exists (prevents FK crash)
  const exists = await prisma.category.findUnique({
    where: { id: n },
    select: { id: true },
  });

  return exists ? n : null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const existing = await prisma.autoSmsCampaign.findFirst({ orderBy: { id: "asc" } });

    // Decide which categoryId we want to use:
    // - If client sent categoryId, validate it
    // - Else keep existing categoryId ONLY IF it still exists
    const desiredCategoryId =
  body.categoryId !== undefined
    ? await coerceCategoryId(body.categoryId)
    : await coerceCategoryId(existing?.categoryId ?? null);


    const payload = {
      name: String(body.name ?? existing?.name ?? "Monthly Project SMS"),
      active: Boolean(body.active ?? existing?.active ?? true),
      categoryId: desiredCategoryId,

      dayOfMonth: clampInt(body.dayOfMonth ?? existing?.dayOfMonth ?? 1, 1, 31, 1),
      sendHourET: clampInt(body.sendHourET ?? existing?.sendHourET ?? 11, 0, 23, 11),
      sendMinuteET: clampInt(body.sendMinuteET ?? existing?.sendMinuteET ?? 0, 0, 59, 0),

      fromNumber: String(body.fromNumber ?? existing?.fromNumber ?? defaultFromNumber() ?? ""),
      messageTemplate: String(
        body.messageTemplate ??
          existing?.messageTemplate ??
          "Builders Bid Book: New project at {{address}}. View & bid: buildersbidbook.com Reply STOP to opt out."
      ),
      addressesText: String(body.addressesText ?? existing?.addressesText ?? ""),
      stopAfterDays: clampInt(body.stopAfterDays ?? existing?.stopAfterDays ?? 30, 1, 365, 30),
    };

    const shouldStart = payload.active && (!existing?.startAt || existing.active === false);

    const auto = existing
      ? await prisma.autoSmsCampaign.update({
          where: { id: existing.id },
          data: {
            ...payload,
            startAt: shouldStart ? new Date() : existing.startAt,
          },
        })
      : await prisma.autoSmsCampaign.create({
          data: {
            ...payload,
            startAt: payload.active ? new Date() : null,
          },
        });

    return NextResponse.json({ ok: true, auto });
  } catch (e) {
    console.error("AUTO_SMS_UPSERT_ERROR:", e);

    return NextResponse.json(
      {
        ok: false,
        error: safeErr(e),
        hint:
          "FK error means categoryId points to a Category ID that doesn’t exist in this DB. Create a Category in prod or pick one in the UI.",
      },
      { status: 500 }
    );
  }
}
