import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min for paced sending

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  // Auth: Vercel cron header OR manual key
  const vercelCronHeader = req.headers.get("x-vercel-cron");
  const key = url.searchParams.get("key") || "";
  const expected = process.env.AUTO_CRON_KEY || "";
  const authorizedByHeader = vercelCronHeader === "1";
  const authorizedByKey = expected && key === expected;

  if (!authorizedByHeader && !authorizedByKey && !force) {
    // In non-force mode without auth, still allow (cron calls without key on Vercel)
    // Only block if there's an expected key and it doesn't match
    if (expected && key !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const et = getETParts();

  if (!force) {
    // Must be Mon–Fri
    if (!isWeekday(et.weekday)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Weekend — no sends Mon–Fri only",
        weekday: et.weekday,
      });
    }

    // Must be within 11:00–11:05 ET
    const nowMin = et.hour * 60 + et.minute;
    const targetMin = 11 * 60;
    if (nowMin < targetMin || nowMin > targetMin + 5) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Outside 11:00–11:05 ET window",
        etTime: `${String(et.hour).padStart(2, "0")}:${String(et.minute).padStart(2, "0")}`,
      });
    }
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
    // Skip if already ran today
    const existingRun = await prisma.autoCampaignDailyRun.findFirst({
      where: { campaignId: campaign.id, dateET },
    });
    if (existingRun) {
      results.push({
        campaignId: campaign.id,
        skipped: true,
        reason: "Already ran today",
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

    // Fetch unsent contacts (not yet in AutoCampaignSend for this campaign)
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
      take: campaign.maxPerDay,
    });

    if (contacts.length === 0) {
      await prisma.autoCampaignDailyRun.create({
        data: { campaignId: campaign.id, dateET, sentCount: 0, failedCount: 0 },
      });
      results.push({
        campaignId: campaign.id,
        sent: 0,
        failed: 0,
        reason: "No unsent contacts remaining",
      });
      continue;
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const project = pickRandom(addresses);
      const firstName = contact.firstName || "there";

      const subject = renderTemplate(tmplSubject, { firstName, project });
      const body = renderTemplate(tmplBody, { firstName, project });

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

      // Pacing: 2–8 s between sends (skip after last)
      if (i < contacts.length - 1) {
        const ms = 2000 + Math.floor(Math.random() * 6000);
        await sleep(ms);
      }
    }

    await prisma.autoCampaignDailyRun.create({
      data: {
        campaignId: campaign.id,
        dateET,
        sentCount: sent,
        failedCount: failed,
      },
    });

    results.push({ campaignId: campaign.id, sent, failed, dateET });
  }

  return NextResponse.json({ ok: true, dateET, et, results });
}
