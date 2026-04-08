import { log, error } from '../logger';

type CacheEntry = { score: number; cachedAt: number };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

export async function checkIp(ip: string): Promise<number> {
  const now = Date.now();
  const cached = cache.get(ip);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.score;
  }

  try {
    const key = process.env.IPQUALITYSCORE_API_KEY!;
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${key}/${encodeURIComponent(ip)}`
    );
    if (!res.ok) {
      error('IPQS', `HTTP ${res.status} for IP ${ip}`);
      return 0;
    }
    const data = (await res.json()) as { fraud_score?: number };
    const score = typeof data.fraud_score === 'number' ? data.fraud_score : 0;
    cache.set(ip, { score, cachedAt: now });
    log('IPQS', `IP ${ip} scored ${score}`);
    return score;
  } catch (err) {
    error('IPQS', `Failed to check IP ${ip}`, err);
    return 0;
  }
}
