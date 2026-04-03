import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.MASS_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.MASS_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  );
}

const EMAIL_RE = /[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi;

function allMatches(text: string): string[] {
  return [...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
}

function extractBouncedEmails(message: any, senderEmail: string): string[] {
  const emails = new Set<string>();
  const payload = message?.payload;
  if (!payload) return [];
  const senderLower = senderEmail.toLowerCase();

  function addEmail(addr: string) {
    const clean = addr.trim().toLowerCase();
    if (clean.includes("@") && clean !== senderLower) emails.add(clean);
  }

  function scanHeaders(headers: any[]) {
    if (!headers) return;
    for (const h of headers) {
      const name = h.name?.toLowerCase() ?? "";
      const val: string = h.value ?? "";
      if (name === "x-failed-recipients" || name === "x-original-to") {
        for (const e of allMatches(val)) addEmail(e);
      }
      if (name === "to" || name === "delivered-to") {
        for (const e of allMatches(val)) addEmail(e);
      }
    }
  }

  function scanText(text: string) {
    for (const m of text.matchAll(
      /(?:Final|Original)-Recipient:\s*rfc822;\s*([\w.+%-]+@[\w.-]+\.[a-z]{2,})/gi
    )) addEmail(m[1]);
    for (const m of text.matchAll(
      /(?:address(?:es)? failed|undeliverable to|delivery (?:has )?failed|could not be delivered to)[\s\S]{0,300}?([\w.+%-]+@[\w.-]+\.[a-z]{2,})/gi
    )) addEmail(m[1]);
  }

  function scanPart(part: any, isEmbeddedOriginal = false) {
    if (!part) return;
    const mime: string = part.mimeType ?? "";
    scanHeaders(part.headers);
    if (isEmbeddedOriginal && part.headers) {
      for (const h of part.headers) {
        if (h.name?.toLowerCase() === "to") {
          for (const e of allMatches(h.value ?? "")) addEmail(e);
        }
      }
    }
    if (part.body?.data) {
      try {
        const text = Buffer.from(part.body.data, "base64url").toString("utf-8");
        scanText(text);
      } catch {
        try {
          const text = Buffer.from(part.body.data, "base64").toString("utf-8");
          scanText(text);
        } catch { /* ignore */ }
      }
    }
    if (part.parts) {
      for (const child of part.parts) {
        scanPart(child, isEmbeddedOriginal || mime === "message/rfc822");
      }
    }
  }

  scanHeaders(payload.headers);
  scanPart(payload);

  if (message.snippet) {
    for (const m of message.snippet.matchAll(
      /(?:to|for|address)[\s:]+<?([\w.+%-]+@[\w.-]+\.[a-z]{2,})>?/gi
    )) addEmail(m[1]);
  }

  return [...emails];
}

async function scanOneAccount(
  email: string,
  refreshToken: string
): Promise<{ scanned: number; bounced: string[]; error?: string }> {
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: client });

  let listRes;
  try {
    listRes = await gmail.users.messages.list({
      userId: "me",
      q: "from:(mailer-daemon OR postmaster) newer_than:30d",
      maxResults: 100,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (
      msg.includes("insufficient") ||
      msg.includes("scope") ||
      msg.includes("forbidden") ||
      e?.status === 403
    ) {
      return { scanned: 0, bounced: [], error: `${email}: needs read permission — re-connect.` };
    }
    return { scanned: 0, bounced: [], error: `${email}: ${msg}` };
  }

  const messages = listRes.data.messages ?? [];
  const bounced: string[] = [];

  for (const msg of messages) {
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
      bounced.push(...extractBouncedEmails(full.data, email));
    } catch { /* skip unreadable */ }
  }

  return { scanned: messages.length, bounced };
}

export async function POST() {
  try {
    const accounts = await prisma.gmailAccount.findMany({
      where: { usedForMass: true },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ error: "No accounts in sending pool" }, { status: 400 });
    }

    const allBounced = new Set<string>();
    const accountSummary: { email: string; scanned: number; bounced: number; error?: string }[] = [];

    for (const account of accounts) {
      if (!account.refreshToken) {
        accountSummary.push({ email: account.email, scanned: 0, bounced: 0, error: "Not connected" });
        continue;
      }
      const { scanned, bounced, error } = await scanOneAccount(account.email, account.refreshToken);
      for (const e of bounced) allBounced.add(e);
      accountSummary.push({ email: account.email, scanned, bounced: bounced.length, error });
    }

    let contactsMarked = 0;
    if (allBounced.size > 0) {
      const result = await prisma.contact.updateMany({
        where: { email: { in: [...allBounced] }, status: "active" },
        data: { status: "bounced" },
      });
      contactsMarked = result.count;
    }

    return NextResponse.json({
      ok: true,
      accounts: accountSummary,
      totalBouncesFound: allBounced.size,
      contactsMarked,
      bouncedEmails: [...allBounced],
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
