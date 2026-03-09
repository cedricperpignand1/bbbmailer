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

/** Extract bounced email addresses from a Gmail message payload */
function extractBouncedEmails(payload: any): string[] {
  const emails = new Set<string>();

  function scanPart(part: any) {
    if (!part) return;

    if (part.headers) {
      for (const h of part.headers) {
        if (h.name?.toLowerCase() === "x-failed-recipients") {
          for (const addr of h.value.split(",")) {
            const m = addr.trim().match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
            if (m) emails.add(m[0].toLowerCase());
          }
        }
      }
    }

    if (part.body?.data) {
      try {
        const text = Buffer.from(part.body.data, "base64").toString("utf-8");

        const finalRecipient = text.matchAll(
          /Final-Recipient:\s*rfc822;\s*([\w.+%-]+@[\w.-]+\.[a-z]{2,})/gi
        );
        for (const m of finalRecipient) emails.add(m[1].toLowerCase());

        const origRecipient = text.matchAll(
          /Original-Recipient:\s*rfc822;\s*([\w.+%-]+@[\w.-]+\.[a-z]{2,})/gi
        );
        for (const m of origRecipient) emails.add(m[1].toLowerCase());

        const failedAddr = text.matchAll(
          /(?:address(?:es)? failed|undeliverable to|delivery has failed)[\s\S]{0,200}?([\w.+%-]+@[\w.-]+\.[a-z]{2,})/gi
        );
        for (const m of failedAddr) emails.add(m[1].toLowerCase());
      } catch {
        // ignore decode errors
      }
    }

    if (part.parts) {
      for (const child of part.parts) scanPart(child);
    }
  }

  scanPart(payload);
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
        const found = extractBouncedEmails(full.data.payload);
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
