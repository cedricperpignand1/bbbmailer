import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms, defaultFromNumber } from "@/lib/telnyx";
import { nowET, isWeekdayET } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Get ET date parts (year, month, day) from Intl — timezone-safe on Vercel (UTC servers) */
function getETDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"), // "Mon", "Tue", ...
  };
}

/** ISO week key e.g. "2026-W08" — computed from the ET calendar date, not UTC */
function isoWeekKey(): string {
  const { year, month, day } = getETDateParts();
  // Build a UTC noon date for this ET calendar day (avoids DST boundary issues)
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Mon=0 … Fri=4, Sat=5, Sun=6 — derived from ET weekday, NOT server local time */
function etWeekdayKey(): number {
  const { weekday } = getETDateParts();
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[weekday] ?? 6;
}

function parseAddresses(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

/** Pick a random address from the list */
function pickRandomAddress(addresses: string[]): string {
  return addresses[Math.floor(Math.random() * addresses.length)];
}

// Vercel cron sends GET — delegate to the same handler
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const maxPerRun = Math.min(
    Math.max(Number(process.env.AUTO_SMS_MAX_PER_RUN ?? 250), 1),
    2000
  );

  const auto = await prisma.autoSmsCampaign.findFirst({ orderBy: { id: "asc" } });
  if (!auto) return NextResponse.json({ ok: false, error: "No AutoSmsCampaign yet" });

  if (!auto.active) return NextResponse.json({ ok: false, error: "Auto SMS is not active" });

  if (!auto.categoryId) {
    return NextResponse.json({ ok: false, error: "Pick a Contact list first" });
  }

  // auto-stop after N days from activation
  if (auto.startAt) {
    const stopMs = auto.stopAfterDays * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(auto.startAt).getTime() > stopMs) {
      await prisma.autoSmsCampaign.update({
        where: { id: auto.id },
        data: { active: false },
      });
      return NextResponse.json({ ok: false, error: "Campaign stopped (stop-after-days window completed)." });
    }
  }

  // weekday only (Mon–Fri)
  if (!force && !isWeekdayET()) {
    return NextResponse.json({ ok: false, error: "Scheduled runs only happen Mon–Fri (ET)." });
  }

  const weekday = etWeekdayKey(); // 0..4, derived from ET timezone
  if (weekday > 4) {
    return NextResponse.json({ ok: false, error: "Weekend — no bucket to run." });
  }

  // Time check: only skip if it's BEFORE the configured time.
  if (!force) {
    const et = nowET();
    const nowMinutes = Number((et as any).hour) * 60 + Number((et as any).minute);
    const scheduledMinutes = auto.sendHourET * 60 + auto.sendMinuteET;
    if (nowMinutes < scheduledMinutes) {
      return NextResponse.json({
        ok: false,
        error: `Too early — scheduled for ${String(auto.sendHourET).padStart(2, "0")}:${String(auto.sendMinuteET).padStart(2, "0")} ET.`,
      });
    }
  }

  // dedup per week (reuses monthKey column — stored as "2026-W08")
  const weekKey = isoWeekKey();

  const already = await prisma.autoSmsRun.findUnique({
    where: {
      autoSmsCampaignId_monthKey_weekdayKey: {
        autoSmsCampaignId: auto.id,
        monthKey: weekKey,
        weekdayKey: weekday,
      },
    },
  });

  if (already) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Already ran this weekday bucket this week.",
      weekKey,
      weekdayKey: weekday,
      ranAt: already.ranAt,
      sentCount: already.sentCount,
    });
  }

  const addresses = parseAddresses(auto.addressesText || "");
  if (addresses.length === 0) {
    return NextResponse.json({ ok: false, error: "Paste at least 1 address (one per line)." });
  }

  const fromPhone = (auto.fromNumber || defaultFromNumber() || "").trim();
  if (!fromPhone) {
    return NextResponse.json({ ok: false, error: "Set a Telnyx From Number (E.164)." });
  }

  // Pull weekday bucket: id % 5 == weekday
  const contacts = await prisma.phoneContact.findMany({
    where: { categoryId: auto.categoryId, status: "active" },
    select: { id: true, phone: true },
  });

  const bucket = contacts
    .filter((c) => c.id % 5 === weekday)
    .slice(0, maxPerRun);

  if (bucket.length === 0) {
    const run = await prisma.autoSmsRun.create({
      data: {
        autoSmsCampaignId: auto.id,
        monthKey: weekKey,
        weekdayKey: weekday,
        sentCount: 0,
      },
    });
    return NextResponse.json({ ok: true, sent: 0, run });
  }

  // pick a random address for this run
  const address = pickRandomAddress(addresses);

  let sent = 0;
  const errors: Array<{ to: string; error: string }> = [];

  for (const c of bucket) {
    const body = renderTemplate(auto.messageTemplate, { address });

    const log = await prisma.smsSendLog.create({
      data: {
        autoSmsCampaignId: auto.id,
        phoneContactId: c.id,
        toPhone: c.phone,
        fromPhone,
        body,
        status: "queued",
      },
    });

    try {
      const msg = await sendSms(c.phone, fromPhone, body);

      await prisma.smsSendLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          providerMessageId: msg.id,
          sentAt: new Date(),
        },
      });

      sent += 1;
    } catch (e: any) {
      const err = String(e?.message ?? e ?? "Unknown error").slice(0, 2000);

      await prisma.smsSendLog.update({
        where: { id: log.id },
        data: { status: "failed", error: err },
      });

      // Auto-remove failed numbers from the list
      await prisma.phoneContact.update({
        where: { id: c.id },
        data: { status: "invalid" },
      });

      errors.push({ to: c.phone, error: err });
    }
  }

  const run = await prisma.autoSmsRun.create({
    data: {
      autoSmsCampaignId: auto.id,
      monthKey: weekKey,
      weekdayKey: weekday,
      sentCount: sent,
      error: errors.length ? `${errors.length} failed` : null,
    },
  });

  return NextResponse.json({
    ok: true,
    weekKey,
    weekdayKey: weekday,
    addressUsed: address,
    attempted: bucket.length,
    sent,
    failed: errors.length,
    errors: errors.slice(0, 25),
    run,
  });
}
