import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptPassword, decryptPassword } from "@/lib/craigslistCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const row = await prisma.craigslistSettings.findUnique({ where: { id: 1 } });
  if (!row) {
    return NextResponse.json({
      id: 1,
      email: "",
      passwordSet: false,
      city: "",
      category: "jobs/construction",
      minDelayMs: 2000,
      maxDelayMs: 5000,
    });
  }
  return NextResponse.json({
    id: row.id,
    email: row.email,
    passwordSet: !!row.passwordEncrypted,
    city: row.city,
    category: row.category,
    minDelayMs: row.minDelayMs,
    maxDelayMs: row.maxDelayMs,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { email, password, city, category, minDelayMs, maxDelayMs } = body as Record<string, unknown>;

  // Get existing to keep password if not changing
  const existing = await prisma.craigslistSettings.findUnique({ where: { id: 1 } });
  const existingDecrypted = existing ? decryptPassword(existing.passwordEncrypted) : "";

  const newPassword = typeof password === "string" && password.trim()
    ? password.trim()
    : existingDecrypted;

  const row = await prisma.craigslistSettings.upsert({
    where: { id: 1 },
    update: {
      email: typeof email === "string" ? email.trim() : (existing?.email ?? ""),
      passwordEncrypted: newPassword ? encryptPassword(newPassword) : (existing?.passwordEncrypted ?? ""),
      city: typeof city === "string" ? city.trim() : (existing?.city ?? ""),
      category: typeof category === "string" ? category : (existing?.category ?? "jobs/construction"),
      minDelayMs: Number.isFinite(Number(minDelayMs)) ? Number(minDelayMs) : (existing?.minDelayMs ?? 2000),
      maxDelayMs: Number.isFinite(Number(maxDelayMs)) ? Number(maxDelayMs) : (existing?.maxDelayMs ?? 5000),
    },
    create: {
      id: 1,
      email: typeof email === "string" ? email.trim() : "",
      passwordEncrypted: newPassword ? encryptPassword(newPassword) : "",
      city: typeof city === "string" ? city.trim() : "",
      category: typeof category === "string" ? category : "jobs/construction",
      minDelayMs: Number.isFinite(Number(minDelayMs)) ? Number(minDelayMs) : 2000,
      maxDelayMs: Number.isFinite(Number(maxDelayMs)) ? Number(maxDelayMs) : 5000,
    },
  });

  return NextResponse.json({
    id: row.id,
    email: row.email,
    passwordSet: !!row.passwordEncrypted,
    city: row.city,
    category: row.category,
    minDelayMs: row.minDelayMs,
    maxDelayMs: row.maxDelayMs,
  });
}
