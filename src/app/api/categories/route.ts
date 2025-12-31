import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { contacts: true } },
    },
  });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();

  if (!name) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const phaseSize = Number(body?.phaseSize || 500);
  const cleanPhaseSize = Number.isFinite(phaseSize) && phaseSize > 0 ? phaseSize : 500;

  try {
    const category = await prisma.category.create({
      data: { name, phaseSize: cleanPhaseSize },
    });
    return NextResponse.json({ category });
  } catch (e: any) {
    // Unique name constraint
    if (String(e?.message || "").toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
