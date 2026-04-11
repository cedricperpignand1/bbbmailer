// src/app/api/meta-ads/launch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { launchCampaign } from "@/lib/meta/metaCampaignService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Launch can take up to 5 min (AI gen + Meta API)

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      cities?: string[];
      dailyBudgetCents?: number;
    };

    const cities = (body.cities ?? []).map((c) => c.trim()).filter(Boolean);
    if (cities.length === 0) {
      return NextResponse.json({ error: "At least one city is required" }, { status: 400 });
    }

    const dailyBudgetCents = Number(body.dailyBudgetCents ?? 0);
    if (dailyBudgetCents < 100) {
      return NextResponse.json(
        { error: "Daily budget must be at least $1.00 (100 cents)" },
        { status: 400 }
      );
    }

    const result = await launchCampaign({ cities, dailyBudgetCents });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.errors.join("; "), ...result },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[meta-ads/launch]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
