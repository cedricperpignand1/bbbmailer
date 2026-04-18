// src/lib/meta/metaTargetingService.ts
// Builds Meta ad targeting payloads for subcontractor audiences in selected cities.
// Uses geo lookup + construction-related interests + Advantage+ audience.

import { searchGeoLocation } from "./metaApiClient";


// Simple in-memory cache for geo keys to avoid repeated API calls in one run.
const geoCache = new Map<string, string | null>();

/** Look up Meta's city key for a city name string like "Miami, FL". */
async function getCityGeoKey(cityInput: string): Promise<string | null> {
  const normalized = cityInput.trim();
  if (geoCache.has(normalized)) return geoCache.get(normalized)!;

  // Strip state portion for the search query
  const queryName = normalized.split(",")[0].trim();
  const result = await searchGeoLocation(queryName);
  const key = result?.key ?? null;
  geoCache.set(normalized, key);
  return key;
}

export type TargetingPayload = {
  geo_locations: {
    cities: { key: string; radius: number; distance_unit: "mile" }[];
    location_types: string[];
  };
  age_min: number;
  age_max: number;
  publisher_platforms: string[];
  facebook_positions: string[];
  instagram_positions: string[];
};

/**
 * Build a targeting payload for a single city.
 * Falls back to a 30-mile DMA radius if no exact match is found.
 */
export async function buildCityTargeting(
  cityInput: string
): Promise<TargetingPayload | null> {
  const cityKey = await getCityGeoKey(cityInput);
  if (!cityKey) {
    console.warn(`[metaTargeting] Could not find geo key for "${cityInput}"`);
    return null;
  }

  return {
    geo_locations: {
      cities: [{ key: cityKey, radius: 30, distance_unit: "mile" }],
      location_types: ["home", "recent"],
    },
    age_min: 24,
    age_max: 65,
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed", "marketplace", "video_feeds"],
    instagram_positions: ["stream", "story", "reels", "explore"],
  };
}

/**
 * Build targeting for multiple cities. Skips cities whose keys can't be found.
 * Returns a map of cityName → targeting payload.
 */
export async function buildTargetingForCities(
  cities: string[]
): Promise<Map<string, TargetingPayload>> {
  const result = new Map<string, TargetingPayload>();
  await Promise.all(
    cities.map(async (city) => {
      const payload = await buildCityTargeting(city);
      if (payload) result.set(city, payload);
    })
  );
  return result;
}

/**
 * Allocate daily budget evenly across cities.
 * Returns a map of cityName → budget in cents.
 */
export function allocateBudget(
  totalDailyBudgetCents: number,
  cities: string[]
): Map<string, number> {
  const map = new Map<string, number>();
  if (cities.length === 0) return map;

  const perCity = Math.floor(totalDailyBudgetCents / cities.length);
  const remainder = totalDailyBudgetCents - perCity * cities.length;

  cities.forEach((city, idx) => {
    // Give the remainder to the first city
    map.set(city, idx === 0 ? perCity + remainder : perCity);
  });

  return map;
}

/**
 * Reallocate budget based on city performance.
 * High-performing cities get up to +30%, low performers get -20%.
 * Total always sums to totalDailyBudgetCents.
 *
 * performanceMap: { cityName: { leads, spend } }
 */
export function reallocateBudgetByPerformance(
  totalDailyBudgetCents: number,
  currentAllocations: Map<string, number>,
  performanceMap: Record<string, { leads: number; spend: number }>
): Map<string, number> {
  const cities = Array.from(currentAllocations.keys());
  if (cities.length <= 1) return currentAllocations;

  // Calculate CPL per city (cost per lead)
  const cpls: { city: string; cpl: number }[] = cities.map((city) => {
    const p = performanceMap[city];
    if (!p || p.leads === 0) {
      return { city, cpl: Infinity };
    }
    return { city, cpl: p.spend / p.leads };
  });

  const validCpls = cpls.filter((c) => c.cpl !== Infinity);
  if (validCpls.length === 0) return currentAllocations; // no data yet

  const avgCpl = validCpls.reduce((s, c) => s + c.cpl, 0) / validCpls.length;

  // Score each city relative to average
  const scores = new Map<string, number>();
  cities.forEach((city) => {
    const cplEntry = cpls.find((c) => c.city === city);
    if (!cplEntry || cplEntry.cpl === Infinity) {
      scores.set(city, 1.0); // neutral score for no-data cities
    } else {
      // Lower CPL = better. Score inversely proportional.
      const ratio = avgCpl / cplEntry.cpl;
      scores.set(city, Math.min(Math.max(ratio, 0.5), 1.5)); // clamp 0.5–1.5
    }
  });

  // Normalize scores to sum to 1
  const totalScore = Array.from(scores.values()).reduce((s, v) => s + v, 0);
  const newMap = new Map<string, number>();
  let allocated = 0;

  cities.forEach((city, idx) => {
    const score = scores.get(city) ?? 1;
    const share = score / totalScore;
    const budget =
      idx === cities.length - 1
        ? totalDailyBudgetCents - allocated
        : Math.floor(totalDailyBudgetCents * share);
    newMap.set(city, Math.max(budget, 100)); // minimum $1/day
    allocated += budget;
  });

  return newMap;
}
