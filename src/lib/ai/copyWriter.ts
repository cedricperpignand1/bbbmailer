import OpenAI from 'openai';
import { log, error } from '../logger';

export type AdVariant = {
  headlines: string[];    // each max 30 chars
  descriptions: string[]; // each max 90 chars
  ctr: number;
};

export type AdCopyDraft = {
  headlines: string[];    // 3 new options, each under 30 chars
  descriptions: string[]; // 2 new options, each under 90 chars
  approved: false;
};

export class AdCopyValidationError extends Error {
  constructor(field: string, value: string, limit: number) {
    super(`AdCopy validation failed — ${field} "${value}" exceeds ${limit} chars (${value.length})`);
    this.name = 'AdCopyValidationError';
  }
}

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

function validateDraft(draft: AdCopyDraft): void {
  for (const h of draft.headlines) {
    if (h.length > 30) throw new AdCopyValidationError('headline', h, 30);
  }
  for (const d of draft.descriptions) {
    if (d.length > 90) throw new AdCopyValidationError('description', d, 90);
  }
}

export async function rewriteAd(
  losingAd: AdVariant,
  winningAd: AdVariant,
  adGroupName: string
): Promise<AdCopyDraft> {
  const openai = getOpenAI();

  const prompt = `You are writing Google Ads copy for Builder's Bid Book (buildersbidbook.com), a Florida preconstruction bidding platform.

Ad group: ${adGroupName}

Value propositions:
- Free for GCs to post bid invitations
- Florida-wide coverage — no radius limits
- Streamlines the RFP process
- Better coverage than PlanHub

Winning ad (CTR: ${winningAd.ctr.toFixed(2)}%):
Headlines: ${JSON.stringify(winningAd.headlines)}
Descriptions: ${JSON.stringify(winningAd.descriptions)}

Losing ad (CTR: ${losingAd.ctr.toFixed(2)}%):
Headlines: ${JSON.stringify(losingAd.headlines)}
Descriptions: ${JSON.stringify(losingAd.descriptions)}

Write 3 new headlines (each STRICTLY under 30 characters including spaces) and 2 new descriptions (each STRICTLY under 90 characters).
Study what made the winning ad better and incorporate those elements.

Return ONLY valid JSON — no markdown, no explanation:
{"headlines": ["...", "...", "..."], "descriptions": ["...", "..."]}`;

  let rawContent: string;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    rawContent = response.choices[0]?.message?.content ?? '{}';
  } catch (err) {
    error('CopyWriter', 'OpenAI API call failed', err);
    throw err;
  }

  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: { headlines: string[]; descriptions: string[] };
  try {
    parsed = JSON.parse(cleaned) as { headlines: string[]; descriptions: string[] };
  } catch (err) {
    error('CopyWriter', 'Failed to parse OpenAI ad copy response', { cleaned, err });
    throw err;
  }

  const draft: AdCopyDraft = {
    headlines: parsed.headlines,
    descriptions: parsed.descriptions,
    approved: false,
  };

  validateDraft(draft);

  log('CopyWriter', `Draft created for adGroup="${adGroupName}" — ${draft.headlines.length} headlines, ${draft.descriptions.length} descriptions`);
  return draft;
}
