import { prisma } from '../prisma';
import { log } from '../logger';
import type { GadsCampaignMetrics, GadsAiDecision } from '@prisma/client';

export type CityMetrics = {
  city: string;
  totalSpendCents: number;
  conversions: number;
  costPerConversion: number | null;
};

export type BudgetAllocation = Array<{
  city: string;
  currentMonthlyCents: number;
  proposedMonthlyCents: number;
  changeReason: string;
}>;

const TOTAL_MONTHLY_CENTS = 12_000; // $120
const FLOOR_CENTS = 300;            // $3/month minimum
const CEILING_CENTS = 4_200;        // 35% of $120 = $42/month

export async function optimizeCityBudgets(
  weeklyMetrics: GadsCampaignMetrics[]
): Promise<GadsAiDecision> {
  // Aggregate by city
  const cityMap = new Map<string, { spendMicros: bigint; conversions: number }>();

  for (const m of weeklyMetrics) {
    const city = m.city ?? 'Unknown';
    const existing = cityMap.get(city) ?? { spendMicros: 0n, conversions: 0 };
    cityMap.set(city, {
      spendMicros: existing.spendMicros + m.costMicros,
      conversions: existing.conversions + m.conversions,
    });
  }

  const cityMetrics: CityMetrics[] = [];
  for (const [city, data] of cityMap.entries()) {
    const totalSpendCents = Number(data.spendMicros) / 10_000;
    const conversions = data.conversions;
    const costPerConversion = conversions > 0 ? totalSpendCents / conversions : null;
    cityMetrics.push({ city, totalSpendCents, conversions, costPerConversion });
  }

  // Fetch current budgets from DB
  const campaigns = await prisma.gadsCampaign.findMany({ where: { status: 'ENABLED' } });
  const currentBudgetByCity = new Map<string, number>();
  for (const c of campaigns) {
    const existing = currentBudgetByCity.get(c.city) ?? 0;
    currentBudgetByCity.set(c.city, existing + c.dailyBudgetCents * 30);
  }

  // Cities to cut: 0 conversions AND spent >= $10 (1000 cents)
  const citiesToCut = cityMetrics.filter(
    (cm) => cm.conversions === 0 && cm.totalSpendCents >= 1_000
  );

  let freedCents = 0;
  const allocations: BudgetAllocation = [];

  for (const cm of citiesToCut) {
    const current = currentBudgetByCity.get(cm.city) ?? FLOOR_CENTS;
    const cut = Math.round(current * 0.3);
    const proposed = Math.max(FLOOR_CENTS, current - cut);
    freedCents += current - proposed;
    allocations.push({
      city: cm.city,
      currentMonthlyCents: current,
      proposedMonthlyCents: proposed,
      changeReason: `0 conversions after $${(cm.totalSpendCents / 100).toFixed(2)} spend — cut 30%`,
    });
    currentBudgetByCity.set(cm.city, proposed);
  }

  // Redistribute freed budget to top 2 converting cities
  const topConverters = [...cityMetrics]
    .filter((cm) => cm.conversions > 0)
    .sort((a, b) => {
      const aCpc = a.costPerConversion ?? Infinity;
      const bCpc = b.costPerConversion ?? Infinity;
      return aCpc - bCpc; // lowest cost-per-conversion = best
    })
    .slice(0, 2);

  const totalTopConversions = topConverters.reduce((sum, cm) => sum + cm.conversions, 0);

  for (const cm of topConverters) {
    const share = totalTopConversions > 0 ? cm.conversions / totalTopConversions : 0.5;
    const bonus = Math.round(freedCents * share);
    const current = currentBudgetByCity.get(cm.city) ?? FLOOR_CENTS;
    const proposed = Math.min(CEILING_CENTS, current + bonus);
    allocations.push({
      city: cm.city,
      currentMonthlyCents: current,
      proposedMonthlyCents: proposed,
      changeReason: `Top converter (${cm.conversions} conversions, $${(cm.costPerConversion! / 100).toFixed(2)}/conv) — gains ${((share * 100)).toFixed(0)}% of freed budget`,
    });
  }

  // Cities not touched: add as-is
  for (const [city, current] of currentBudgetByCity.entries()) {
    const alreadyInAllocations = allocations.some((a) => a.city === city);
    if (!alreadyInAllocations) {
      allocations.push({
        city,
        currentMonthlyCents: current,
        proposedMonthlyCents: current,
        changeReason: 'No change',
      });
    }
  }

  // Build reasoning table
  const tableRows = allocations
    .map(
      (a) =>
        `${a.city}: $${(a.currentMonthlyCents / 100).toFixed(2)} → $${(a.proposedMonthlyCents / 100).toFixed(2)} | ${a.changeReason}`
    )
    .join('\n');

  const reasoning = `Weekly budget optimization:\n\n${tableRows}\n\nFreed: $${(freedCents / 100).toFixed(2)} from underperforming cities, redistributed to top converters.`;

  const decision = await prisma.gadsAiDecision.create({
    data: {
      type: 'SHIFT_CITY_BUDGET',
      action: JSON.stringify(allocations),
      reasoning,
      confidence: 0.8,
      requiresApproval: true,
    },
  });

  log('BudgetOptimizer', `Budget optimization decision created — ${allocations.length} cities`);
  return decision;
}
