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
// Scene bank — one is selected at random in code so DALL-E varies every time.
// When people appear they must be from behind or side only — no face, no
// identifiable features. Variety across construction, data, aerial, design.
// ─────────────────────────────────────────────────────────────────────────────
const SCENE_BANK: Record<string, string> = {
  // ── Construction job site ─────────────────────────────────────────────────
  A: 'FRESH FOUNDATION: Freshly poured concrete slab on a South Florida residential lot, rebar grid, wooden forms at the perimeter, palm trees and bright blue sky, Florida sunshine, no people in frame',
  B: 'WOOD FRAMING: New home wood frame going up in a South Florida neighborhood, stud walls and roof trusses, one or two workers seen fully from behind wearing hard hats and work clothes — no faces visible, golden hour warm light',
  C: 'CBS BLOCK WALLS: Concrete block masonry walls rising on a residential site, exposed rebar columns, blue sky, palm trees along the street, typical Miami-Dade block, bright midday, no people',
  D: 'EMPTY LOT: Cleared residential lot ready for construction, surrounding stucco homes visible, fresh gravel and surveyor stakes, palm trees, bright sunny South Florida day, no people',
  E: 'EXCAVATOR ACTIVE: Yellow excavator clearing a residential South Florida lot, freshly turned red soil, palm trees at the property edge, bright blue sky, high-energy job site — operator silhouette in closed cab only if visible, no faces',
  F: 'CONCRETE POUR: Concrete mixer truck chute pouring concrete into residential forms, two workers seen from behind in hard hats guiding the pour, dramatic South Florida daylight, action shot, no faces',
  G: 'ROOFTOP ANGLE: Looking up from the ground at the bare roof trusses of a new South Florida home under construction, vivid blue sky and palm fronds framing the shot, strong geometric lines, no people',
  H: 'FINISHED NEW BUILD: Brand-new modern stucco home, white exterior, large impact windows, paver driveway, lush tropical landscaping, real estate photography quality, no people, no cars',
  I: 'ELECTRICAL ROUGH-IN: Interior of a home under construction, exposed stud walls, clean electrical conduit runs and junction boxes, warm work-light glow, no people visible',
  J: 'CONTRACTOR REVIEWING PLANS: Contractor seen fully from behind — hard hat on, work clothes — holding rolled blueprints while standing in front of a half-built stucco home, South Florida vegetation, morning light, face never visible',

  // ── Flat lays / documents / permits ──────────────────────────────────────
  K: 'BLUEPRINT FLAT LAY: Overhead shot of large architectural blueprints spread across a construction table, yellow hard hat resting on one corner, measuring tape and pencil beside it, no hands or people in frame, warm editorial lighting',
  L: 'PERMIT DOCUMENTS FLAT LAY: Stack of official South Florida building permit documents with architectural stamps and property details, a ruler and red pen on top, clean desk surface, overhead photography, no people',
  M: 'TOOLS FLAT LAY: Tool belt, yellow hard hat, folded permit papers, measuring tape, and pencil arranged on rough plywood — warm shallow depth-of-field editorial photo, no hands or people visible',
  N: 'PERMIT SIGN CLOSEUP: Official building permit posted on a wooden stake in front of a South Florida property, bokeh palm trees and residential street in background, golden hour light, no people',

  // ── Aerial / neighborhood ─────────────────────────────────────────────────
  O: 'AERIAL NEIGHBORHOOD: Drone view straight down at a South Florida residential neighborhood — grid of streets, stucco rooftops, green yards, two lots clearly mid-construction, palm canopy throughout, no people visible from above',
  P: 'AERIAL CONSTRUCTION SITE: Drone shot looking down at a single active South Florida residential construction site — concrete slab and framing visible from above, surrounded by neighboring homes, bright midday',
  Q: 'MIAMI STREET LEVEL: Wide-angle view of a typical Miami-Dade residential block, two homes under construction side by side, stucco homes complete on either side, palm-lined street, bright day, no people',
  R: 'DORAL TOWNHOUSES: Row of new modern townhouses under construction in a South Florida suburb, CBS block walls at various stages, stacked materials, palm trees, bright sky, no people',

  // ── Tech / platform / data-adjacent ──────────────────────────────────────
  S: 'LAPTOP WITH MAP: Open laptop on a weathered job-site folding table outdoors, screen showing a satellite map view with bright blue dots pinned across South Florida neighborhoods, rolled blueprints beside it, natural daylight, no people',
  T: 'DATA DESK FLATLAY: Overhead shot of a clean desk — printed satellite map of Miami-Dade with blue circles marking active projects, a stack of permits, yellow hard hat, measuring tape, no people, crisp studio lighting',
  U: 'PERMIT STACK WITH LAPTOP: Thick stack of building permit printouts beside an open laptop, mechanical pencil on top, South Florida palm trees visible through a window behind, no people, bright natural light',
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

  // Pick scene in code so DALL-E gets true variety — NOT left to the AI
  const sceneKeys = Object.keys(SCENE_BANK);
  const chosenSceneKey = sceneKeys[Math.floor(Math.random() * sceneKeys.length)];
  const chosenScene = SCENE_BANK[chosenSceneKey];

  const systemPrompt = `You are an elite Instagram marketing strategist for Builders Bid Book — a construction intelligence platform for South Florida contractors.

${BBB_BRAND_CONTEXT}

YOUR MISSION:
Generate ONE complete viral Instagram post. The content must be bold, direct, and feel like a premium paid ad.

SUGGESTED ANGLE: ${suggestedAngle}

GENERATION RULES:

1. HEADLINE (max 7 words):
   - Bold, scroll-stopping text that will appear on the image
   - SIMPLE, DIRECT words only — many contractors speak English as a second language (Spanish, Creole). Anyone must understand it in under 2 seconds.
   - NO idioms, NO wordplay, NO riddles, NO metaphors, NO clever phrases that require cultural knowledge
   - Use plain action words and numbers: Find, Get, Win, Beat, Know, See, More, Now, Today, First, Every, New
   - Good examples: "We Find Construction Projects Near You" | "Know Exactly Who's Building Near You" | "Find New Projects Before Your Competition" | "More Bids. More Work. More Money." | "See Every New Permit In Miami Today"
   - Bad examples (too clever / idiomatic): "Get There Before Ground Is Broken" | "The Early Bird Gets the Bid" | "Strike While the Iron Is Hot"

2. ANGLE (1 short phrase):
   - The core marketing concept for memory/tracking
   - Example: "competitor FOMO" or "platform UI mockup" or "permits data urgency"

3. IMAGE_PROMPT (for DALL-E 3 — follow these rules EXACTLY):
   THE IMAGE IS A BACKGROUND SCENE ONLY. Text and logo are added separately in post-processing.

   ━━━ ABSOLUTE RULES — NEVER BREAK THESE ━━━
   • If any person appears: ONLY from behind or side profile — hard hat on, generic work clothes, NO face visible, NO identifiable features, NO specific ethnicity or gender readable.
   • NO text, NO words, NO readable signs, NO logos, NO watermarks anywhere in the image.
   • NOT skyscrapers or high-rises — residential and small commercial only.

   MANDATORY SCENE — use EXACTLY this, no substitutions:
   "${chosenScene}"

   VISUAL STYLE:
   - Professional editorial/magazine photography — bright, clean, sharp, well-lit
   - South Florida feel: vivid blue sky, palm trees, tropical daylight
   - Square 1:1 composition — strongest visual element in upper 60%, bottom-left area kept open (text overlay goes there)
   - High contrast, saturated colors, premium quality

   Write the imagePrompt as a detailed vivid description of this specific scene only.
   End with: "No people, no humans, no faces, no text, no logos, no watermarks."

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

  return {
    headline:    parsed.headline    ?? '',
    angle:       parsed.angle       ?? '',
    imagePrompt: parsed.imagePrompt ?? '',
    caption:     parsed.caption     ?? '',
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
    'Professional editorial photography. Bright, vibrant, well-lit. South Florida / Miami feel. Magazine cover quality.',
    'If any person appears: show only from behind or side with no face visible, wearing a hard hat and work clothes — generic, no identifiable features.',
    'NO text, NO words, NO readable signs, NO logos, NO watermarks anywhere in the image.',
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
