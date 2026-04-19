import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const addresses = await prisma.craigslistAddress.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ addresses });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "load") {
    const text = typeof body.text === "string" ? body.text : "";
    const lines = text
      .split(/\r?\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    if (!lines.length) {
      return NextResponse.json({ error: "No addresses found" }, { status: 400 });
    }

    // Create new rows (skip duplicates by checking existing)
    const existing = await prisma.craigslistAddress.findMany({
      select: { address: true },
    });
    const existingSet = new Set(existing.map((r) => r.address));
    const newLines = lines.filter((l: string) => !existingSet.has(l));

    if (newLines.length > 0) {
      await prisma.craigslistAddress.createMany({
        data: newLines.map((address: string) => ({ address, status: "pending" })),
      });
    }

    const all = await prisma.craigslistAddress.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ addresses: all, added: newLines.length, skipped: lines.length - newLines.length });
  }

  if (action === "reset") {
    await prisma.craigslistAddress.updateMany({ data: { status: "pending" } });
    const all = await prisma.craigslistAddress.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ addresses: all });
  }

  if (action === "clear") {
    await prisma.craigslistAddress.deleteMany({});
    return NextResponse.json({ addresses: [] });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
