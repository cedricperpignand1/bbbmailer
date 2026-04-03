import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaGmailAccountById } from "@/lib/mass-gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Batch size per account per cron tick.
 * With ~3–8s pacing and 3 accounts × 12 = 36 emails, fits well within 300s.
 */
const BATCH_SIZE_PER_ACCOUNT = 12;

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
    w.startsWith("mon") || w.startsWith("tue") || w.startsWith("wed") ||
    w.startsWith("thu") || w.startsWith("fri")
  );
}

function etDateString(et: { year: number; month: number; day: number }) {
  return `${et.year}-${String(et.month).padStart(2, "0")}-${String(et.day).padStart(2, "0")}`;
}

function parseAddresses(text: string): string[] {
  return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
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

function humanDelay(): number {
  const r = Math.random();
  if (r < 0.05) return 15000 + Math.random() * 15000; // 5%  → 15–30s
  if (r < 0.20) return 8000 + Math.random() * 7000;   // 15% → 8–15s
  return 3000 + Math.random() * 5000;                  // 80% → 3–8s
}

function isHardBounce(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return (
    /\b55[0-9]\b/.test(errMsg) ||
    lower.includes("no such user") ||
    lower.includes("user does not exist") ||
    lower.includes("user unknown") ||
    lower.includes("address not found") ||
    lower.includes("mailbox not found") ||
    lower.includes("invalid recipient") ||
    lower.includes("recipient address rejected") ||
    lower.includes("does not exist") ||
    lower.includes("undeliverable") ||
    /5\.\d\.\d/.test(errMsg)
  );
}

/**
 * Returns the effective daily limit for an account based on its warmup schedule.
 */
function getAccountDailyLimit(account: {
  maxPerDay: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupSchedule: string;
}): { limit: number; warmupDay: number } {
  if (!account.warmupEnabled || !account.warmupStartDate) {
    return { limit: account.maxPerDay, warmupDay: 0 };
  }

  const schedule = account.warmupSchedule
    .split(",")
    .map(Number)
    .filter((n) => n > 0);

  const msSinceStart = Date.now() - account.warmupStartDate.getTime();
  const warmupDay = Math.floor(msSinceStart / (1000 * 60 * 60 * 24)) + 1;
  const limit =
    warmupDay <= schedule.length ? schedule[warmupDay - 1] : account.maxPerDay;

  return { limit, warmupDay };
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const key = url.searchParams.get("key") || "";
  const expected = process.env.AUTO_CRON_KEY || "";
  if (expected && key && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const et = getETParts();

  if (!force && !isWeekday(et.weekday)) {
    return NextResponse.json({
      ok: true, skipped: true, reason: "Weekend — weekdays only", weekday: et.weekday,
    });
  }

  const dateET = etDateString(et);

  // Load the active mass campaign (single campaign design)
  const campaigns = await prisma.massCampaign.findMany({ where: { active: true } });

  if (campaigns.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No active campaigns", dateET });
  }

  // Load all Gmail accounts in the mass-send pool
  const gmailAccounts = await prisma.gmailAccount.findMany({
    where: { usedForMass: true },
    orderBy: { id: "asc" },
  });

  if (gmailAccounts.length === 0) {
    return NextResponse.json({
      ok: true, skipped: true,
      reason: "No Gmail accounts configured for mass sending. Go to /mass-campaigns and enable accounts.",
      dateET,
    });
  }

  const campaignResults: object[] = [];

  for (const campaign of campaigns) {
    // ── Time check ────────────────────────────────────────────────────────
    if (!force) {
      const nowMin = et.hour * 60 + et.minute;
      const targetMin = campaign.sendHourET * 60 + campaign.sendMinuteET;
      if (nowMin < targetMin) {
        campaignResults.push({
          campaignId: campaign.id,
          skipped: true,
          reason: `Too early — scheduled for ${String(campaign.sendHourET).padStart(2, "0")}:${String(campaign.sendMinuteET).padStart(2, "0")} ET`,
        });
        continue;
      }
    }

    if (!campaign.categoryId) {
      campaignResults.push({ campaignId: campaign.id, skipped: true, reason: "No contact list configured" });
      continue;
    }

    // ── Template resolution ───────────────────────────────────────────────
    let tmplSubject = campaign.templateSubject;
    let tmplBody = campaign.templateBody;
    let contentType: "text/plain" | "text/html" = "text/plain";

    if (campaign.templateId) {
      const dbTemplate = await prisma.template.findUnique({ where: { id: campaign.templateId } });
      if (!dbTemplate) {
        campaignResults.push({ campaignId: campaign.id, skipped: true, reason: `Template #${campaign.templateId} not found` });
        continue;
      }
      tmplSubject = dbTemplate.subject;
      tmplBody = dbTemplate.html;
      contentType = "text/html";
    }

    if (!tmplSubject && !tmplBody) {
      campaignResults.push({ campaignId: campaign.id, skipped: true, reason: "No template configured" });
      continue;
    }

    const addresses = parseAddresses(campaign.addressesText);
    if (addresses.length === 0) {
      campaignResults.push({ campaignId: campaign.id, skipped: true, reason: "No property addresses configured" });
      continue;
    }

    // ── Per-account sequential sending ───────────────────────────────────
    // Process each account one-by-one to avoid duplicate contact assignment.
    // Each account claims its slice of unsent contacts after the previous
    // account's sends are committed to the DB.

    const accountResults: object[] = [];

    for (const gmailAccount of gmailAccounts) {
      const { limit: dailyLimit, warmupDay } = getAccountDailyLimit(gmailAccount);

      // How many has this account already sent today for this campaign?
      const existingAccountRun = await prisma.massCampaignAccountDailyRun.findFirst({
        where: { campaignId: campaign.id, gmailAccountId: gmailAccount.id, dateET },
      });
      const accountSentToday = existingAccountRun?.sentCount ?? 0;

      if (accountSentToday >= dailyLimit) {
        accountResults.push({
          accountId: gmailAccount.id,
          email: gmailAccount.email,
          skipped: true,
          reason: `Daily limit reached (${accountSentToday}/${dailyLimit})`,
          warmupDay,
          dailyLimit,
        });
        continue;
      }

      const remaining = dailyLimit - accountSentToday;
      const batchLimit = Math.min(BATCH_SIZE_PER_ACCOUNT, remaining);

      // Fetch contacts already sent for this campaign (by any account, ever)
      const sentRows = await prisma.massCampaignSend.findMany({
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
          accountId: gmailAccount.id,
          email: gmailAccount.email,
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
        const body = renderTemplate(tmplBody, vars);

        try {
          const gmailResult = await sendViaGmailAccountById(gmailAccount.id, {
            to: contact.email,
            subject,
            body,
            contentType,
          });

          await prisma.massCampaignSend.create({
            data: {
              campaignId: campaign.id,
              contactId: contact.id,
              gmailAccountId: gmailAccount.id,
              status: "SENT",
              sentAt: new Date(),
              projectUsed: project,
              gmailMessageId: gmailResult.messageId ?? null,
            },
          });
          sent++;
        } catch (e: any) {
          const errMsg = String(e?.message || e || "Unknown error").slice(0, 1000);
          const bounced = isHardBounce(errMsg);

          // Use upsert to handle the unique constraint gracefully
          await prisma.massCampaignSend.upsert({
            where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
            create: {
              campaignId: campaign.id,
              contactId: contact.id,
              gmailAccountId: gmailAccount.id,
              status: "FAILED",
              projectUsed: project,
              error: errMsg,
            },
            update: {
              status: "FAILED",
              gmailAccountId: gmailAccount.id,
              error: errMsg,
            },
          });

          if (bounced) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { status: "bounced" },
            });
          }
          failed++;
        }

        if (i < contacts.length - 1) {
          await sleep(humanDelay());
        }
      }

      // Upsert per-account daily run
      await prisma.massCampaignAccountDailyRun.upsert({
        where: {
          campaignId_gmailAccountId_dateET: {
            campaignId: campaign.id,
            gmailAccountId: gmailAccount.id,
            dateET,
          },
        },
        create: {
          campaignId: campaign.id,
          gmailAccountId: gmailAccount.id,
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
        accountId: gmailAccount.id,
        email: gmailAccount.email,
        label: gmailAccount.label,
        batchSent: sent,
        batchFailed: failed,
        sentToday: accountSentToday + sent,
        dailyLimit,
        warmupDay,
      });
    }

    // Upsert overall campaign daily run (sum across all accounts this tick)
    const totalSent = accountResults.reduce(
      (sum, r: any) => sum + (r.batchSent ?? 0),
      0
    );
    const totalFailed = accountResults.reduce(
      (sum, r: any) => sum + (r.batchFailed ?? 0),
      0
    );

    await prisma.massCampaignDailyRun.upsert({
      where: { campaignId_dateET: { campaignId: campaign.id, dateET } },
      create: { campaignId: campaign.id, dateET, sentCount: totalSent, failedCount: totalFailed },
      update: {
        sentCount: { increment: totalSent },
        failedCount: { increment: totalFailed },
      },
    });

    campaignResults.push({
      campaignId: campaign.id,
      accounts: accountResults,
      totalSent,
      totalFailed,
      dateET,
    });
  }

  return NextResponse.json({ ok: true, dateET, et, campaigns: campaignResults });
}
