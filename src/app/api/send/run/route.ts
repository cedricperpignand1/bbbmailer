import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeUnsubToken } from "@/lib/unsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  campaignId: number;
  limit?: number; // how many to send this run
  dryRun?: boolean; // if true, does not send, just returns who would be sent
};

// small helper for safe DB strings
function safeStr(x: unknown) {
  return String(x ?? "").slice(0, 2000);
}

async function mailgunSend(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  listUnsubUrl?: string;
  tags?: string[];
}) {
  const API_KEY = process.env.MAILGUN_API_KEY || "";
  const DOMAIN = process.env.MAILGUN_DOMAIN || "";
  const BASE = process.env.MAILGUN_BASE_URL || "https://api.mailgun.net"; // <-- matches your env

  if (!API_KEY) throw new Error("Missing MAILGUN_API_KEY in .env");
  if (!DOMAIN) throw new Error("Missing MAILGUN_DOMAIN in .env");

  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);
  params.set("subject", opts.subject);
  params.set("html", opts.html);

  if (opts.replyTo) params.set("h:Reply-To", opts.replyTo);

  if (opts.listUnsubUrl) {
    params.set("h:List-Unsubscribe", `<${opts.listUnsubUrl}>`);
    params.set("h:List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
  }

  for (const t of opts.tags || []) {
    params.append("o:tag", t);
  }

  const auth = Buffer.from(`api:${API_KEY}`).toString("base64");
  const url = `${BASE}/v3/${DOMAIN}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      `Mailgun error ${res.status}: ${safeStr(
        (data as any)?.message || JSON.stringify(data)
      )}`
    );
  }

  return data as { id?: string; message?: string };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const campaignId = Number(body?.campaignId);
  const limit = Math.min(Math.max(Number(body?.limit ?? 25), 1), 500); // 1..500
  const dryRun = Boolean(body?.dryRun);

  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const from = process.env.MAIL_FROM || "";
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  if (!process.env.UNSUB_SECRET) {
    return NextResponse.json(
      { error: "Missing UNSUB_SECRET in .env" },
      { status: 500 }
    );
  }

  if (!from) {
    return NextResponse.json(
      { error: "Missing MAIL_FROM in .env" },
      { status: 500 }
    );
  }

  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    return NextResponse.json(
      { error: "Missing MAILGUN_API_KEY or MAILGUN_DOMAIN in .env" },
      { status: 500 }
    );
  }

  // Load campaign + template
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      category: true,
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status === "done") {
    return NextResponse.json(
      { error: "Campaign already done" },
      { status: 400 }
    );
  }

  // Pull next queued logs for this campaign
  const logs = await prisma.sendLog.findMany({
    where: {
      campaignId,
      status: "queued",
      contact: { status: "active" },
    },
    orderBy: { id: "asc" },
    take: limit,
    include: { contact: true },
  });

  if (logs.length === 0) {
    const remaining = await prisma.sendLog.count({
      where: { campaignId, status: "queued" },
    });

    if (remaining === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "done" },
      });
    }

    return NextResponse.json({
      campaignId,
      status: remaining === 0 ? "done" : campaign.status,
      message: "No queued emails to send in this batch.",
      sent: 0,
      failed: 0,
      remainingQueued: remaining,
    });
  }

  // Mark campaign as sending
  if (campaign.status === "queued" || campaign.status === "draft") {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "sending" },
    });
  }

  // DRY RUN: show recipients only
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      campaign: {
        id: campaign.id,
        category: campaign.category.name,
        phaseNumber: campaign.phaseNumber,
        template: campaign.template.name,
        subject: campaign.template.subject,
      },
      wouldSend: logs.map((l) => ({
        sendLogId: l.id,
        contactId: l.contactId,
        email: l.contact.email,
      })),
    });
  }

  const subject = campaign.template.subject;
  const baseHtml = campaign.template.html;

  let sent = 0;
  let failed = 0;

  for (const log of logs) {
    const to = log.contact.email;

    const token = makeUnsubToken(log.contactId);
    const unsubUrl = `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
      token
    )}`;

    const html = `${baseHtml}
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#777;line-height:1.4;">
  <div>You’re receiving this because you’re on our contractor list.</div>
  <div style="margin-top:8px;">
    <a href="${unsubUrl}" style="color:#777;text-decoration:underline;">Unsubscribe</a>
  </div>
</div>`;

    try {
      const mg = await mailgunSend({
        from,
        to,
        subject,
        html,
        replyTo: "support@buildersbidbook.com",
        listUnsubUrl: unsubUrl,
        tags: [`campaign:${campaignId}`],
      });

      sent++;

      await prisma.sendLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          provider: "mailgun",
          providerMessageId: safeStr(mg?.id || ""),
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (e: any) {
      failed++;

      const msg = safeStr(e?.message || e || "Unknown error");

      // Make sure failures always get recorded
      try {
        await prisma.sendLog.update({
          where: { id: log.id },
          data: {
            status: "failed",
            provider: "mailgun",
            providerMessageId: null,
            error: msg,
          },
        });
      } catch {
        // if DB write fails, still return a helpful response later
      }
    }
  }

  const remainingQueued = await prisma.sendLog.count({
    where: { campaignId, status: "queued" },
  });

  if (remainingQueued === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "done" },
    });
  }

  return NextResponse.json({
    campaignId,
    batchSize: logs.length,
    sent,
    failed,
    remainingQueued,
    campaignStatus: remainingQueued === 0 ? "done" : "sending",
  });
}
