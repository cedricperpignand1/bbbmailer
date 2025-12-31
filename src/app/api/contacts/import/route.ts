import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Basic email validation (good enough for MVP)
function isValidEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// CSV parser (simple):
// - accepts either: one email per line
// - or full CSV with headers containing "email"
function extractEmailsFromCsv(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const first = lines[0];
  const maybeHeader = first.toLowerCase();
  const hasComma = first.includes(",");

  if (hasComma && (maybeHeader.includes("email") || maybeHeader.includes("e-mail"))) {
    const headers = first.split(",").map((h) => h.trim().toLowerCase());
    const emailIdx = headers.findIndex(
      (h) => h === "email" || h === "e-mail" || h.includes("email")
    );

    const emails: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      const raw = cols[emailIdx] || "";
      emails.push(raw);
    }
    return emails;
  }

  // Otherwise: treat each line as an email (or first column)
  return lines.map((l) => (l.includes(",") ? l.split(",")[0].trim() : l));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const categoryId = Number(body?.categoryId);
  const csvText = String(body?.csvText || "");

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const rawEmails = extractEmailsFromCsv(csvText);

  // Normalize + validate
  const normalized = rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);

  const invalid: string[] = [];
  const valid: string[] = [];

  for (const e of normalized) {
    if (!isValidEmail(e)) invalid.push(e);
    else valid.push(e);
  }

  // De-dupe within upload
  const uniqueUpload = Array.from(new Set(valid));

  const phaseSize = category.phaseSize || 500;

  // How many already exist (used for phase assignment baseline)
  const existingCount = await prisma.contact.count({
    where: { categoryId },
  });

  // ✅ IMPORTANT FIX:
  // Find existing emails in this category so createMany never hits duplicates
  const existing = await prisma.contact.findMany({
    where: {
      categoryId,
      email: { in: uniqueUpload },
    },
    select: { email: true },
  });

  const existingSet = new Set(existing.map((x) => x.email.toLowerCase()));
  const toInsertEmails = uniqueUpload.filter((e) => !existingSet.has(e));

  // Build creates; assign phase by position in category stream
  // phaseNumber = floor((existingCount + index)/phaseSize) + 1
  const toCreate = toInsertEmails.map((email, idx) => ({
    categoryId,
    email,
    phaseNumber: Math.floor((existingCount + idx) / phaseSize) + 1,
    status: "active",
  }));

  const attemptedValid = uniqueUpload.length;
  const duplicatesExact = uniqueUpload.length - toInsertEmails.length;

  // Now safe to insert without skipDuplicates
  const result = toCreate.length
    ? await prisma.contact.createMany({ data: toCreate })
    : { count: 0 };

  const inserted = result.count;

  const afterCount = await prisma.contact.count({ where: { categoryId } });
  const maxPhase = afterCount > 0 ? Math.floor((afterCount - 1) / phaseSize) + 1 : 0;

  return NextResponse.json({
    summary: {
      category: category.name,
      phaseSize,
      linesRead: rawEmails.length,
      attemptedValid,
      inserted,
      duplicatesExact,
      invalidCount: invalid.length,
      maxPhaseNow: maxPhase,
      totalContactsNow: afterCount,
    },
    invalid: invalid.slice(0, 50),
  });
}
