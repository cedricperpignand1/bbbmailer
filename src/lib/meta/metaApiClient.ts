// src/lib/meta/metaApiClient.ts
// Low-level Facebook Marketing API v19.0 client.
// All higher-level services import from here.

const GRAPH = "https://graph.facebook.com/v19.0";

// ── Env helpers ───────────────────────────────────────────────────────────────

export function getToken(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN env var not set");
  return t;
}

export function getAdAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error("META_AD_ACCOUNT_ID env var not set");
  return id.startsWith("act_") ? id : `act_${id}`;
}

export function getPageId(): string {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error("META_PAGE_ID env var not set");
  return id;
}

export function getIgActorId(): string | null {
  return process.env.META_IG_ACTOR_ID ?? null;
}

// ── Core request helpers ──────────────────────────────────────────────────────

export async function metaGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", getToken());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  const data = (await res.json()) as T & {
    error?: { message: string; code: number; error_subcode?: number };
  };

  if (!res.ok || (data as Record<string, unknown>).error) {
    const err = (data as Record<string, unknown>).error;
    throw new Error(
      `Meta GET /${path} failed (HTTP ${res.status}): ${JSON.stringify(err ?? data)}`
    );
  }
  return data;
}

export async function metaPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: getToken() }),
  });

  const data = (await res.json()) as T & {
    error?: { message: string; code: number; error_subcode?: number };
  };

  if (!res.ok || (data as Record<string, unknown>).error) {
    const err = (data as Record<string, unknown>).error;
    throw new Error(
      `Meta POST /${path} failed (HTTP ${res.status}): ${JSON.stringify(err ?? data)}`
    );
  }
  return data;
}

// ── Geo location search ───────────────────────────────────────────────────────

export type GeoLocation = {
  key: string;
  name: string;
  type: string;
  country_code: string;
  region: string;
};

/** Search Meta's geo location API for a city name. Returns the best match. */
export async function searchGeoLocation(
  cityName: string
): Promise<GeoLocation | null> {
  try {
    const result = await metaGet<{ data: GeoLocation[] }>("search", {
      type: "adgeolocation",
      q: cityName,
      location_types: "city",
      country_code: "US",
      limit: "5",
    });
    if (!result.data || result.data.length === 0) return null;

    // Prefer exact city name match, fallback to first result
    const exact = result.data.find(
      (g) => g.name.toLowerCase() === cityName.split(",")[0].trim().toLowerCase()
    );
    return exact ?? result.data[0];
  } catch {
    return null;
  }
}

// ── Image upload ──────────────────────────────────────────────────────────────

/**
 * Upload an image to Meta's ad images endpoint. Returns the image hash.
 * Downloads the image first (DALL-E URLs are temporary and Meta can't fetch them),
 * then uploads as multipart/form-data bytes.
 */
export async function uploadAdImage(imageUrl: string): Promise<string> {
  const adAccountId = getAdAccountId();

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image from ${imageUrl}: HTTP ${imgRes.status}`);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const base64 = imgBuffer.toString("base64");

  // Meta adimages API expects base64-encoded bytes as JSON
  const res = await fetch(`${GRAPH}/${adAccountId}/adimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: getToken(), bytes: base64 }),
  });

  const data = await res.json() as {
    images?: Record<string, { hash: string; url: string }>;
    error?: { message: string; code: number };
  };

  if (!res.ok || data.error) {
    throw new Error(`Meta image upload failed (HTTP ${res.status}): ${JSON.stringify(data.error ?? data)}`);
  }

  const entries = Object.values(data.images ?? {});
  if (!entries[0]?.hash) {
    throw new Error("Image upload to Meta returned no hash");
  }
  return entries[0].hash;
}

// ── Lead form ─────────────────────────────────────────────────────────────────

export type MetaLeadFormResult = { id: string };

/**
 * Create a lead form on the Facebook page.
 * Returns the lead form ID.
 */
export async function createLeadForm(formName: string): Promise<string> {
  const pageId = getPageId();

  const result = await metaPost<MetaLeadFormResult>(`${pageId}/leadgen_forms`, {
    name: formName,
    questions: [
      { type: "FULL_NAME" },
      { type: "EMAIL" },
      { type: "PHONE" },
    ],
    privacy_policy: {
      url: process.env.META_PRIVACY_POLICY_URL ?? "https://buildersbidbook.com/privacy",
      link_text: "Privacy Policy",
    },
    follow_up_action_url:
      process.env.META_FOLLOWUP_URL ?? "https://buildersbidbook.com/welcome",
    thank_you_page: {
      title: "You're in!",
      body: "Welcome to Builders Bid Book. We'll reach out soon with local project activity for your area.",
      button_type: "VIEW_WEBSITE",
      button_text: "Visit Builders Bid Book",
      website_url: process.env.META_FOLLOWUP_URL ?? "https://buildersbidbook.com",
    },
    locale: "EN_US",
  });

  return result.id;
}

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

export type MetaCampaignResult = { id: string };

export async function createMetaCampaign(
  name: string,
  dailyBudgetCents: number
): Promise<string> {
  const adAccountId = getAdAccountId();

  const result = await metaPost<MetaCampaignResult>(
    `${adAccountId}/campaigns`,
    {
      name,
      objective: "OUTCOME_LEADS",
      status: "ACTIVE",
      special_ad_categories: [],
      buying_type: "AUCTION",
      is_adset_budget_sharing_enabled: false,
    }
  );

  return result.id;
}

export async function updateCampaignStatus(
  metaCampaignId: string,
  status: "ACTIVE" | "PAUSED" | "DELETED"
): Promise<void> {
  await metaPost<{ success: boolean }>(`${metaCampaignId}`, { status });
}

// ── Ad set CRUD ───────────────────────────────────────────────────────────────

export type AdSetParams = {
  name: string;
  campaignId: string;
  dailyBudgetCents: number;
  targeting: Record<string, unknown>;
  leadFormId: string;
};

export async function createAdSet(params: AdSetParams): Promise<string> {
  const adAccountId = getAdAccountId();

  const result = await metaPost<{ id: string }>(`${adAccountId}/adsets`, {
    name: params.name,
    campaign_id: params.campaignId,
    daily_budget: params.dailyBudgetCents,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: params.targeting,
    promoted_object: { page_id: getPageId() },
    lead_gen_form_id: params.leadFormId,
    status: "ACTIVE",
    destination_type: "ON_AD",
  });

  return result.id;
}

export async function updateAdSetStatus(
  metaAdSetId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  await metaPost<{ success: boolean }>(`${metaAdSetId}`, { status });
}

export async function updateAdSetBudget(
  metaAdSetId: string,
  dailyBudgetCents: number
): Promise<void> {
  await metaPost<{ success: boolean }>(`${metaAdSetId}`, {
    daily_budget: dailyBudgetCents,
  });
}

// ── Ad creative CRUD ──────────────────────────────────────────────────────────

export type CreativeParams = {
  name: string;
  pageId: string;
  imageHash: string;
  headline: string;
  primaryText: string;
  description?: string;
  ctaType: string;
  leadFormId: string;
  igActorId?: string | null;
};

export async function createAdCreative(
  params: CreativeParams
): Promise<string> {
  const adAccountId = getAdAccountId();

  const linkData: Record<string, unknown> = {
    call_to_action: {
      type: params.ctaType,
      value: { lead_gen_form_id: params.leadFormId },
    },
    image_hash: params.imageHash,
    message: params.primaryText,
    name: params.headline,
    link: "https://buildersbidbook.com",
  };

  if (params.description) {
    linkData.description = params.description;
  }

  const objectStorySpec: Record<string, unknown> = {
    page_id: params.pageId,
    link_data: linkData,
  };

  if (params.igActorId) {
    objectStorySpec.instagram_actor_id = params.igActorId;
  }

  const result = await metaPost<{ id: string }>(`${adAccountId}/adcreatives`, {
    name: params.name,
    object_story_spec: objectStorySpec,
  });

  return result.id;
}

// ── Ad CRUD ───────────────────────────────────────────────────────────────────

export async function createMetaAd(
  adSetId: string,
  creativeId: string,
  name: string
): Promise<string> {
  const adAccountId = getAdAccountId();

  const result = await metaPost<{ id: string }>(`${adAccountId}/ads`, {
    name,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: "ACTIVE",
  });

  return result.id;
}

export async function updateAdStatus(
  metaAdId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  await metaPost<{ success: boolean }>(`${metaAdId}`, { status });
}

// ── Insights ──────────────────────────────────────────────────────────────────

export type InsightRecord = {
  impressions: string;
  clicks: string;
  spend: string;
  actions?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
  // breakdowns
  city?: string;
};

export type InsightsResult = { data: InsightRecord[]; paging?: unknown };

/**
 * Fetch insights for a campaign from the Meta Insights API.
 * level: "campaign" | "adset" | "ad"
 */
export async function fetchInsights(
  objectId: string,
  level: "campaign" | "adset" | "ad",
  datePreset: "last_7_days" | "last_14_days" | "last_30_days" | "today" = "last_7_days",
  breakdowns: string[] = []
): Promise<InsightRecord[]> {
  const params: Record<string, string> = {
    level,
    date_preset: datePreset,
    fields: "impressions,clicks,spend,actions",
  };
  if (breakdowns.length > 0) {
    params.breakdowns = breakdowns.join(",");
  }

  const result = await metaGet<InsightsResult>(`${objectId}/insights`, params);
  return result.data ?? [];
}
