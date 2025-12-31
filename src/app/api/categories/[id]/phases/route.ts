import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idFromUrl(req: Request) {
  const parts = req.url.split("/");
  // .../categories/{id}/phases
  const idx = parts.findIndex((p) => p === "categories");
  const idStr = idx >= 0 ? parts[idx + 1] : "";
  const id = Number(idStr);
  return Number.isFinite(id) ? id : NaN;
}

export async function GET(req: Request) {
  const categoryId = idFromUrl(req);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "Invalid category id" }, { status: 400 });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  // Find max phase by checking max phaseNumber
  const maxRow = await prisma.contact.findFirst({
    where: { categoryId },
    orderBy: { phaseNumber: "desc" },
    select: { phaseNumber: true },
  });

  const maxPhase = maxRow?.phaseNumber ?? 0;
  const phases = Array.from({ length: maxPhase }, (_, i) => i + 1);

  return NextResponse.json({ maxPhase, phases, phaseSize: category.phaseSize });
}
