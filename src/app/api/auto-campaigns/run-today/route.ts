import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function weekdayKeyFromEtParts(p: { weekday: string }) {
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
  return null;
}

function getEtParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second ?? "0"),
    weekday: map.weekday || "Mon",
  };
}

function minutes(h: number, m: number) {
  return h * 60 + m;
}

function yyyyMmDdFromEt(et: { year: number; month: number; day: number }) {
  const y = et.year;
  const mo = String(et.month).padStart(2, "0");
  const d = String(et.day).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

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

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
) {
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  for (let i = 0; i < 5; i++) {
    const z = getZonedParts(utc, timeZone);

    const actualLocalEpoch = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
    const desiredLocalEpoch = Date.UTC(year, month - 1, day, hour, minute, second);

    const diffMs = desiredLocalEpoch - actualLocalEpoch;
    if (Math.abs(diffMs) < 1000) break;

    utc = new Date(utc.getTime() + diffMs);
  }

  return utc;
}

function parseAddresses(addressesText: string) {
  return String(addressesText || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5000);
}

function yyyymmddNumber(runDateET: string) {
  const n = Number(String(runDateET).replaceAll("-", ""));
  return Number.isFinite(n) ? n : 0;
}

function pickAddress(addresses: string[], contactId: number, runDateET: string) {
  if (!addresses.length) return "";
  const seed = contactId * 31 + yyyymmddNumber(runDateET);
  const idx = ((seed % addresses.length) + addresses.length) % addresses.length;
  return addresses[idx];
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const et = getEtParts(new Date());
  const weekdayKey = weekdayKeyFromEtParts({ weekday: et.weekday });
  const bucketIndex = bucketIndexForWeekday(weekdayKey);

  if (bucketIndex === null) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "Weekend (no Mon–Fri run)", weekdayKey, et },
      { status: 200 }
    );
  }

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

  if (!auto.windowStartET || !auto.windowEndET) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AutoCampaign windowStartET/windowEndET not set. Open Auto Campaign settings and click Save to start a new 30-day window.",
        autoCampaignId: auto.id,
      },
      { status: 400 }
    );
  }

  const runDateET = yyyyMmDdFromEt(et);

  if (!force) {
    const todayMidnightET_UTC = zonedTimeToUtc(et.year, et.month, et.day, 0, 0, 0, ET_TZ);

    const inWindow =
      todayMidnightET_UTC.getTime() >= new Date(auto.windowStartET).getTime() &&
      todayMidnightET_UTC.getTime() < new Date(auto.windowEndET).getTime();

    if (!inWindow) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "Outside 30-day window",
          runDateET,
          weekdayKey,
          et,
          window: { windowStartET: auto.windowStartET, windowEndET: auto.windowEndET },
        },
        { status: 200 }
      );
    }

    const nowMin = minutes(et.hour, et.minute);
    const schedMin = minutes(Number(auto.sendHourET), Number(auto.sendMinuteET));
    const diff = Math.abs(nowMin - schedMin);

    if (diff > 10) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "Outside scheduled time window (+/-10m)",
          runDateET,
          weekdayKey,
          et,
          scheduled: { hour: auto.sendHourET, minute: auto.sendMinuteET },
          diffMinutes: diff,
        },
        { status: 200 }
      );
    }
  }

  const existingRun = await prisma.autoCampaignRun.findFirst({
    where: { autoCampaignId: auto.id, runDateET },
  });

  if (existingRun) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "Already ran for this ET date",
        existingRun,
        runDateET,
        weekdayKey,
        et,
      },
      { status: 200 }
    );
  }

  const template = await prisma.template.findUnique({ where: { id: auto.templateId } });
  if (!template) {
    return NextResponse.json(
      { error: "AutoCampaign template not found. Re-save AutoCampaign settings." },
      { status: 400 }
    );
  }

  const addresses = parseAddresses(auto.addressesText);
  if (addresses.length === 0) {
    return NextResponse.json(
      { error: "AutoCampaign addressesText is empty. Paste one address per line and Save." },
      { status: 400 }
    );
  }

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

  const bucketContacts = contacts.filter((c) => c.id % 5 === bucketIndex);

  if (bucketContacts.length === 0) {
    const run = await prisma.autoCampaignRun.create({
      data: { autoCampaignId: auto.id, runDateET, weekdayKey, queuedCount: 0 },
    });

    return NextResponse.json({
      ok: true,
      queued: 0,
      campaignId: null,
      runId: run.id,
      runDateET,
      weekdayKey,
      bucketIndex,
      contactsTotal: contacts.length,
      bucketContacts: 0,
      et,
      note: "Bucket had 0 contacts",
      forced: force,
    });
  }

  const campaign = await prisma.campaign.create({
    data: {
      categoryId: auto.categoryId,
      phaseNumber: 999,
      templateId: auto.templateId,
      status: "queued",
    },
  });

  const logsData = bucketContacts.map((c) => {
    const address = pickAddress(addresses, c.id, runDateET);
    return {
      campaignId: campaign.id,
      contactId: c.id,
      status: "queued",
      meta: { address },
    };
  });

  const result = await prisma.sendLog.createMany({ data: logsData });

  const run = await prisma.autoCampaignRun.create({
    data: {
      autoCampaignId: auto.id,
      runDateET,
      weekdayKey,
      queuedCount: result.count,
      campaignId: campaign.id,
    },
  });

  return NextResponse.json({
    ok: true,
    forced: force,
    runDateET,
    weekdayKey,
    bucketIndex,
    contactsTotal: contacts.length,
    bucketContacts: bucketContacts.length,
    queued: result.count,
    campaignId: campaign.id,
    runId: run.id,
    et,
    window: { windowStartET: auto.windowStartET, windowEndET: auto.windowEndET },
    addressesCount: addresses.length,
  });
}
