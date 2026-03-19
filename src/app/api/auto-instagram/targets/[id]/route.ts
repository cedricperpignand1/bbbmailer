import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const targetId = parseInt(id);
  if (isNaN(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  try {
    const data: { isActive?: boolean; notes?: string | null } = {};
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;

    const target = await prisma.instagramTarget.update({
      where: { id: targetId },
      data,
      include: { _count: { select: { posts: true } } },
    });
    return NextResponse.json({ target });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const targetId = parseInt(id);
  if (isNaN(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    await prisma.instagramTarget.delete({ where: { id: targetId } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
