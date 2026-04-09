import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────────────────────
// Brand context — update this when messaging evolves.
// ─────────────────────────────────────────────────────────────────────────────
export const BBB_BRAND_CONTEXT = `
BRAND: Builders Bid Book (buildersbidbook.com)

WHAT IT IS:
A construction intelligence platform that gives South Florida contractors an unfair advantage. It surfaces active construction projects, permits, bidding opportunities, and owner/developer contact info — all in one place.

WHAT IT DOES FOR CONTRACTORS:
- Discover new construction projects and permits the moment they're filed
- Find bidding opportunities before competitors even know they exist
- Access owner/developer contact info to reach decision makers directly
- Track local construction activity in real time
- Stop wasting time cold-calling — bid on real, active projects

TARGET AUDIENCE:
Subcontractors, general contractors, estimators, construction business owners in South Florida (Miami-Dade, Broward, Palm Beach). Builders who hustle and want more bids.

BRAND PERSONALITY:
Aggressive, exclusive, powerful, FOMO-inducing. Miami energy. First to know = first to bid = first to win.

VISUAL BRAND IDENTITY (CRITICAL):
- Primary brand color: vivid, bright ROYAL BLUE (like cobalt blue, #1055FF). NOT dark navy. NOT midnight blue. BRIGHT BOLD BLUE.
- Secondary colors: white, and orange/yellow as accent only
- Background options: solid bright royal blue OR clean white
- Logo: white pill-shaped badge with "BUILDER'S BID BOOK" bold blue text + hammer icon (appears in corner of posts)
- Style: FLAT GRAPHIC DESIGN — clean, modern, Canva-style marketing creative
- Typography: ultra-bold, heavy-weight, massive sans-serif — the text IS the design
- NOT photorealistic. NOT dark. NOT cinematic. NOT moody.
- Think: a clean, bold Canva template made by a professional designer
`;

export type GeneratedContent = {
  headline: string;
  angle: string;
  imagePrompt: string;
  caption: string;
};

type PreviousPost = {
  headline: string;
  angle: string;
  caption: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Angle bank — ensures diversity across generations
// ─────────────────────────────────────────────────────────────────────────────
const ANGLE_BANK = [
  'FOMO angle — competitors are winning bids you should have gotten',
  'Data/permits angle — specific numbers about South Florida construction activity right now',
  'Pain point angle — frustration of losing a bid to someone who found the project first',
  'Urgency angle — projects being claimed today while you wait',
  'Platform feature angle — show a specific thing the platform does (map, permit card, project details)',
  'Success/transformation angle — what changes when you use BBB',
  'Market insight angle — what is happening in South Florida construction right now',
  'First mover angle — first to bid has the highest win rate',
  'Hustle angle — real contractors go find the work, they do not wait for it',
  'Permits angle — permits filed today are jobs starting next month',
  '"Tinder of Construction" angle — matching contractors to projects',
  'Local specificity angle — Miami, Miami-Dade, Broward, Doral, Hialeah — specific neighborhoods',
];

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate text content (caption, imagePrompt, headline, angle)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateInstagramContent(
  previousPosts: PreviousPost[]
): Promise<GeneratedContent> {
  const openai = getOpenAI();

  const previousContext =
    previousPosts.length > 0
      ? `\n\nPREVIOUSLY GENERATED (DO NOT REPEAT these hooks, angles, structures, or phrases):\n${previousPosts
          .slice(0, 30)
          .map(
            (p, i) =>
              `${i + 1}. Angle: "${p.angle}" | Headline: "${p.headline}" | Caption start: "${p.caption.slice(0, 100)}..."`
          )
          .join('\n')}`
      : '';

  const suggestedAngle = ANGLE_BANK[Math.floor(Math.random() * ANGLE_BANK.length)];

  const systemPrompt = `You are an elite Instagram marketing strategist for Builders Bid Book — a construction intelligence platform for South Florida contractors.

${BBB_BRAND_CONTEXT}

YOUR MISSION:
Generate ONE complete viral Instagram post. The content must be bold, direct, and feel like a premium paid ad.

SUGGESTED ANGLE: ${suggestedAngle}

GENERATION RULES:

1. HEADLINE (max 7 words):
   - Bold, scroll-stopping text that will appear on the image
   - Heavy and direct — almost aggressive
   - Examples from real past posts: "Welcome to the Tinder of Construction" | "The Forecast of Construction" | "We Find Construction Projects Near You" | "Know Exactly Who's Planning to Build"

2. ANGLE (1 short phrase):
   - The core marketing concept for memory/tracking
   - Example: "competitor FOMO" or "platform UI mockup" or "permits data urgency"

3. IMAGE_PROMPT (for DALL-E 3 — follow these rules EXACTLY):
   THE IMAGE IS A BACKGROUND SCENE ONLY. Text and logo are added separately — do NOT include any text or words in the image.

   VISUAL STYLE:
   - Professional editorial/magazine photography — like Architectural Digest meets a construction trade magazine
   - Bright, clean, well-lit — NOT dark, NOT moody, NOT night shots
   - South Florida vibes: blue skies, palm trees in the background, tropical daylight
   - High contrast, sharp details, professional photography quality
   - Square 1:1 composition with the strongest visual element centered or in the upper 60% (lower 40% will have a text overlay so keep it less busy)
   - NO text, NO logos, NO watermarks in the generated image

   IMPORTANT ABOUT THE BUSINESS: Builders Bid Book is about RESIDENTIAL and small commercial construction — new home builds, townhouses, duplexes, small apartment buildings, additions. NOT skyscrapers. NOT downtown high-rises. Think South Florida neighborhoods, subdivision lots, single-family homes being built, small contractors on job sites.

   CHOOSE ONE of these scene types — pick whichever fits the post angle best:
   A) FRESH FOUNDATION: Wide shot of a freshly poured concrete slab on a South Florida residential lot, rebar poking up, wooden forms around the perimeter, palm trees and blue sky in background, bright Florida sunshine, professional real estate photography
   B) WOOD FRAMING: New home wood framing going up in a South Florida neighborhood, 2x4 stud walls and roof trusses taking shape, workers visible from behind in hard hats, clear blue sky above, warm golden hour lighting, editorial construction photography
   C) EMPTY LOT: A cleared residential building lot in a South Florida neighborhood with a "permit posted" sign, surrounding homes visible, palm trees, lush green grass, bright sunny day, the kind of lot a subcontractor would want to find first
   D) BLUEPRINT FLAT LAY: Overhead close-up of residential house blueprints and architectural plans spread on a wooden table, yellow hard hat placed on top, measuring tape, pencil, coffee cup — clean and warm studio lighting, professional real estate photography
   E) CONTRACTOR MOMENT: A contractor or small crew (seen from behind or side — no faces) reviewing plans on a clipboard while standing in front of a residential home under construction, Florida vegetation visible, authentic job site feel, editorial photography style
   F) CONCRETE BLOCK WALLS: South Florida-style CBS (concrete block) residential construction in progress — block walls going up, rebar columns, blue sky, palm trees, typical Miami-Dade or Broward residential street, bright midday light
   G) FINISHED NEW BUILD: A brand-new modern residential home just completed in South Florida — clean stucco exterior, impact windows, paver driveway, tropical landscaping, bright sunny day, real estate listing photography quality
   H) TOOLS AND TRADE: Close-up still life of contractor tools on a job site — worn leather tool belt, measuring tape, hard hat, permit documents spread on plywood — warm natural light, authentic and gritty, professional editorial photography

   Pick ONE scene. Describe it with specific South Florida details (neighborhood feel, tropical vegetation, Florida sky, warm light).

   TYPOGRAPHY OVERLAY — include this in the image:
   - At the bottom 30% of the image, add a semi-transparent dark overlay band
   - On that band, render the HEADLINE in large bold clean white sans-serif uppercase text
   - The headline text must be perfectly readable, clean, and sharp
   - Use conservative modern typography — think bold editorial magazine font
   - No decorative fonts, no scripts, no distorted text — clean and professional
   - The headline will be provided — embed it exactly as written in uppercase bold white text
   - Small "buildersbidbook.com" label in smaller white text below the headline

   End with: "No logos, no watermarks. Text must be crisp, perfectly spelled, and clearly readable."

4. CAPTION (3-5 sentences):
   - Opens with a bold statement (NOT a question, NOT starting with an emoji)
   - Second sentence adds specificity (numbers, location, detail)
   - Third sentence positions BBB as the solution
   - CTA: "Link in bio" or "buildersbidbook.com"
   - Line breaks between sentences for Instagram readability
   - 8-10 relevant hashtags at end
   - Hashtags: #ContractorLife #SouthFlorida #ConstructionIndustry #BuildersLife #MiamiConstruction #GeneralContractor #Subcontractor #ConstructionBusiness #BuildersBidBook #FloridaConstruction
${previousContext}

Return ONLY valid JSON (no markdown):
{
  "headline": "...",
  "angle": "...",
  "imagePrompt": "...",
  "caption": "..."
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: 'Generate a completely fresh, viral Instagram post for Builders Bid Book. Make it bold and distinct from anything previously created.',
      },
    ],
    temperature: 0.92,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as GeneratedContent;

  const headline = parsed.headline ?? '';
  const baseImagePrompt = parsed.imagePrompt ?? '';

  // Inject the exact headline into the image prompt so DALL-E renders the text
  const imagePrompt = headline
    ? `${baseImagePrompt} The headline text to render on the dark overlay band at the bottom is: "${headline.toUpperCase()}" — bold, white, clean sans-serif, perfectly spelled and readable. Below it in smaller text: "BUILDERSBIDBOOK.COM"`
    : baseImagePrompt;

  return {
    headline,
    angle: parsed.angle ?? '',
    imagePrompt,
    caption: parsed.caption ?? '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate image via DALL-E 3
// Returns the temporary DALL-E URL — caller should stamp + save locally
// ─────────────────────────────────────────────────────────────────────────────
export async function generateInstagramImage(imagePrompt: string): Promise<string> {
  const openai = getOpenAI();

  // Append style enforcement
  const finalPrompt = [
    imagePrompt,
    'Professional editorial photography. Bright, vibrant, well-lit.',
    'South Florida / Miami feel. Magazine cover quality.',
    'NO text, NO words, NO logos, NO watermarks anywhere in the image.',
    'Square 1:1 format. Ultra-sharp. High resolution.',
  ].join(' ');

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: finalPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    style: 'vivid', // vivid = saturated, punchy colors — good for South Florida photography
  });

  const url = response.data?.[0]?.url;
  return url ?? '';
}
