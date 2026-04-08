import { log, error } from '../logger';

const GADS_CLIENT_ID = process.env.GADS_CLIENT_ID!;
const GADS_CLIENT_SECRET = process.env.GADS_CLIENT_SECRET!;
const GADS_REFRESH_TOKEN = process.env.GADS_REFRESH_TOKEN!;
const GADS_DEVELOPER_TOKEN = process.env.GADS_DEVELOPER_TOKEN!;
const GADS_MANAGER_ID = process.env.GADS_MANAGER_ID!;
const GADS_ACCOUNT_ID = process.env.GADS_ACCOUNT_ID!;

const BASE_URL = () =>
  `https://googleads.googleapis.com/v17/customers/${GADS_ACCOUNT_ID}`;

export class GoogleAdsApiError extends Error {
  status: number;
  body: unknown;
  endpoint: string;

  constructor(status: number, body: unknown, endpoint: string) {
    super(`Google Ads API error ${status} at ${endpoint}`);
    this.name = 'GoogleAdsApiError';
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GADS_CLIENT_ID,
      client_secret: GADS_CLIENT_SECRET,
      refresh_token: GADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GoogleAdsApiError(res.status, body, 'oauth2/token');
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

const RETRY_DELAYS = [1000, 2000, 4000];

export async function googleAdsFetch(
  path: string,
  method: string,
  body?: unknown
): Promise<unknown> {
  const url = `${BASE_URL()}/${path}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const token = await getAccessToken();
    log('GoogleAds', `${method} ${path}`);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': GADS_DEVELOPER_TOKEN,
        'login-customer-id': GADS_MANAGER_ID,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 429 && attempt < RETRY_DELAYS.length) {
      log(
        'GoogleAds',
        `Rate limited — retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1})`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    if (!res.ok) {
      const responseBody = await res.json().catch(() => ({}));
      error('GoogleAds', `API error ${res.status} at ${path}`, responseBody);
      throw new GoogleAdsApiError(res.status, responseBody, path);
    }

    return res.json();
  }

  throw new GoogleAdsApiError(429, { message: 'Max retries exceeded' }, path);
}
