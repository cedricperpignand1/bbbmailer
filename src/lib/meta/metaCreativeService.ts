// src/lib/meta/metaCreativeService.ts
// Generates ad copy + DALL-E images for Meta lead generation ads.
// All copy is written specifically for subcontractors using BBB positioning.

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { uploadAdImage } from "./metaApiClient";
import { stampAndSaveImage } from "@/lib/imageStamp";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Creative angles ───────────────────────────────────────────────────────────

export type CreativeAngle =
  | "zillow-of-construction"
  | "find-active-projects"
  | "track-before-others"
  | "built-for-subs"
  | "project-intel"
  | "more-opportunities";

export type AdCopy = {
  angle: CreativeAngle;
  headline: string;       // ≤ 40 chars
  primaryText: string;    // ≤ 255 chars for best display
  description: string;    // ≤ 30 chars
  ctaType: string;
  imagePrompt: string;
};

// ── Static copy bank ──────────────────────────────────────────────────────────
// Six proven angles for BBB subcontractor acquisition. Each has tight, direct-
// response copy written at a contractor's reading level — no buzzwords.

const COPY_BANK: AdCopy[] = [
  {
    angle: "zillow-of-construction",
    headline: "The Zillow of Construction",
    primaryText:
      "Builders Bid Book is where subcontractors go to find active projects before their competition does. Browse permits, project starts, and developer contacts — all in one place.",
    description: "Find projects. Win more bids.",
    ctaType: "SIGN_UP",
    imagePrompt:
      "Open laptop on a folding table at a South Florida construction setting showing a clean map-based platform UI with cobalt blue (#1055FF) location pins marking active construction projects across a city grid, rolled blueprints nearby, bright tropical daylight, premium flat modern ad creative style. Keep lower-left area visually open. No text, no logos, no watermarks.",
  },
  {
    angle: "find-active-projects",
    headline: "Find Active Projects Near You",
    primaryText:
      "Stop guessing where the work is. See active construction projects in your city — permits filed, project starts, and owner contact info — before most subs even hear about them.",
    description: "Built for subcontractors.",
    ctaType: "SIGN_UP",
    imagePrompt:
      "Drone aerial view of a South Florida residential neighborhood with several lots visibly under construction, palm canopy, bright tropical midday light, clean premium real estate editorial style, vivid blue sky. Keep lower-left area clean for text overlay. No text, no logos, no watermarks.",
  },
  {
    angle: "track-before-others",
    headline: "See Projects Before Others Do",
    primaryText:
      "The sub who sees the job first gets the bid first. Builders Bid Book tracks local permits and construction starts in real time — so you're always one step ahead.",
    description: "Be first. Win more.",
    ctaType: "SIGN_UP",
    imagePrompt:
      "Two professional contractors in hard hats shown from behind or side profile only, looking at a tablet displaying a digital map with cobalt blue construction activity pins, active South Florida construction site in background, bright midday daylight, confident premium ad photography. Open lower-left for text. No text, no logos, no watermarks.",
  },
  {
    angle: "built-for-subs",
    headline: "Built for Subcontractors",
    primaryText:
      "Finally — a platform built for the trades. Track local permits, find active jobs, and reach developers before anyone else. No more chasing GCs who never call back.",
    description: "Join free. Start finding work.",
    ctaType: "SIGN_UP",
    imagePrompt:
      "New residential wood framing going up in a South Florida neighborhood, roof trusses and stud walls, premium editorial construction photography, vivid blue sky, palm trees, bright sun, clean crisp details. Strong framing structure in upper half, clean negative space in bottom-left for text. No people, no text, no logos, no watermarks.",
  },
  {
    angle: "project-intel",
    headline: "Local Construction Intelligence",
    primaryText:
      "Know exactly what's being built in your area. Builders Bid Book maps every active permit and project so you can find work faster, bid smarter, and grow your pipeline.",
    description: "Smarter bidding starts here.",
    ctaType: "SIGN_UP",
    imagePrompt:
      "Clean desk flat lay with a printed satellite-style city map marked with cobalt blue project location pins, a hard hat, permit papers, measuring tape, sharp bright studio lighting, premium marketing creative style. Map concentrated upper-right, clean left side open for text. No text, no logos, no watermarks.",
  },
  {
    angle: "more-opportunities",
    headline: "More Construction Opportunities",
    primaryText:
      "Discover construction projects happening in your city right now. Builders Bid Book is the fastest way for subcontractors to find real, active work — not stale listings.",
    description: "Try it free today.",
    ctaType: "SIGN_UP",
    imagePrompt:
      "Bright South Florida city skyline with multiple visible construction cranes and partially-built structures, vivid blue sky, vibrant and energetic aerial perspective, optimistic and premium photography feel. Skyline fills upper two-thirds, clean lower-left open for text overlay. No text, no logos, no watermarks.",
  },
];

// ── AI-enhanced copy generation ───────────────────────────────────────────────

/**
 * Use AI to generate fresh copy for a given angle, optionally tailored to a city.
 * Falls back to the static copy bank if AI fails.
 */
async function generateAiCopy(
  angle: CreativeAngle,
  city?: string
): Promise<Omit<AdCopy, "imagePrompt">> {
  const base = COPY_BANK.find((c) => c.angle === angle)!;
  const cityContext = city ? ` targeting subcontractors in ${city}` : "";

  try {
    const prompt = `You write direct-response Meta ad copy for Builders Bid Book (buildersbidbook.com), a construction intelligence platform for subcontractors${cityContext}.

The angle is: "${angle}"
Base copy:
Headline: ${base.headline}
Primary text: ${base.primaryText}

Write a FRESH variation with:
- headline: max 40 chars, punchy, direct
- primaryText: 1-2 sentences max 200 chars, specific value for subcontractors, no fluff
- description: max 30 chars

Respond with ONLY valid JSON:
{"headline":"...","primaryText":"...","description":"..."}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      headline?: string;
      primaryText?: string;
      description?: string;
    };

    return {
      angle,
      headline: (parsed.headline ?? base.headline).slice(0, 40),
      primaryText: (parsed.primaryText ?? base.primaryText).slice(0, 255),
      description: (parsed.description ?? base.description).slice(0, 30),
      ctaType: base.ctaType,
    };
  } catch {
    // Fallback to static copy
    return {
      angle,
      headline: base.headline,
      primaryText: base.primaryText,
      description: base.description,
      ctaType: base.ctaType,
    };
  }
}

// ── Image generation ──────────────────────────────────────────────────────────

/** Generate an ad image via DALL-E 3 and return the temporary URL. */
async function generateAdImage(imagePrompt: string): Promise<string | null> {
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural",
    });
    return response.data?.[0]?.url ?? null;
  } catch (err) {
    console.error("[metaCreative] DALL-E generation failed:", err);
    return null;
  }
}

// ── Main creative generation ──────────────────────────────────────────────────

/**
 * Generate creative variants for a campaign.
 * Selects angles to test, generates copy + images, uploads images to Meta,
 * and saves MetaCreativeVariant records.
 *
 * Returns the IDs of created variants.
 */
export async function generateCreativeVariants(
  campaignId: string,
  options: { angles?: CreativeAngle[]; cityHint?: string } = {}
): Promise<string[]> {
  const angles: CreativeAngle[] = options.angles ?? [
    "zillow-of-construction",
    "find-active-projects",
    "track-before-others",
    "built-for-subs",
    "project-intel",
    "more-opportunities",
  ];

  const variantIds: string[] = [];
  const firstError: string[] = [];

  for (const angle of angles) {
    try {
      const base = COPY_BANK.find((c) => c.angle === angle)!;

      // Generate AI copy variant
      const copy = await generateAiCopy(angle, options.cityHint);

      // Generate image
      const imageUrl = await generateAdImage(base.imagePrompt);

      if (!imageUrl) {
        throw new Error(`DALL-E image generation returned null for angle ${angle}`);
      }

      // Stamp headline + logo onto image (same pipeline as Instagram posts)
      const stampedDataUri = await stampAndSaveImage(imageUrl, copy.headline);
      const stampedBase64  = stampedDataUri.replace(/^data:image\/jpeg;base64,/, '');
      const stampedBuffer  = Buffer.from(stampedBase64, 'base64');

      // Upload stamped image to Meta
      const metaImageHash = await uploadAdImage(imageUrl, stampedBuffer);

      // Save variant to DB (store stamped data URI so UI can preview it)
      const variant = await prisma.metaCreativeVariant.create({
        data: {
          campaignId,
          angle,
          headline: copy.headline,
          primaryText: copy.primaryText,
          description: copy.description ?? "",
          ctaType: copy.ctaType,
          imagePrompt: base.imagePrompt,
          imageUrl: stampedDataUri,
          metaImageHash,
        },
      });

      variantIds.push(variant.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[metaCreative] Failed to generate variant for angle ${angle}:`, msg);
      firstError.push(`[${angle}] ${msg}`);
    }
  }

  if (variantIds.length === 0 && firstError.length > 0) {
    throw new Error(`All variants failed. First error: ${firstError[0]}`);
  }

  return variantIds;
}

/**
 * Generate replacement creative variants for a city that has fatigued creatives.
 * Uses different angles than those already active.
 */
export async function refreshCreativesForCampaign(
  campaignId: string,
  usedAngles: CreativeAngle[]
): Promise<string[]> {
  const allAngles: CreativeAngle[] = [
    "zillow-of-construction",
    "find-active-projects",
    "track-before-others",
    "built-for-subs",
    "project-intel",
    "more-opportunities",
  ];

  // Rotate to unused or least-used angles
  const freshAngles = allAngles
    .filter((a) => !usedAngles.includes(a))
    .slice(0, 3);

  if (freshAngles.length === 0) {
    // All angles used — start over from the top 3
    return generateCreativeVariants(campaignId, {
      angles: allAngles.slice(0, 3),
    });
  }

  return generateCreativeVariants(campaignId, { angles: freshAngles });
}

/** Get the static copy for an angle (for AI judge input). */
export function getCopyForAngle(angle: string): AdCopy | undefined {
  return COPY_BANK.find((c) => c.angle === angle);
}
