import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms, defaultFromNumber } from "@/lib/telnyx";
import { nowET, isWeekdayET } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ISO week key e.g. "2026-W08" – used for dedup so each weekday bucket fires once per week */
function isoWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // shift to Thursday so ISO week year is consistent
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Mon=0 … Fri=4, Sat=5, Sun=6 */
function etWeekdayKey(d: Date) {
  return (d.getDay() + 6) % 7;
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

/** Pick a random address from the list */
function pickRandomAddress(addresses: string[]): string {
  return addresses[Math.floor(Math.random() * addresses.length)];
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

  const et = nowET();
  const etDate: Date = (et as any).date ?? new Date();

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

  const weekday = etWeekdayKey(etDate); // 0..4
  if (weekday > 4) {
    return NextResponse.json({ ok: false, error: "Weekend — no bucket to run." });
  }

  // time window check (unless force=1)
  if (!force) {
    const nowMinutes = Number((et as any).hour) * 60 + Number((et as any).minute);
    const scheduledMinutes = auto.sendHourET * 60 + auto.sendMinuteET;
    if (!withinMinutes(nowMinutes, scheduledMinutes, 10)) {
      return NextResponse.json({
        ok: false,
        error: "Not within the scheduled time window (±10 minutes).",
      });
    }
  }

  // dedup per week (reuses monthKey column — stored as "2026-W08")
  const weekKey = isoWeekKey(etDate);

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
