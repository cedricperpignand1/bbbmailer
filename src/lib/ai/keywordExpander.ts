import OpenAI from 'openai';
import { prisma } from '../prisma';
import { log, error } from '../logger';
import type { GadsAiDecision } from '@prisma/client';
import type { SearchTerm } from '../googleads/reports';

export type KeywordSuggestions = {
  newKeywords: Array<{
    text: string;
    matchType: 'EXACT' | 'PHRASE';
    reasoning: string;
  }>;
  newNegatives: Array<{
    text: string;
    reasoning: string;
  }>;
};

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

export async function expandKeywords(
  searchTerms: SearchTerm[]
): Promise<KeywordSuggestions> {
  const openai = getOpenAI();

  const top50 = [...searchTerms]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50)
    .map((t) => ({ text: t.text, clicks: t.clicks, impressions: t.impressions }));

  const prompt = `You are a Google Ads keyword strategist for Builder's Bid Book (buildersbidbook.com).

Context:
- Florida preconstruction bidding platform
- Target audience: commercial general contractors (GCs) and subcontractors
- Competing with PlanHub
- Goal: connect GCs posting projects with subs who want to bid
- Markets: Miami-Dade, Fort Lauderdale, Tampa, Orlando, Jacksonville, Cape Coral

Here are the top 50 search terms from the past 7 days (by clicks):
${JSON.stringify(top50, null, 2)}

Identify:
1. newKeywords: search terms that look like qualified B2B contractor intent — suggest as EXACT or PHRASE match
2. newNegatives: search terms that are clearly irrelevant (residential, job seekers, DIY, informational queries)

Return ONLY valid JSON — no markdown, no explanation:
{
  "newKeywords": [{"text": "...", "matchType": "EXACT|PHRASE", "reasoning": "..."}],
  "newNegatives": [{"text": "...", "reasoning": "..."}]
}`;

  let rawContent: string;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    rawContent = response.choices[0]?.message?.content ?? '{"newKeywords":[],"newNegatives":[]}';
  } catch (err) {
    error('KeywordExpander', 'OpenAI API call failed', err);
    throw err;
  }

  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let suggestions: KeywordSuggestions;
  try {
    suggestions = JSON.parse(cleaned) as KeywordSuggestions;
  } catch (err) {
    error('KeywordExpander', 'Failed to parse OpenAI keyword suggestions', { cleaned, err });
    throw err;
  }

  let decision: GadsAiDecision;
  try {
    decision = await prisma.gadsAiDecision.create({
      data: {
        type: 'KEYWORD_EXPANSION',
        action: JSON.stringify(suggestions),
        reasoning: `Analyzed ${top50.length} search terms. Suggested ${suggestions.newKeywords.length} new keywords and ${suggestions.newNegatives.length} new negatives.`,
        confidence: 0.75,
        requiresApproval: true,
      },
    });
    log('KeywordExpander', `Saved KEYWORD_EXPANSION decision id=${decision.id}`);
  } catch (err) {
    error('KeywordExpander', 'Failed to save keyword expansion decision', err);
    throw err;
  }

  return suggestions;
}
