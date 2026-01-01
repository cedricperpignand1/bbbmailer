import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto Campaign runner (Scheduled + Manual)
 *
 * - Scheduled mode (default):
 *   - Only runs Mon–Fri
 *   - Only runs if ET day-of-month matches auto.dayOfMonth
 *   - Only runs if ET time is within +/- 10 minutes of auto.sendHourET:auto.sendMinuteET
 *
 * - Manual mode:
 *   - Add ?force=1 to bypass schedule checks (still Mon–Fri bucket logic)
 *
 * - Contact bucketing:
 *   contact.id % 5 -> Mon..Fri
 *     mon=0, tue=1, wed=2, thu=3, fri=4
 *
 * - Creates:
 *   - normal Campaign (phaseNumber=999)
 *   - SendLogs (queued)
 *   - AutoCampaignRun (monthKey + weekdayKey) to prevent duplicates
 */

function monthKeyFromEtParts(p: { year: number; month: number }) {
  const y = p.year;
  const m = String(p.month).padStart(2, "0");
  return `${y}-${m}`;
}

function weekdayKeyFromEtParts(p: { weekday: string }) {
  // Intl weekday in English: Mon, Tue, Wed...
  const w = p.weekday.toLowerCase();
  if (w.startsWith("mon")) return "mon";
  if (w.startsWith("tue")) return "tue";
  if (w.startsWith("wed")) return "wed";
  if (w.startsWith("thu")) return "thu";
  if (w.startsWith("fri")) return "fri";
  if (w.startsWith("sat")) return "sat";
  return "sun";
}

function bucketIndexForWeekday(w: string) {
  if (w === "mon") return 0;
  if (w === "tue") return 1;
  if (w === "wed") return 2;
  if (w === "thu") return 3;
  if (w === "fri") return 4;
  return null; // weekend
}

function getEtParts(now = new Date()) {
  // reliable ET conversion
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const weekday = map.weekday || "Mon";

  return { year, month, day, hour, minute, weekday };
}

function minutes(h: number, m: number) {
  return h * 60 + m;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1"; // manual override

  const et = getEtParts(new Date());
  const weekdayKey = weekdayKeyFromEtParts({ weekday: et.weekday });
  const bucketIndex = bucketIndexForWeekday(weekdayKey);

  if (bucketIndex === null) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "Weekend (no Mon–Fri run)", weekdayKey, et },
      { status: 200 }
    );
  }

  // MVP: use most recent active AutoCampaign
  const auto = await prisma.autoCampaign.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });

  if (!auto) {
    return NextResponse.json(
      { error: "No active AutoCampaign found. Create and enable one first." },
      { status: 400 }
    );
  }

  // ===== Scheduled checks (unless force=1) =====
  if (!force) {
    // day-of-month match
    if (et.day !== Number(auto.dayOfMonth)) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: `Not scheduled day-of-month. Today (ET) is ${et.day}, scheduled is ${auto.dayOfMonth}.`,
          weekdayKey,
          et,
          scheduled: { dayOfMonth: auto.dayOfMonth, hour: auto.sendHourET, minute: auto.sendMinuteET },
        },
        { status: 200 }
      );
    }

    // time window +/- 10 minutes
    const nowMin = minutes(et.hour, et.minute);
    const schedMin = minutes(Number(auto.sendHourET), Number(auto.sendMinuteET));
    const diff = Math.abs(nowMin - schedMin);

    if (diff > 10) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: `Outside scheduled time window (+/-10m). Now (ET) ${et.hour}:${String(et.minute).padStart(
            2,
            "0"
          )}, scheduled ${auto.sendHourET}:${String(auto.sendMinuteET).padStart(2, "0")}.`,
          weekdayKey,
          et,
          scheduled: { dayOfMonth: auto.dayOfMonth, hour: auto.sendHourET, minute: auto.sendMinuteET },
          diffMinutes: diff,
        },
        { status: 200 }
      );
    }
  }

  const monthKey = monthKeyFromEtParts({ year: et.year, month: et.month });

  // prevent duplicates: one run per weekday per month
  const existingRun = await prisma.autoCampaignRun.findFirst({
    where: {
      autoCampaignId: auto.id,
      monthKey,
      weekdayKey,
    },
  });

  if (existingRun) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "Already ran for this weekday in this month",
        existingRun,
        monthKey,
        weekdayKey,
        et,
      },
      { status: 200 }
    );
  }

  // confirm template exists
  const template = await prisma.template.findUnique({ where: { id: auto.templateId } });
  if (!template) {
    return NextResponse.json(
      { error: "AutoCampaign template not found. Re-save AutoCampaign settings." },
      { status: 400 }
    );
  }

  // load active contacts
  const contacts = await prisma.contact.findMany({
    where: { categoryId: auto.categoryId, status: "active" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "No active contacts found in the selected category." },
      { status: 400 }
    );
  }

  // bucket for today
  const bucketContacts = contacts.filter((c) => c.id % 5 === bucketIndex);

  // if empty bucket, still record run to avoid repeated attempts
  if (bucketContacts.length === 0) {
    const run = await prisma.autoCampaignRun.create({
      data: {
        autoCampaignId: auto.id,
        monthKey,
        weekdayKey,
        queuedCount: 0,
      },
    });

    return NextResponse.json({
      ok: true,
      queued: 0,
      campaignId: null,
      runId: run.id,
      monthKey,
      weekdayKey,
      bucketIndex,
      contactsTotal: contacts.length,
      bucketContacts: 0,
      et,
      note: "Bucket had 0 contacts",
    });
  }

  // create normal Campaign (shows on Campaigns page)
  const campaign = await prisma.campaign.create({
    data: {
      categoryId: auto.categoryId,
      phaseNumber: 999, // reserved for auto runs
      templateId: auto.templateId,
      status: "queued",
    },
  });

  // queue SendLogs
  const logsData = bucketContacts.map((c) => ({
    campaignId: campaign.id,
    contactId: c.id,
    status: "queued",
  }));

  const result = await prisma.sendLog.createMany({ data: logsData });

  // record run
  const run = await prisma.autoCampaignRun.create({
    data: {
      autoCampaignId: auto.id,
      monthKey,
      weekdayKey,
      queuedCount: result.count,
      campaignId: campaign.id,
    },
  });

  return NextResponse.json({
    ok: true,
    forced: force,
    monthKey,
    weekdayKey,
    bucketIndex,
    contactsTotal: contacts.length,
    bucketContacts: bucketContacts.length,
    queued: result.count,
    campaignId: campaign.id,
    runId: run.id,
    et,
  });
}
