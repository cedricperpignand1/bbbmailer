import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaGmassAccount, getGmassAccounts, getAccountDailyLimit } from "@/lib/gmass";
import { unsubscribeFooter } from "@/lib/unsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE_PER_ACCOUNT = 70; // emails per account per cron run — 70 x 2 accounts = 140/tick; any remainder rolls to the next tick

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

/** Randomised human-like delay between sends — tightened so 35/account still fits within 300s maxDuration */
function humanDelay(): number {
  const r = Math.random();
  if (r < 0.02) return 6000 + Math.random() * 6000;  // 2 %  →  6–12 s
  if (r < 0.10) return 3000 + Math.random() * 3000;  // 8 %  →  3–6 s
  return 1000 + Math.random() * 2000;                 // 90 % →  1–3 s
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
  const BBB_EMAIL = process.env.GMAIL_SENDER_EMAIL || "buildersbidbook@gmail.com";

  // gmailAccountEmail is a discriminator shared with AE Campaigns' rows in this
  // same table (see /api/ae-campaigns) — scope to just the main brand's campaigns.
  const campaigns = await prisma.autoCampaign.findMany({
    where: { active: true, gmailAccountEmail: BBB_EMAIL },
  });

  if (campaigns.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "No active campaigns",
      dateET,
    });
  }

  const gmassAccounts = (await getGmassAccounts()).filter((a) => a.active && a.apiKey);

  if (gmassAccounts.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "No GMass accounts configured. Go to /auto-campaigns and connect gmass1/gmass2.",
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

    // ── Per-account sequential sending (round robin across gmass1/gmass2) ──
    // Each account claims its slice of unsent contacts after the previous
    // account's sends are committed to the DB, and can send up to
    // campaign.maxPerDay itself (so 2 accounts ~= 2x the campaign's daily volume).
    const accountResults: object[] = [];

    for (const gmassAccount of gmassAccounts) {
      const { limit: accountLimit, warmupDay } = getAccountDailyLimit(gmassAccount);
      const dailyLimit = Math.min(accountLimit, campaign.maxPerDay);

      const existingAccountRun = await prisma.autoCampaignAccountDailyRun.findFirst({
        where: { campaignId: campaign.id, gmassAccountId: gmassAccount.id, dateET },
      });
      const accountSentToday = existingAccountRun?.sentCount ?? 0;

      if (accountSentToday >= dailyLimit) {
        accountResults.push({
          accountKey: gmassAccount.key,
          skipped: true,
          reason: `Daily limit reached (${accountSentToday}/${dailyLimit})`,
          warmupDay,
          dailyLimit,
        });
        continue;
      }

      const remaining = dailyLimit - accountSentToday;
      const batchLimit = Math.min(BATCH_SIZE_PER_ACCOUNT, remaining);

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
        accountResults.push({
          accountKey: gmassAccount.key,
          sent: 0,
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

        const vars = { firstName, project, address: project };
        const subject = renderTemplate(tmplSubject, vars);

        try {
          const body = renderTemplate(tmplBody, vars) + unsubscribeFooter(contact.id, contentType);
          const sendResult = await sendViaGmassAccount(gmassAccount, {
            to: contact.email,
            subject,
            body,
            contentType,
          });

          await prisma.autoCampaignSend.create({
            data: {
              campaignId: campaign.id,
              contactId: contact.id,
              gmassAccountId: gmassAccount.id,
              status: "SENT",
              sentAt: new Date(),
              projectUsed: project,
              providerMessageId: sendResult.messageId,
            },
          });
          sent++;
        } catch (e: any) {
          const errMsg = String(e?.message || e || "Unknown error").slice(0, 1000);
          await prisma.autoCampaignSend.create({
            data: {
              campaignId: campaign.id,
              contactId: contact.id,
              gmassAccountId: gmassAccount.id,
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

      await prisma.autoCampaignAccountDailyRun.upsert({
        where: {
          campaignId_gmassAccountId_dateET: {
            campaignId: campaign.id,
            gmassAccountId: gmassAccount.id,
            dateET,
          },
        },
        create: {
          campaignId: campaign.id,
          gmassAccountId: gmassAccount.id,
          dateET,
          sentCount: sent,
          failedCount: failed,
          warmupDay,
          dailyLimit,
        },
        update: {
          sentCount: { increment: sent },
          failedCount: { increment: failed },
        },
      });

      accountResults.push({
        accountKey: gmassAccount.key,
        batchSent: sent,
        batchFailed: failed,
        sentToday: accountSentToday + sent,
        dailyLimit,
        warmupDay,
      });
    }

    const totalSent = accountResults.reduce((sum, r: any) => sum + (r.batchSent ?? 0), 0);
    const totalFailed = accountResults.reduce((sum, r: any) => sum + (r.batchFailed ?? 0), 0);

    // Upsert overall campaign daily run (sum across both accounts this tick)
    await prisma.autoCampaignDailyRun.upsert({
      where: { campaignId_dateET: { campaignId: campaign.id, dateET } },
      create: { campaignId: campaign.id, dateET, sentCount: totalSent, failedCount: totalFailed },
      update: {
        sentCount: { increment: totalSent },
        failedCount: { increment: totalFailed },
      },
    });

    results.push({
      campaignId: campaign.id,
      accounts: accountResults,
      totalSent,
      totalFailed,
      dateET,
    });
  }

  return NextResponse.json({ ok: true, dateET, et, results });
}
