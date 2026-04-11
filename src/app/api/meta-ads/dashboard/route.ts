// src/app/api/meta-ads/dashboard/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateMetaConfig } from "@/lib/meta/metaAutomationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Automation state (singleton)
    const state = await prisma.metaAutomationState.findUnique({ where: { id: 1 } });

    // Active campaign
    let campaign = null;
    let adSets: unknown[] = [];
    let creativeVariants: unknown[] = [];
    let latestSnapshot = null;
    let latestAiReview = null;
    let recentSnapshots: unknown[] = [];

    if (state?.activeCampaignId) {
      campaign = await prisma.metaCampaign.findUnique({
        where: { id: state.activeCampaignId },
      });
    }

    // If no active campaign in state, fall back to most recent non-stopped campaign
    if (!campaign) {
      campaign = await prisma.metaCampaign.findFirst({
        where: { status: { notIn: ["stopped"] } },
        orderBy: { createdAt: "desc" },
      });
    }

    if (campaign) {
      adSets = await prisma.metaAdSet.findMany({
        where: { campaignId: campaign.id },
        include: {
          ads: {
            include: {
              variant: {
                select: { angle: true, headline: true, aiScore: true, aiVerdict: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      creativeVariants = await prisma.metaCreativeVariant.findMany({
        where: { campaignId: campaign.id },
        orderBy: { aiScore: "desc" },
      });

      latestSnapshot = await prisma.metaPerformanceSnapshot.findFirst({
        where: { campaignId: campaign.id },
        orderBy: { snappedAt: "desc" },
      });

      recentSnapshots = await prisma.metaPerformanceSnapshot.findMany({
        where: { campaignId: campaign.id },
        orderBy: { snappedAt: "desc" },
        take: 7,
      });

      latestAiReview = await prisma.metaAiReview.findFirst({
        where: { campaignId: campaign.id, type: "performance" },
        orderBy: { createdAt: "desc" },
      });
    }

    // Historical campaigns list (for reference)
    const allCampaigns = await prisma.metaCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        status: true,
        cities: true,
        dailyBudgetCents: true,
        startedAt: true,
        stoppedAt: true,
        createdAt: true,
      },
    });

    const configCheck = validateMetaConfig();

    return NextResponse.json({
      state,
      campaign,
      adSets,
      creativeVariants,
      latestSnapshot,
      recentSnapshots,
      latestAiReview,
      allCampaigns,
      configOk: configCheck.ok,
      configMissing: configCheck.missing,
    });
  } catch (err) {
    console.error("[meta-ads/dashboard]", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
