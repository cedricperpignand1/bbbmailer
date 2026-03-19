import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  try {
    const [settings, todaysPlan, targets, postCount] = await Promise.all([
      prisma.instagramWorkspaceSettings.findFirst({
        orderBy: { id: "asc" },
      }),
      prisma.dailyEngagementPlan.findUnique({
        where: { date: todayStr() },
        include: {
          tasks: {
            include: {
              target: true,
              post: true,
            },
            orderBy: { scheduledAt: "asc" },
          },
        },
      }),
      prisma.instagramTarget.findMany({
        orderBy: { username: "asc" },
        include: { _count: { select: { posts: true } } },
      }),
      prisma.instagramPost.count(),
    ]);

    return NextResponse.json({ settings, todaysPlan, targets, postCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
