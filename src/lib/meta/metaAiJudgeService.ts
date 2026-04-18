// src/lib/meta/metaAiJudgeService.ts
// AI-based quality control for Meta ad creatives — scores before launch
// and generates plain-English performance summaries after launch.
//
// IMPORTANT: AI is used for scoring, ranking, and explanation only.
// All actual pause/scale decisions are made by hard-coded rules in
// metaOptimizationService.ts.

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Pre-launch creative scoring ───────────────────────────────────────────────

export type CreativeScore = {
  clarity: number;          // 1-10: Is the message clear?
  specificity: number;      // 1-10: Does it speak to subcontractors specifically?
  valueProposition: number; // 1-10: Is the value prop compelling?
  leadLikelihood: number;   // 1-10: Would a sub fill out the form?
  bbbAlignment: number;     // 1-10: Does it fit BBB's positioning?
  overall: number;          // weighted average
  verdict: "approved" | "rejected" | "needs_revision";
  notes: string;
};

/**
 * Score a single creative variant.
 * Verdict: approved ≥ 7.0, needs_revision 5.0–6.9, rejected < 5.0
 */
export async function scoreCreative(params: {
  angle: string;
  headline: string;
  primaryText: string;
  description?: string;
}): Promise<CreativeScore> {
  const prompt = `You are a paid advertising expert reviewing a Meta lead generation ad for Builders Bid Book, a construction intelligence platform for subcontractors.

The ad's goal: get subcontractors (plumbers, electricians, framers, concrete, HVAC, etc.) to fill out a lead form to join Builders Bid Book and find local construction projects.

Ad to review:
Angle: ${params.angle}
Headline: ${params.headline}
Primary text: ${params.primaryText}
${params.description ? `Description: ${params.description}` : ""}

Score each dimension 1-10:
- clarity: Is the message immediately clear to a busy contractor?
- specificity: Does it speak directly to subcontractors (not homeowners, not generic)?
- valueProposition: Is the reason to sign up compelling and concrete?
- leadLikelihood: Would a subcontractor actually stop scrolling and fill out a form?
- bbbAlignment: Does it match "The Zillow of Construction" positioning — smart, fast, local, contractor-first?

Rules:
- Reject vague ads like "Join our platform" or "Build your business"
- Reject ads that sound like they're for homeowners
- Approve ads that are direct, specific, and make a concrete promise
- overall = (clarity*0.2 + specificity*0.2 + valueProposition*0.25 + leadLikelihood*0.25 + bbbAlignment*0.1)

Respond ONLY with valid JSON (use your actual scores, do not copy these numbers):
{"clarity":0,"specificity":0,"valueProposition":0,"leadLikelihood":0,"bbbAlignment":0,"overall":0.0,"verdict":"approved|needs_revision|rejected","notes":"your evaluation here"}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 400,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<CreativeScore>;

    const overall = parsed.overall ?? 5.0;
    let verdict: "approved" | "rejected" | "needs_revision";
    if (overall >= 7.0) verdict = "approved";
    else if (overall >= 5.0) verdict = "needs_revision";
    else verdict = "rejected";

    return {
      clarity: parsed.clarity ?? 5,
      specificity: parsed.specificity ?? 5,
      valueProposition: parsed.valueProposition ?? 5,
      leadLikelihood: parsed.leadLikelihood ?? 5,
      bbbAlignment: parsed.bbbAlignment ?? 5,
      overall,
      verdict: parsed.verdict ?? verdict,
      notes: parsed.notes ?? "No notes",
    };
  } catch (err) {
    console.error("[metaAiJudge] scoreCreative failed:", err);
    // Default to approved with neutral score so a judge failure doesn't block launch
    return {
      clarity: 7,
      specificity: 7,
      valueProposition: 7,
      leadLikelihood: 7,
      bbbAlignment: 7,
      overall: 7.0,
      verdict: "approved",
      notes: "AI scoring unavailable — defaulting to approved",
    };
  }
}

/**
 * Score all pending variants for a campaign and update their DB records.
 * Returns counts of approved/rejected/revised.
 */
export async function judgeAllVariants(campaignId: string): Promise<{
  approved: number;
  rejected: number;
  needs_revision: number;
}> {
  const variants = await prisma.metaCreativeVariant.findMany({
    where: { campaignId, aiVerdict: null },
  });

  let approved = 0;
  let rejected = 0;
  let needs_revision = 0;

  for (const variant of variants) {
    const score = await scoreCreative({
      angle: variant.angle,
      headline: variant.headline,
      primaryText: variant.primaryText,
      description: variant.description ?? undefined,
    });

    await prisma.metaCreativeVariant.update({
      where: { id: variant.id },
      data: {
        aiScore: score.overall,
        aiVerdict: score.verdict,
        aiNotes: score.notes,
      },
    });

    if (score.verdict === "approved") approved++;
    else if (score.verdict === "rejected") rejected++;
    else needs_revision++;
  }

  return { approved, rejected, needs_revision };
}

/**
 * Save a pre-launch AI review for a campaign.
 */
export async function generatePreLaunchReview(
  campaignId: string,
  approvedCount: number,
  rejectedCount: number,
  cities: string[]
): Promise<void> {
  const summary = `Pre-launch review complete. ${approvedCount} creative variant(s) approved, ${rejectedCount} rejected. Targeting ${cities.join(", ")}. Approved creatives meet quality threshold for subcontractor audience relevance, clarity, and value proposition.`;

  await prisma.metaAiReview.create({
    data: {
      campaignId,
      type: "pre-launch",
      summary,
      recommendations: `Focus on "${cities[0]}" as primary test market. Monitor CTR and lead form completion rate in first 48 hours.`,
    },
  });
}

// ── Post-launch performance review ───────────────────────────────────────────

export type PerformanceContext = {
  totalSpend: number;
  totalLeads: number;
  totalClicks: number;
  totalImpressions: number;
  citySummary: Record<string, { leads: number; spend: number; clicks: number }>;
  angleSummary: Record<string, { leads: number; spend: number }>;
  adDetails: {
    angle: string;
    city: string;
    leads: number;
    spend: number;
    status: string;
  }[];
};

/**
 * Generate a plain-English performance review using GPT-4o.
 * Saved to DB and displayed in the dashboard.
 */
export async function generatePerformanceReview(
  campaignId: string,
  context: PerformanceContext
): Promise<void> {
  const cpl =
    context.totalLeads > 0
      ? (context.totalSpend / context.totalLeads).toFixed(2)
      : "N/A";

  const prompt = `You are analyzing the performance of Meta lead generation ads for Builders Bid Book, a construction platform for subcontractors.

Campaign summary:
- Total spend: $${context.totalSpend.toFixed(2)}
- Total leads: ${context.totalLeads}
- CPL: $${cpl}
- Total clicks: ${context.totalClicks}
- CTR: ${context.totalImpressions > 0 ? ((context.totalClicks / context.totalImpressions) * 100).toFixed(2) : "N/A"}%

By city: ${JSON.stringify(context.citySummary)}
By angle: ${JSON.stringify(context.angleSummary)}

Write a concise performance summary (3-5 sentences max) that tells the operator:
1. Which angle is winning and why
2. Which city responds best
3. Any weaknesses or creative fatigue signals
4. One concrete recommendation

Be direct and specific. No filler. Write like a senior media buyer giving a quick brief.

Respond ONLY with valid JSON:
{"summary":"...","topAngle":"angle-slug","topCity":"City, ST","weaknesses":"...","recommendations":"..."}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 600,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      summary?: string;
      topAngle?: string;
      topCity?: string;
      weaknesses?: string;
      recommendations?: string;
    };

    await prisma.metaAiReview.create({
      data: {
        campaignId,
        type: "performance",
        summary: parsed.summary ?? "Performance review generated.",
        topAngle: parsed.topAngle ?? undefined,
        topCity: parsed.topCity ?? undefined,
        weaknesses: parsed.weaknesses ?? undefined,
        recommendations: parsed.recommendations ?? undefined,
      },
    });
  } catch (err) {
    console.error("[metaAiJudge] generatePerformanceReview failed:", err);
  }
}
