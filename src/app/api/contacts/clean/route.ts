import { NextResponse } from "next/server";
import { promises as dns } from "dns";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function verifyEmail(email: string): Promise<{ invalid: boolean; reason: string }> {
  if (!EMAIL_REGEX.test(email)) {
    return { invalid: true, reason: "invalid_format" };
  }

  const domain = email.split("@")[1].toLowerCase();

  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return { invalid: true, reason: "no_mx_records" };
    }
    return { invalid: false, reason: "ok" };
  } catch {
    // ENOTFOUND = domain doesn't exist; ENODATA = no MX records
    return { invalid: true, reason: "no_mx_records" };
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const categoryId = Number(body.categoryId);
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

  const lastId = Number(body.lastId ?? 0);

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

  // Verify all emails in parallel
  const results = await Promise.all(
    contacts.map((c) => verifyEmail(c.email).then((r) => ({ ...c, ...r })))
  );

  const invalid = results.filter((r) => r.invalid);

  if (invalid.length > 0) {
    await prisma.contact.updateMany({
      where: { id: { in: invalid.map((r) => r.id) } },
      data: { status: "bounced" },
    });
  }

  const nextLastId = contacts[contacts.length - 1].id;
  const done = contacts.length < BATCH_SIZE;

  return NextResponse.json({
    processed: contacts.length,
    removed: invalid.length,
    nextLastId: done ? null : nextLastId,
    done,
  });
}
