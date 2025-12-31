import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });

  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ categories, templates });
}
