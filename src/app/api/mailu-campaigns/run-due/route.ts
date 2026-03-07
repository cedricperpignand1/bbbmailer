import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaMail, isHardBounce } from "@/lib/mailu-smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 20; // contacts per cron run (~2-3 min at 5-10s pacing)

// ── Helpers ─────────────────────────────────────────────────────────────────

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
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
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

function renderTemplate(template: string, vars: Record<string, string>): string {
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

/** Returns today's send limit based on warmup schedule and start date. */
function getDailyLimit(campaign: {
  maxPerDay: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupSchedule: string;
}): { limit: number; warmupDay: number } {
  if (!campaign.warmupEnabled || !campaign.warmupStartDate) {
    return { limit: campaign.maxPerDay, warmupDay: 0 };
  }

  const schedule = campaign.warmupSchedule
    .split(",")
    .map(Number)
    .filter((n) => n > 0);

  const msSinceStart = Date.now() - campaign.warmupStartDate.getTime();
  const warmupDay = Math.floor(msSinceStart / (1000 * 60 * 60 * 24)) + 1;

  const limit =
    warmupDay <= schedule.length ? schedule[warmupDay - 1] : campaign.maxPerDay;

  return { limit, warmupDay };
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  // Auth: only block if a key is configured AND the wrong key is provided
  const key = url.searchParams.get("key") || "";
  const expected = process.env.AUTO_CRON_KEY || "";
  if (expected && key && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const et = getETParts();

  if (!force && !isWeekday(et.weekday)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Weekend — weekdays only",
      weekday: et.weekday,
    });
  }

  const dateET = etDateString(et);
  const campaigns = await prisma.mailuCampaign.findMany({ where: { active: true } });

  if (campaigns.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No active campaigns", dateET });
  }

  // Load suppressed emails once (shared across all campaigns this run)
  const suppressedRows = await prisma.mailuSuppression.findMany({ select: { email: true } });
  const suppressedEmails = suppressedRows.map((r) => r.email);

  const results: object[] = [];

  for (const campaign of campaigns) {
    // ── Time check ────────────────────────────────────────────────────────
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

    // ── Daily limit check ─────────────────────────────────────────────────
    const { limit: dailyLimit, warmupDay } = getDailyLimit(campaign);

    const existingRun = await prisma.mailuCampaignDailyRun.findFirst({
      where: { campaignId: campaign.id, dateET },
    });
    const sentToday = existingRun?.sentCount ?? 0;

    if (sentToday >= dailyLimit) {
      results.push({
        campaignId: campaign.id,
        skipped: true,
        reason: `Daily limit reached (${sentToday}/${dailyLimit})`,
        warmupDay,
        dailyLimit,
        dateET,
      });
      continue;
    }

    // ── Template resolution ───────────────────────────────────────────────
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
        reason: "No template configured",
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

    // ── Fetch eligible contacts ───────────────────────────────────────────
    const remaining = dailyLimit - sentToday;
    const batchLimit = Math.min(BATCH_SIZE, remaining);

    const sentRows = await prisma.mailuCampaignSend.findMany({
      where: { campaignId: campaign.id },
      select: { contactId: true },
    });
    const sentIds = sentRows.map((r) => r.contactId);

    const contacts = await prisma.contact.findMany({
      where: {
        categoryId: campaign.categoryId,
        status: "active",
        ...(sentIds.length > 0 ? { id: { notIn: sentIds } } : {}),
        ...(suppressedEmails.length > 0 ? { email: { notIn: suppressedEmails } } : {}),
      },
      orderBy: { id: "asc" },
      take: batchLimit,
    });

    if (contacts.length === 0) {
      results.push({
        campaignId: campaign.id,
        skipped: true,
        reason: "No eligible contacts remaining",
        sentToday,
        dailyLimit,
        warmupDay,
        dateET,
      });
      continue;
    }

    // ── Send loop ─────────────────────────────────────────────────────────
    let sent = 0;
    let failed = 0;
    let bounced = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const project = pickRandom(addresses);
      const firstName = contact.firstName || "there";
      const vars = { firstName, project, address: project };
      const subject = renderTemplate(tmplSubject, vars);
      const body = renderTemplate(tmplBody, vars);

      try {
        const result = await sendViaMail({ to: contact.email, subject, body, contentType });
        await prisma.mailuCampaignSend.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: "SENT",
            sentAt: new Date(),
            projectUsed: project,
            messageId: result.messageId ?? null,
          },
        });
        sent++;
      } catch (e: unknown) {
        const errMsg = String((e as { message?: string })?.message ?? e ?? "Unknown error").slice(
          0,
          1000
        );
        const hard = isHardBounce(e);

        await prisma.mailuCampaignSend.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: hard ? "BOUNCED" : "FAILED",
            projectUsed: project,
            error: errMsg,
          },
        });

        if (hard) {
          // Suppress this email globally so future campaigns skip it
          await prisma.mailuSuppression.upsert({
            where: { email: contact.email },
            create: { email: contact.email, type: "HARD_BOUNCE", detail: errMsg },
            update: { type: "HARD_BOUNCE", detail: errMsg },
          });
          suppressedEmails.push(contact.email); // keep in-memory set current
          bounced++;
        } else {
          failed++;
        }
      }

      // Pace sends — random jitter between 5 and 10 seconds
      if (i < contacts.length - 1) {
        const ms = 5000 + Math.floor(Math.random() * 5000);
        await sleep(ms);
      }
    }

    // ── Record daily run (upsert → accumulate across batches) ─────────────
    await prisma.mailuCampaignDailyRun.upsert({
      where: { campaignId_dateET: { campaignId: campaign.id, dateET } },
      create: {
        campaignId: campaign.id,
        dateET,
        sentCount: sent,
        failedCount: failed,
        bouncedCount: bounced,
        warmupDay,
        dailyLimit,
      },
      update: {
        sentCount: { increment: sent },
        failedCount: { increment: failed },
        bouncedCount: { increment: bounced },
      },
    });

    results.push({
      campaignId: campaign.id,
      batchSent: sent,
      batchFailed: failed,
      batchBounced: bounced,
      sentToday: sentToday + sent,
      dailyLimit,
      warmupDay,
      dateET,
    });
  }

  return NextResponse.json({ ok: true, dateET, et, results });
}
