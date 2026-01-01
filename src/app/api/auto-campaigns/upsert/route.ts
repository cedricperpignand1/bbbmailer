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

  dayOfMonth?: number; // 1..28 recommended
  sendHourET?: number; // 0..23
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

/* ================= ET Window Helpers ================= */

const ET_TZ = "America/New_York";

function getZonedParts(d: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = dtf.formatToParts(d);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

/**
 * Convert a "local time in timeZone" to a UTC Date (JS Date stores UTC internally).
 * Uses an iterative correction so it works across DST transitions.
 */
function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
) {
  // initial guess: treat input as UTC
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  // iterate to correct timezone offset / DST
  for (let i = 0; i < 5; i++) {
    const z = getZonedParts(utc, timeZone);

    // "what local time does this utc represent?"
    const actualLocalEpoch = Date.UTC(
      z.year,
      z.month - 1,
      z.day,
      z.hour,
      z.minute,
      z.second
    );

    // "what local time do we want?"
    const desiredLocalEpoch = Date.UTC(year, month - 1, day, hour, minute, second);

    const diffMs = desiredLocalEpoch - actualLocalEpoch;
    if (Math.abs(diffMs) < 1000) break;

    utc = new Date(utc.getTime() + diffMs);
  }

  return utc;
}

function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Next occurrence of `dayOfMonth` in ET.
 * - If today ET is already on that day, it returns TODAY at 00:00 ET.
 * - Otherwise, returns that day in the current month (if not passed) or next month (if passed).
 */
function computeNextWindowStartET(dayOfMonth: number) {
  const now = new Date();
  const nowET = getZonedParts(now, ET_TZ);

  let year = nowET.year;
  let month = nowET.month;

  // If we've passed the dayOfMonth in ET, move to next month.
  // If today is the dayOfMonth, we consider that "next occurrence" = today.
  if (nowET.day > dayOfMonth) {
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  // Start at 00:00:00 ET on that day
  return zonedTimeToUtc(year, month, dayOfMonth, 0, 0, 0, ET_TZ);
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

  // NEW: windowStart/windowEnd computed on every Save (new 30-day drip window)
  const windowStartET = computeNextWindowStartET(dayOfMonth);
  const windowEndET = addDaysUTC(windowStartET, 30);

  // find the fixed template
  const template =
    (await prisma.template.findFirst({
      where: { name: "Project Invite (Auto)" },
      orderBy: { createdAt: "desc" },
    })) ?? null;

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

          // NEW FIELDS
          windowStartET,
          windowEndET,
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

          // NEW FIELDS
          windowStartET,
          windowEndET,
        },
      });

  return NextResponse.json({
    ok: true,
    autoCampaign: saved,
    window: {
      windowStartET,
      windowEndET,
    },
  });
}
