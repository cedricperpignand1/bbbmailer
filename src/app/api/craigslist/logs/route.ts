import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") || "100"), 500);

  const logs = await prisma.craigslistPostLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({ logs });
}

export async function DELETE() {
  await prisma.craigslistPostLog.deleteMany({});
  return NextResponse.json({ ok: true });
}
