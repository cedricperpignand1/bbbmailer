import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SENDER_EMAIL =
  process.env.GMAIL_SENDER_EMAIL || "buildersbidbook@gmail.com";

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const EMAIL_RE = /[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi;

function allMatches(text: string): string[] {
  return [...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
}

/** Extract bounced email addresses from a Gmail message (full object with payload) */
function extractBouncedEmails(message: any): string[] {
  const emails = new Set<string>();
  const payload = message?.payload;
  if (!payload) return [];

  function addEmail(addr: string) {
    const clean = addr.trim().toLowerCase();
    if (clean.includes("@")) emails.add(clean);
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

export async function POST() {
  try {
    const account = await prisma.gmailAccount.findUnique({
      where: { email: SENDER_EMAIL },
    });

    if (!account?.refreshToken) {
      return NextResponse.json(
        { error: `Gmail not connected for ${SENDER_EMAIL}` },
        { status: 400 }
      );
    }

    const client = createOAuthClient();
    client.setCredentials({ refresh_token: account.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: client });

    const query = "from:(mailer-daemon OR postmaster) newer_than:30d";

    let listRes;
    try {
      listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 100,
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("insufficient") || msg.includes("scope") || msg.includes("forbidden") || e?.status === 403) {
        return NextResponse.json(
          { error: "Gmail account needs read permission. Click Re-connect on this page to re-authorize with the required scope, then try again." },
          { status: 400 }
        );
      }
      throw e;
    }

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) {
      return NextResponse.json({ ok: true, bouncesFound: 0, contactsMarked: 0 });
    }

    const bouncedEmails = new Set<string>();

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });
        const found = extractBouncedEmails(full.data);
        for (const e of found) bouncedEmails.add(e);
      } catch {
        // skip unreadable messages
      }
    }

    if (bouncedEmails.size === 0) {
      return NextResponse.json({ ok: true, bouncesFound: messages.length, contactsMarked: 0 });
    }

    const result = await prisma.contact.updateMany({
      where: {
        email: { in: [...bouncedEmails] },
        status: "active",
      },
      data: { status: "bounced" },
    });

    return NextResponse.json({
      ok: true,
      bouncesFound: messages.length,
      bouncedEmails: [...bouncedEmails],
      contactsMarked: result.count,
    });
  } catch (e: any) {
    const msg = String(e?.message || e || "Unknown error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
