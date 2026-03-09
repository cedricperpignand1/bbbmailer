import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 12; // emails per cron run — safe within 300s limit

// ── Helpers ──────────────────────────────────────────────────────────────────

function getETParts(now = new Date()) {
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
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"), // "Mon", "Tue", ...
  };
}

function isWeekday(weekday: string) {
  const w = weekday.toLowerCase();
  return (
    w.startsWith("mon") ||
    w.startsWith("tue") ||
    w.startsWith("wed") ||
    w.startsWith("thu") ||
    w.startsWith("fri")
  );
}

function etDateString(et: { year: number; month: number; day: number }) {
  return `${et.year}-${String(et.month).padStart(2, "0")}-${String(et.day).padStart(2, "0")}`;
}

function parseAddresses(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
    out = out.replace(re, v);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Randomised human-like delay between sends — kept short to fit within 300s maxDuration */
function humanDelay(): number {
  const r = Math.random();
  if (r < 0.05) return 15000 + Math.random() * 15000; // 5 %  → 15–30 s
  if (r < 0.20) return 8000 + Math.random() * 7000;   // 15 % →  8–15 s
  return 3000 + Math.random() * 5000;                  // 80 % →  3–8 s
}

// ── Route handler ─────────────────────────────────────────────────────────────

// Vercel cron sends GET — delegate to the same handler
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  // Auth: only block if a key is configured AND a wrong key is explicitly provided
  const key = url.searchParams.get("key") || "";
  const expected = process.env.AUTO_CRON_KEY || "";
  if (expected && key && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const et = getETParts();

  // Weekday check applies to all campaigns
  if (!force && !isWeekday(et.weekday)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Weekend — weekdays only",
      weekday: et.weekday,
    });
  }

  const dateET = etDateString(et);
  const campaigns = await prisma.autoCampaign.findMany({
    where: { active: true },
  });

  if (campaigns.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "No active campaigns",
      dateET,
    });
  }

  const results: object[] = [];

  for (const campaign of campaigns) {
    // Time check: skip if before configured send time
    if (!force) {
      const nowMin = et.hour * 60 + et.minute;
      const targetMin = campaign.sendHourET * 60 + campaign.sendMinuteET;
      if (nowMin < targetMin) {
        results.push({
          campaignId: campaign.id,
          skipped: true,
          reason: `Too early — scheduled for ${String(campaign.sendHourET).padStart(2, "0")}:${String(campaign.sendMinuteET).padStart(2, "0")} ET`,
        });
        continue;
      }
    }

    // Check how many have already been sent today
    const existingRun = await prisma.autoCampaignDailyRun.findFirst({
      where: { campaignId: campaign.id, dateET },
    });
    const sentToday = existingRun ? existingRun.sentCount : 0;

    if (sentToday >= campaign.maxPerDay) {
      results.push({
        campaignId: campaign.id,
        skipped: true,
        reason: `Daily limit reached (${sentToday}/${campaign.maxPerDay})`,
        dateET,
      });
      continue;
    }

    // Resolve template: DB template takes priority over inline fields
    let tmplSubject = campaign.templateSubject;
    let tmplBody = campaign.templateBody;
    let contentType: "text/plain" | "text/html" = "text/plain";

    if (campaign.templateId) {
      const dbTemplate = await prisma.template.findUnique({
        where: { id: campaign.templateId },
      });
      if (!dbTemplate) {
        results.push({
          campaignId: campaign.id,
          skipped: true,
          reason: `Template #${campaign.templateId} not found`,
        });
        continue;
      }
      tmplSubject = dbTemplate.subject;
      tmplBody = dbTemplate.html;
      contentType = "text/html";
    }

    if (!tmplSubject && !tmplBody) {
      results.push({
        campaignId: campaign.id,
        skipped: true,
        reason: "No template configured (set a template or inline subject/body)",
      });
      continue;
    }

    const addresses = parseAddresses(campaign.addressesText);
    if (addresses.length === 0) {
      results.push({
        campaignId: campaign.id,
        skipped: true,
        reason: "No property addresses configured",
      });
      continue;
    }

    // Fetch unsent contacts — only up to the remaining daily quota, capped at BATCH_SIZE
    const remaining = campaign.maxPerDay - sentToday;
    const batchLimit = Math.min(BATCH_SIZE, remaining);

    const sentRows = await prisma.autoCampaignSend.findMany({
      where: { campaignId: campaign.id },
      select: { contactId: true },
    });
    const sentIds = sentRows.map((r) => r.contactId);

    const contacts = await prisma.contact.findMany({
      where: {
        categoryId: campaign.categoryId,
        status: "active",
        ...(sentIds.length > 0 ? { id: { notIn: sentIds } } : {}),
      },
      orderBy: { id: "asc" },
      take: batchLimit,
    });

    if (contacts.length === 0) {
      // Record an empty run so the page shows "ran today" instead of "pending"
      await prisma.autoCampaignDailyRun.upsert({
        where: { campaignId_dateET: { campaignId: campaign.id, dateET } },
        create: { campaignId: campaign.id, dateET, sentCount: 0, failedCount: 0 },
        update: {},
      });
      results.push({
        campaignId: campaign.id,
        sent: 0,
        failed: 0,
        reason: "No unsent contacts remaining",
        dateET,
      });
      continue;
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const project = pickRandom(addresses);
      const firstName = contact.firstName || "there";

      const vars = { firstName, project, address: project };
      const subject = renderTemplate(tmplSubject, vars);
      const body = renderTemplate(tmplBody, vars);

      try {
        const gmailResult = await sendViaGmail({
          to: contact.email,
          subject,
          body,
          contentType,
        });

        await prisma.autoCampaignSend.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: "SENT",
            sentAt: new Date(),
            projectUsed: project,
            gmailMessageId: gmailResult.messageId ?? null,
          },
        });
        sent++;
      } catch (e: any) {
        const errMsg = String(e?.message || e || "Unknown error").slice(0, 1000);
        await prisma.autoCampaignSend.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: "FAILED",
            projectUsed: project,
            error: errMsg,
          },
        });
        failed++;
      }

      if (i < contacts.length - 1) {
        await sleep(humanDelay());
      }
    }

    // Upsert daily run — increment counts so each batch accumulates
    await prisma.autoCampaignDailyRun.upsert({
      where: { campaignId_dateET: { campaignId: campaign.id, dateET } },
      create: { campaignId: campaign.id, dateET, sentCount: sent, failedCount: failed },
      update: {
        sentCount: { increment: sent },
        failedCount: { increment: failed },
      },
    });

    results.push({
      campaignId: campaign.id,
      batchSent: sent,
      batchFailed: failed,
      sentToday: sentToday + sent,
      dailyLimit: campaign.maxPerDay,
      dateET,
    });
  }

  return NextResponse.json({ ok: true, dateET, et, results });
}
