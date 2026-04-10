// src/lib/igPublish.ts
// Meta Graph API helper for Instagram auto-publishing.
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing

const GRAPH = 'https://graph.facebook.com/v19.0';

/**
 * Step 1 — create a media container.
 * Returns the creation_id needed to publish.
 */
export async function createMediaContainer(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
  isStory: boolean
): Promise<string> {
  const body = new URLSearchParams({ image_url: imageUrl, access_token: accessToken });
  if (isStory) {
    body.set('media_type', 'STORIES');
    // Add link sticker pointing to the website
    body.set('sticker_type', 'LINK');
    body.set('link_url', 'https://buildersbidbook.com');
  } else {
    body.set('caption', caption);
  }

  const res = await fetch(`${GRAPH}/${igUserId}/media`, { method: 'POST', body });
  const data = await res.json() as { id?: string; error?: { message: string; code?: number; error_subcode?: number } };
  if (!res.ok || !data.id) {
    const detail = JSON.stringify(data.error ?? data);
    throw new Error(`IG createContainer failed: ${detail}`);
  }
  return data.id;
}

/**
 * Step 2 — publish a container created above.
 * Returns the published media ID.
 */
export async function publishMedia(
  igUserId: string,
  accessToken: string,
  creationId: string
): Promise<string> {
  const body = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
  const res = await fetch(`${GRAPH}/${igUserId}/media_publish`, { method: 'POST', body });
  const data = await res.json() as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? `publishMedia HTTP ${res.status}`);
  }
  return data.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish window helpers
// ─────────────────────────────────────────────────────────────────────────────

// Best days/times for construction contractor audience (South Florida):
//   Tuesday   7:00–7:14 AM ET  — before the job-site day starts
//   Wednesday 12:00–12:14 PM ET — lunch-break scroll
//   Thursday  18:30–18:44 ET   — evening after work

export type WindowKey = 'tue-7am' | 'wed-12pm' | 'thu-630pm';

type WindowResult = { active: true; key: WindowKey } | { active: false };

function etParts(): { wd: string; h: number; m: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return { wd: get('weekday'), h: Number(get('hour')), m: Number(get('minute')) };
}

export function currentPublishWindow(): WindowResult {
  const { wd, h, m } = etParts();
  if (wd === 'Tue' && h === 7  && m < 15)                   return { active: true, key: 'tue-7am' };
  if (wd === 'Wed' && h === 12 && m < 15)                   return { active: true, key: 'wed-12pm' };
  if (wd === 'Thu' && h === 18 && m >= 30 && m < 45)        return { active: true, key: 'thu-630pm' };
  return { active: false };
}

/** Returns the ET calendar date string YYYY-MM-DD */
export function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
