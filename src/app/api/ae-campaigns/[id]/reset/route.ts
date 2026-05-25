import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const campaign = await prisma.autoCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const [sends, runs] = await Promise.all([
    prisma.autoCampaignSend.deleteMany({ where: { campaignId: id } }),
    prisma.autoCampaignDailyRun.deleteMany({ where: { campaignId: id } }),
  ]);

  return NextResponse.json({ ok: true, deletedSends: sends.count, deletedRuns: runs.count });
}
