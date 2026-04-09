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
  firstComment: string;
};

type PreviousPost = {
  headline: string;
  angle: string;
  caption: string;
  firstComment: string;
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
// Generate text content (caption, firstComment, imagePrompt, headline, angle)
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
   VISUAL STYLE RULES — THIS IS CRITICAL:
   - Background: BRIGHT VIVID ROYAL BLUE (like cobalt blue, electric blue) OR clean white. NEVER dark. NEVER navy. NEVER black.
   - Style: FLAT GRAPHIC DESIGN. Clean. Canva-style marketing poster. NOT photorealistic. NOT cinematic. NOT dark/moody.
   - Typography in image: Ultra-bold, heavy sans-serif, white text on blue OR blue text on white. Massive scale. The text is the hero element.
   - Acceptable visual elements: flat/illustrated construction icons, simple geometric shapes, a clean mockup card showing a project address and value, minimal clean layout
   - Color palette: vivid bright royal blue + white. Optional small orange/yellow accent.
   - Format: square 1:1, Instagram post size
   - Quality: sharp, crisp, clean edges — like a professionally designed Canva template
   - DO NOT generate: dark backgrounds, dramatic photography, cinematic lighting, photorealistic construction sites, shadowy or moody images
   - DO generate: clean bold typography layouts, bright blue flat design, infographic-style, bold marketing poster style
   - Example of what to generate: "Bold flat design poster with vivid royal blue background, massive white ultra-bold sans-serif text saying '[headline]' in center, clean minimal layout, small orange accent line, professional Instagram marketing creative, square format"

4. CAPTION (3-5 sentences):
   - Opens with a bold statement (NOT a question, NOT starting with an emoji)
   - Second sentence adds specificity (numbers, location, detail)
   - Third sentence positions BBB as the solution
   - CTA: "Link in bio" or "buildersbidbook.com"
   - Line breaks between sentences for Instagram readability
   - 8-10 relevant hashtags at end
   - Hashtags: #ContractorLife #SouthFlorida #ConstructionIndustry #BuildersLife #MiamiConstruction #GeneralContractor #Subcontractor #ConstructionBusiness #BuildersBidBook #FloridaConstruction

5. FIRST_COMMENT (1-2 sentences max):
   - Pinned comment for extra reach
   - Adds urgency, social proof, or teases a specific feature
   - Feels authentic, not like a bot
${previousContext}

Return ONLY valid JSON (no markdown):
{
  "headline": "...",
  "angle": "...",
  "imagePrompt": "...",
  "caption": "...",
  "firstComment": "..."
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
    headline: parsed.headline ?? '',
    angle: parsed.angle ?? '',
    imagePrompt: parsed.imagePrompt ?? '',
    caption: parsed.caption ?? '',
    firstComment: parsed.firstComment ?? '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate image via DALL-E 3
// Returns the temporary DALL-E URL — caller should stamp + save locally
// ─────────────────────────────────────────────────────────────────────────────
export async function generateInstagramImage(imagePrompt: string): Promise<string> {
  const openai = getOpenAI();

  // Append style enforcement — always push toward bright flat design
  const finalPrompt = [
    imagePrompt,
    'IMPORTANT: vivid bright royal blue background or clean white background ONLY.',
    'Flat graphic design style, NOT photorealistic, NOT dark, NOT cinematic.',
    'Ultra-bold heavy sans-serif typography as the main visual element.',
    'Clean professional marketing poster aesthetic.',
    'Square 1:1 format. Crisp sharp edges. No watermarks.',
  ].join(' ');

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: finalPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    style: 'natural', // 'natural' gives cleaner flat design vs 'vivid' which is dramatic
  });

  const url = response.data?.[0]?.url;
  return url ?? '';
}
