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

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (body === null || typeof body.active !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { active: boolean }" },
      { status: 400 }
    );
  }

  const campaign = await prisma.autoCampaign.update({
    where: { id },
    data: { active: body.active },
    select: { id: true, active: true, name: true },
  });

  return NextResponse.json({ ok: true, id: campaign.id, active: campaign.active, name: campaign.name });
}
