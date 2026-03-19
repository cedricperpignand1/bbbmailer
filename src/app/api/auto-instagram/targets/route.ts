import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const targets = await prisma.instagramTarget.findMany({
      orderBy: { username: "asc" },
      include: { _count: { select: { posts: true } } },
    });
    return NextResponse.json({ targets });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const username = String(body.username || "").trim().replace(/^@/, "").toLowerCase();
  const audienceType = body.audienceType === "FOLLOWING" ? "FOLLOWING" : "FOLLOWER";
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 });

  try {
    const target = await prisma.instagramTarget.upsert({
      where: { username_audienceType: { username, audienceType } },
      update: { isActive: true, notes: notes ?? undefined },
      create: { username, audienceType, notes },
      include: { _count: { select: { posts: true } } },
    });
    return NextResponse.json({ target });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
