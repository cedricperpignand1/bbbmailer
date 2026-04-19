import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body?.content) return NextResponse.json({ error: "content required" }, { status: 400 });

  const tpl = await prisma.craigslistTemplate.update({
    where: { id: numId },
    data: { content: String(body.content) },
  });
  return NextResponse.json(tpl);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await prisma.craigslistTemplate.delete({ where: { id: numId } });
  return NextResponse.json({ ok: true });
}
