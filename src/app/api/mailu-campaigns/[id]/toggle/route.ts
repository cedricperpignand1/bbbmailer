import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const active = Boolean(body?.active);

  const existing = await prisma.mailuCampaign.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Set warmupStartDate when activating for the first time
  const shouldSetStart =
    active && existing.warmupEnabled && !existing.warmupStartDate && !existing.active;

  const campaign = await prisma.mailuCampaign.update({
    where: { id },
    data: {
      active,
      ...(shouldSetStart ? { warmupStartDate: new Date() } : {}),
    },
  });

  return NextResponse.json({ ok: true, campaign });
}
