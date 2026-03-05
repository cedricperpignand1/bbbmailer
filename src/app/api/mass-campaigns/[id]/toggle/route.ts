import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const active = Boolean(body?.active);

  const campaign = await prisma.massCampaign.update({
    where: { id },
    data: { active },
  });

  return NextResponse.json({ ok: true, campaign });
}
