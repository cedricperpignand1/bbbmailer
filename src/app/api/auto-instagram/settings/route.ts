import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const dailyGoal = Math.max(1, Math.min(500, Number(body.dailyGoal) || 50));
  const startTime = String(body.startTime || "09:00").slice(0, 5);
  const endTime = String(body.endTime || "17:00").slice(0, 5);
  const includeFollowers = body.includeFollowers !== false;
  const includeFollowing = body.includeFollowing !== false;

  try {
    const existing = await prisma.instagramWorkspaceSettings.findFirst({
      orderBy: { id: "asc" },
    });

    const settings = existing
      ? await prisma.instagramWorkspaceSettings.update({
          where: { id: existing.id },
          data: { dailyGoal, startTime, endTime, includeFollowers, includeFollowing },
        })
      : await prisma.instagramWorkspaceSettings.create({
          data: { dailyGoal, startTime, endTime, includeFollowers, includeFollowing },
        });

    return NextResponse.json({ settings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
