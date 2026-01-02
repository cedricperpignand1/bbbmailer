import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { defaultFromNumber } from "@/lib/twilio";

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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const existing = await prisma.autoSmsCampaign.findFirst({ orderBy: { id: "asc" } });

    const payload = {
      name: String(body.name ?? existing?.name ?? "Monthly Project SMS"),
      active: Boolean(body.active ?? existing?.active ?? true),
      categoryId:
        body.categoryId === null
          ? null
          : Number(body.categoryId ?? existing?.categoryId ?? null),
      dayOfMonth: clampInt(body.dayOfMonth ?? existing?.dayOfMonth ?? 1, 1, 31, 1),
      sendHourET: clampInt(body.sendHourET ?? existing?.sendHourET ?? 9, 0, 23, 9),
      sendMinuteET: clampInt(body.sendMinuteET ?? existing?.sendMinuteET ?? 0, 0, 59, 0),
      fromNumber: String(body.fromNumber ?? existing?.fromNumber ?? defaultFromNumber() ?? ""),
      messageTemplate: String(
        body.messageTemplate ??
          existing?.messageTemplate ??
          "Hi — project starting at {{address}}. Reply STOP to opt out."
      ),
      addressesText: String(body.addressesText ?? existing?.addressesText ?? ""),
      stopAfterDays: clampInt(body.stopAfterDays ?? existing?.stopAfterDays ?? 30, 1, 365, 30),
    };

    // set startAt when transitioning inactive -> active (or first create)
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
    // VERY IMPORTANT: log for Vercel function logs
    console.error("AUTO_SMS_UPSERT_ERROR:", e);

    return NextResponse.json(
      {
        ok: false,
        error: safeErr(e),
        hint:
          "Most common: DATABASE_URL missing on Vercel, or Prisma tables not deployed (run migrations/db push).",
      },
      { status: 500 }
    );
  }
}
