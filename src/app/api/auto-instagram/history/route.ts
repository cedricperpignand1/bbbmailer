import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, parseInt(searchParams.get("limit") || "100"));

  try {
    const logs = await prisma.engagementLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        task: {
          include: {
            target: { select: { username: true } },
            post: { select: { postId: true, postUrl: true } },
            plan: { select: { date: true } },
          },
        },
      },
    });

    return NextResponse.json({ logs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
