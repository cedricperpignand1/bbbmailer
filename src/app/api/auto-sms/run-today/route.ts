import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTwilioClient, defaultFromNumber } from "@/lib/twilio";
import { nowET, isWeekdayET } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthKeyFromEtParts(p: { year: number; month: number }) {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function etWeekdayKey(d: Date) {
  // Mon=0..Sun=6
  const day = d.getDay(); // local to server, but we use nowET() date
  // JS: Sun=0..Sat=6 => convert
  const jsToMon0 = (day + 6) % 7; // Mon=0..Sun=6
  return jsToMon0; // 0..6
}

function withinMinutes(a: number, b: number, minutes: number) {
  return Math.abs(a - b) <= minutes;
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
    return NextResponse.json({ ok: false, error: "Pick a Contact list (Category) first" });
  }

  const et = nowET(); // your helper should return ET parts
  // expecting your nowET() returns something like:
  // { date: Date, year, month, day, hour, minute, second, ... }
  const etDate: Date = (et as any).date ?? new Date();

  // auto-stop after N days from activation
  if (auto.startAt) {
    const stopMs = auto.stopAfterDays * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(auto.startAt).getTime() > stopMs) {
      await prisma.autoSmsCampaign.update({
        where: { id: auto.id },
        data: { active: false },
      });
      return NextResponse.json({ ok: false, error: "Auto SMS stopped (30-day window completed)." });
    }
  }

  // weekday bucket logic (Mon–Fri only)
  if (!force && !isWeekdayET()) {
    return NextResponse.json({ ok: false, error: "Scheduled runs only happen Mon–Fri (ET)." });
  }

  const weekday = etWeekdayKey(etDate); // 0..6
  if (weekday > 4) {
    return NextResponse.json({ ok: false, error: "Weekend — no bucket to run." });
  }

  // schedule checks (unless force=1)
  if (!force) {
    const dayOk = (et as any).day === auto.dayOfMonth;
    if (!dayOk) {
      return NextResponse.json({ ok: false, error: "Not the scheduled day-of-month (ET)." });
    }

    const nowMinutes = Number((et as any).hour) * 60 + Number((et as any).minute);
    const scheduledMinutes = auto.sendHourET * 60 + auto.sendMinuteET;

    if (!withinMinutes(nowMinutes, scheduledMinutes, 10)) {
      return NextResponse.json({
        ok: false,
        error: "Not within the scheduled time window (±10 minutes).",
      });
    }
  }

  const monthKey = monthKeyFromEtParts({ year: (et as any).year, month: (et as any).month });

  // prevent duplicate bucket run per month
  const already = await prisma.autoSmsRun.findUnique({
    where: {
      autoSmsCampaignId_monthKey_weekdayKey: {
        autoSmsCampaignId: auto.id,
        monthKey,
        weekdayKey: weekday,
      },
    },
  });

  if (already) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Already ran this weekday bucket for this month.",
      monthKey,
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
    return NextResponse.json({ ok: false, error: "Set a Twilio From Number (E.164)." });
  }

  // Pull this weekday bucket: id % 5 == weekdayKey
  // Prisma can't do modulo in SQL easily; MVP approach: fetch IDs then filter in JS.
  // For 500 numbers this is fine.
  const contacts = await prisma.phoneContact.findMany({
    where: { categoryId: auto.categoryId, status: "active" },
    select: { id: true, phone: true },
  });

  const bucket = contacts
    .filter((c) => c.id % 5 === weekday)
    .slice(0, maxPerRun);

  if (bucket.length === 0) {
    // still record run so you don't keep trying the same day
    const run = await prisma.autoSmsRun.create({
      data: {
        autoSmsCampaignId: auto.id,
        monthKey,
        weekdayKey: weekday,
        sentCount: 0,
      },
    });

    return NextResponse.json({ ok: true, sent: 0, run });
  }

  const client = getTwilioClient();

  // rotate address for this run (single address used across the run)
  const idx = auto.addressIndex % addresses.length;
  const address = addresses[idx];

  let sent = 0;
  const errors: Array<{ to: string; error: string }> = [];

  for (const c of bucket) {
    const body = renderTemplate(auto.messageTemplate, { address });

    // create log first
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
      const msg = await client.messages.create({
        to: c.phone,
        from: fromPhone,
        body,
      });

      await prisma.smsSendLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          providerMessageId: msg.sid,
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

      errors.push({ to: c.phone, error: err });
    }
  }

  // record run + bump address pointer
  const run = await prisma.autoSmsRun.create({
    data: {
      autoSmsCampaignId: auto.id,
      monthKey,
      weekdayKey: weekday,
      sentCount: sent,
      error: errors.length ? `${errors.length} failed` : null,
    },
  });

  await prisma.autoSmsCampaign.update({
    where: { id: auto.id },
    data: { addressIndex: auto.addressIndex + 1 },
  });

  return NextResponse.json({
    ok: true,
    monthKey,
    weekdayKey: weekday,
    addressUsed: address,
    attempted: bucket.length,
    sent,
    failed: errors.length,
    errors: errors.slice(0, 25),
    run,
  });
}
