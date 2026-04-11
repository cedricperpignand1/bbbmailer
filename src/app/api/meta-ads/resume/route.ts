// src/app/api/meta-ads/resume/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resumeCampaign } from "@/lib/meta/metaCampaignService";
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
      return NextResponse.json({ error: "No campaign to resume" }, { status: 400 });
    }

    await resumeCampaign(campaignId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[meta-ads/resume]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
