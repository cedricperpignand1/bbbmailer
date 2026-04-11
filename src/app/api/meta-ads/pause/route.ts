// src/app/api/meta-ads/pause/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pauseCampaign } from "@/lib/meta/metaCampaignService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { campaignId?: string };

    let campaignId = body.campaignId;
    if (!campaignId) {
      const state = await prisma.metaAutomationState.findUnique({ where: { id: 1 } });
      campaignId = state?.activeCampaignId ?? undefined;
    }
    if (!campaignId) {
      return NextResponse.json({ error: "No active campaign to pause" }, { status: 400 });
    }

    await pauseCampaign(campaignId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[meta-ads/pause]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
