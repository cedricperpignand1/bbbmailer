import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 10; // contacts per call — keeps the function well under 60 s
const TRUMAIL_HOST = process.env.TRUMAIL_API_HOST || "https://api.trumail.io";

interface TrumailResult {
  validFormat?: boolean;
  hostExists?: boolean;
  deliverable?: boolean;
  catchAll?: boolean;
}

/**
 * Returns true when the email is clearly undeliverable.
 * We stay conservative: only flag emails whose domain has no MX records
 * or whose format is outright invalid. SMTP-level "not deliverable" alone
 * can be a transient result, so we don't act on it unless the host is gone.
 */
function isInvalid(data: TrumailResult): boolean {
  if (data.validFormat === false) return true; // bad format
  if (data.hostExists === false) return true;  // domain has no MX records
  return false;
}

async function verifyEmail(email: string): Promise<{ invalid: boolean; reason: string }> {
  try {
    const url = `${TRUMAIL_HOST}/v2/lookup/json?email=${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // API returned an error — don't penalize the contact
      return { invalid: false, reason: `api_error:${res.status}` };
    }

    const data: TrumailResult = await res.json();
    const invalid = isInvalid(data);
    const reason = invalid
      ? data.validFormat === false
        ? "invalid_format"
        : "no_mx_records"
      : "ok";

    return { invalid, reason };
  } catch {
    // Timeout or network error — don't penalize the contact
    return { invalid: false, reason: "timeout" };
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const categoryId = Number(body.categoryId);
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

  const lastId = Number(body.lastId ?? 0);

  // Fetch next batch of active contacts after the cursor
  const contacts = await prisma.contact.findMany({
    where: {
      categoryId,
      status: "active",
      id: { gt: lastId },
    },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    select: { id: true, email: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ processed: 0, removed: 0, nextLastId: null, done: true });
  }

  let removed = 0;
  let nextLastId = lastId;

  for (const contact of contacts) {
    const { invalid } = await verifyEmail(contact.email);

    if (invalid) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { status: "bounced" },
      });
      removed++;
    }

    nextLastId = contact.id;
  }

  // If fewer contacts than BATCH_SIZE returned, we've reached the end
  const done = contacts.length < BATCH_SIZE;

  return NextResponse.json({
    processed: contacts.length,
    removed,
    nextLastId: done ? null : nextLastId,
    done,
  });
}
