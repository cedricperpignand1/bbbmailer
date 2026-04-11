// src/app/api/meta-ads/creatives/generate/route.ts
// Manually trigger creative refresh for the active campaign.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshCreativesForCampaign, type CreativeAngle } from "@/lib/meta/metaCreativeService";
import { judgeAllVariants } from "@/lib/meta/metaAiJudgeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { campaignId?: string };

    let campaignId = body.campaignId;
    if (!campaignId) {
      const state = await prisma.metaAutomationState.findUnique({ where: { id: 1 } });
      campaignId = state?.activeCampaignId ?? undefined;
    }
    if (!campaignId) {
      return NextResponse.json({ error: "No active campaign" }, { status: 400 });
    }

    // Find currently used angles to rotate away from them
    const activeVariants = await prisma.metaCreativeVariant.findMany({
      where: { campaignId, isActive: true },
      select: { angle: true },
    });
    const usedAngles = activeVariants.map((v: { angle: string }) => v.angle as CreativeAngle);

    const newVariantIds = await refreshCreativesForCampaign(campaignId, usedAngles);
    const judgeResult = await judgeAllVariants(campaignId);

    return NextResponse.json({
      ok: true,
      newVariantsGenerated: newVariantIds.length,
      judgeResult,
    });
  } catch (err) {
    console.error("[meta-ads/creatives/generate]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
