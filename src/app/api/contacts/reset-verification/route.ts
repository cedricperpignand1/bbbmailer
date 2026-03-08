import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const categoryId = Number(body?.categoryId);
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

  await prisma.contact.updateMany({
    where: { categoryId },
    data: { emailVerifiedAt: null },
  });

  return NextResponse.json({ ok: true });
}
