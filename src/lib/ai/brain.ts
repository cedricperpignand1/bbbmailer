import OpenAI from 'openai';
import { prisma } from '../prisma';
import { log, error } from '../logger';
import type { GadsCampaignMetrics, GadsAiDecision } from '@prisma/client';

const SYSTEM_PROMPT = `You are an AI campaign manager for Builder's Bid Book (buildersbidbook.com), a Florida preconstruction bidding platform connecting general contractors with subcontractors. The platform competes directly with PlanHub. Target users are commercial GCs and subcontractors in 7 Florida markets: Miami-Dade, City of Miami, Fort Lauderdale, Tampa, Orlando, Jacksonville, Cape Coral. Total monthly budget is $120 USD ($4/day). Ads run Mon-Fri 7am-6pm EST only. Analyze the campaign metrics provided and return ONLY a valid JSON array of decision objects. No markdown, no explanation, just the JSON array.
Each object must have exactly these fields:
{
  type: PAUSE_CAMPAIGN | REDUCE_BUDGET | INCREASE_BUDGET | ADD_NEGATIVE | REWRITE_AD | FRAUD_ALERT | SHIFT_CITY_BUDGET | INCREASE_BID | REDUCE_BID | KEYWORD_EXPANSION,
  action: string (specific action to take),
  reasoning: string (clear explanation referencing the data),
  confidence: number between 0 and 1,
  requiresApproval: boolean
}
Set requiresApproval true for: any pause, any budget reduction, any budget shift over $5, any campaign-level change.
Set requiresApproval false for: adding negatives, flagging issues, minor bid adjustments under $1.`;

type RawDecision = {
  type: string;
  action: string;
  reasoning: string;
  confidence: number;
  requiresApproval: boolean;
};

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

async function autoExecuteDecision(decision: GadsAiDecision): Promise<void> {
  // Placeholder for auto-execution of low-risk decisions.
  // Currently logs intent — wire to specific action handlers as decision
  // types are operationalized (e.g. ADD_NEGATIVE → addNegativeKeyword).
  log('Brain', `Auto-executing decision type=${decision.type} action="${decision.action}"`);
}

export async function analyzePerformance(
  metrics: GadsCampaignMetrics[]
): Promise<GadsAiDecision[]> {
  const openai = getOpenAI();

  const metricsPayload = metrics.map((m) => ({
    campaignId: m.campaignId,
    city: m.city,
    date: m.date,
    clicks: m.clicks,
    impressions: m.impressions,
    costUsd: Number(m.costMicros) / 1_000_000,
    conversions: m.conversions,
    invalidClicks: m.invalidClicks,
  }));

  let rawContent: string;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(metricsPayload) },
      ],
      temperature: 0.2,
    });
    rawContent = response.choices[0]?.message?.content ?? '[]';
  } catch (err) {
    error('Brain', 'OpenAI API call failed', err);
    throw err;
  }

  // Strip accidental markdown fences
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let decisions: RawDecision[];
  try {
    decisions = JSON.parse(cleaned) as RawDecision[];
    if (!Array.isArray(decisions)) throw new Error('Response was not an array');
  } catch (err) {
    error('Brain', 'Failed to parse OpenAI response as JSON array', { cleaned, err });
    throw err;
  }

  const saved: GadsAiDecision[] = [];

  for (const d of decisions) {
    try {
      const record = await prisma.gadsAiDecision.create({
        data: {
          type: d.type,
          action: d.action,
          reasoning: d.reasoning,
          confidence: d.confidence,
          requiresApproval: d.requiresApproval,
        },
      });
      saved.push(record);

      if (d.confidence > 0.85 && !d.requiresApproval) {
        await autoExecuteDecision(record);
        await prisma.gadsAiDecision.update({
          where: { id: record.id },
          data: { executedAt: new Date() },
        });
      }
    } catch (err) {
      error('Brain', `Failed to save decision type=${d.type}`, err);
    }
  }

  log('Brain', `AI analysis complete — ${saved.length} decision(s) saved`);
  return saved;
}
