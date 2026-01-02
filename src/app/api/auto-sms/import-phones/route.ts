import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  categoryId: number;
  phonesText: string; // one per line
};

function normalizePhone(raw: string) {
  // MVP: keep digits + leading +. Prefer you paste in E.164 already.
  const s = raw.trim();
  if (!s) return null;

  // If user pastes 3055551212, convert to +1... (US default)
  const digits = s.replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) return digits;

  // if 10 digits, assume US
  const onlyDigits = digits.replace(/[^\d]/g, "");
  if (onlyDigits.length === 10) return `+1${onlyDigits}`;
  if (onlyDigits.length === 11 && onlyDigits.startsWith("1")) return `+${onlyDigits}`;

  // fallback: try +<digits>
  return onlyDigits.length >= 10 ? `+${onlyDigits}` : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const categoryId = Number(body?.categoryId);
  const phonesText = String(body?.phonesText ?? "");

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }

  const lines = phonesText.split("\n").map((s) => s.trim()).filter(Boolean);
  const phones = Array.from(
    new Set(
      lines
        .map(normalizePhone)
        .filter((x): x is string => Boolean(x))
    )
  );

  if (phones.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: lines.length });
  }

  // upsert-ish: createMany skipDuplicates relies on unique constraint
  const res = await prisma.phoneContact.createMany({
    data: phones.map((phone) => ({ categoryId, phone, status: "active" })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    ok: true,
    inserted: res.count,
    totalParsed: lines.length,
    normalizedUnique: phones.length,
  });
}
