import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keywords = await prisma.filterKeyword.findMany({ orderBy: { keyword: "asc" } });
  return NextResponse.json({ keywords });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const keyword = (body?.keyword ?? "").trim().toLowerCase();
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  try {
    const kw = await prisma.filterKeyword.create({ data: { keyword } });
    return NextResponse.json({ keyword: kw });
  } catch {
    return NextResponse.json({ error: "Keyword already exists" }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.filterKeyword.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
