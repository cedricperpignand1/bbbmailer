import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────────────────────
// Brand context — injected into every prompt so the AI always "knows" BBB.
// Update this when messaging evolves.
// ─────────────────────────────────────────────────────────────────────────────
export const BBB_BRAND_CONTEXT = `
BRAND: Builders Bid Book (buildersbidbook.com)

WHAT IT IS:
A premium construction intelligence platform that gives contractors and subcontractors an unfair advantage by surfacing active construction projects, permits, bidding opportunities, and owner/developer contact info — all in one place. Think of it as Bloomberg Terminal for South Florida construction.

WHAT IT DOES FOR CONTRACTORS:
- Discover new construction projects and permits the moment they're filed
- Find bidding opportunities before competitors even know they exist
- Access owner/developer contact info to reach decision makers directly
- Track local construction activity by city, trade, and project type
- Get alerts for projects in your specific service area
- Stop wasting time cold-calling — bid on real, active projects

TARGET AUDIENCE:
Subcontractors, general contractors, estimators, construction business owners in South Florida (Miami-Dade, Broward, Palm Beach). Builders who hustle, want more bids, and want to grow their business. They understand that in construction, the first contractor to bid often wins.

BRAND PERSONALITY:
Aggressive, exclusive, powerful, FOMO-inducing. Miami energy. Hustle culture. Like having a cheat code for finding construction work. Premium but direct. Think: "your competition is already using this."

CORE EMOTIONAL HOOKS:
- First to know = first to bid = first to win
- Stop losing bids to contractors who find projects faster
- Every day you wait, someone else gets the job
- Your competition is watching every permit filed in the county
- The platform that serious contractors use

KEY MESSAGES:
- "Find projects before your competition"
- "Built for contractors who refuse to lose"
- "Every permit filed. Every project tracked. All in one place."
- "The ones using BBB don't wait for work — they find it"
- "South Florida's most powerful construction intelligence platform"
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
  'FOMO angle — competitor already winning the bids you should have',
  'Data/stats angle — specific numbers about South Florida construction activity',
  'Pain point angle — frustration of showing up late to bid on a job already awarded',
  'Urgency/scarcity angle — projects being claimed right now while you sleep',
  'Authority/insider angle — the intelligence only serious contractors have access to',
  'Success story angle — contractor who doubled bids by finding projects first',
  'Market insight angle — what is happening in South Florida construction right now',
  'First mover angle — the first to bid has the highest chance of winning',
  'Transformation angle — from cold calling to having projects come to you',
  'Fear of irrelevance angle — what happens to contractors who do not adapt',
  'Hustle angle — real contractors do not wait for RFPs, they find the work themselves',
  'Permits angle — permits filed today are projects starting tomorrow',
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

  // Build anti-repetition context from recent history
  const previousContext =
    previousPosts.length > 0
      ? `\n\nPREVIOUSLY GENERATED CONTENT (YOU MUST NOT REPEAT these hooks, angles, structures, phrases, or concepts — be completely fresh):\n${previousPosts
          .slice(0, 30)
          .map(
            (p, i) =>
              `${i + 1}. Angle: "${p.angle}" | Headline: "${p.headline}" | Caption start: "${p.caption.slice(0, 100)}..."`
          )
          .join('\n')}`
      : '';

  // Pick a random angle suggestion to seed diversity
  const suggestedAngle = ANGLE_BANK[Math.floor(Math.random() * ANGLE_BANK.length)];

  const systemPrompt = `You are an elite Instagram marketing strategist and creative director for Builders Bid Book — a premium construction intelligence platform for South Florida contractors.

${BBB_BRAND_CONTEXT}

YOUR MISSION:
Generate ONE complete, viral-quality Instagram post. This must feel like a premium paid advertisement — bold, scroll-stopping, powerful. NOT generic AI content. NOT motivational quote filler. Real marketing that makes contractors stop scrolling and want to sign up.

SUGGESTED ANGLE TO EXPLORE: ${suggestedAngle}
(You can use this angle or choose a fresher one — but it must be distinct from previous posts)

GENERATION RULES:

1. HEADLINE (max 7 words):
   - Appears on the image itself as bold overlay text
   - Scroll-stopping, punchy, almost aggressive
   - Examples: "Your Competition Already Found This Job" | "37 New Permits Filed This Morning" | "The Platform Serious Contractors Use"

2. ANGLE (1 phrase):
   - The core marketing angle driving this post
   - Used for memory tracking to prevent repetition
   - Example: "competitor FOMO angle" or "data scarcity urgency angle"

3. IMAGE_PROMPT (for DALL-E 3):
   - Describe a bold, ad-style image
   - Visual must feel like a premium construction/real estate startup ad
   - Background: dark navy OR dramatic construction site at golden hour OR city skyline with cranes
   - Color palette: deep navy blues, white, yellow/gold accents
   - Include: construction cranes, city skylines, blueprint overlays, building frameworks, dramatic lighting
   - Style: ultra-sharp, high-contrast, photorealistic or bold graphic poster
   - Format: square 1:1 ratio, Instagram-optimized
   - DO NOT describe any faces or specific people
   - DO NOT include any text in the image description (text will be overlaid separately)
   - Examples: "Wide-angle shot of Miami skyline at dusk with multiple cranes silhouetted against a deep navy and amber sky, dramatic high-contrast cinematic photography, construction site in foreground, bokeh lights, premium real estate advertisement style, square format"

4. CAPTION (Instagram post body, 3-5 sentences):
   - Opens with a powerful statement — NOT a question, NOT an emoji opener
   - Second sentence escalates the idea or adds a specific detail (numbers, location, specificity)
   - Third sentence positions Builders Bid Book as the solution
   - CTA: end with clear action — "Link in bio to get access" or "Join at buildersbidbook.com"
   - Line breaks between sentences for Instagram readability
   - 8-12 hashtags at the end (construction-specific + South Florida specific): #ContractorLife #SouthFlorida #ConstructionIndustry #BuildersLife #MiamiConstruction #GeneralContractor #Subcontractor #ConstructionBusiness #BidBook #BuildersBidBook #FloridaConstruction #ContractorTips
   - Hashtags must feel natural, not spammy

5. FIRST_COMMENT (1-2 sentences max):
   - This gets pinned as the first comment to boost reach
   - Provides urgency, social proof, or teases a specific platform feature
   - Examples: "Contractors in Miami-Dade found 140+ new permit opportunities this week alone." | "The ones who find projects first don't wait for RFPs. They use the right tools."
   - Must feel authentic, not like a bot wrote it
${previousContext}

Return ONLY valid JSON (no markdown, no code blocks, just the raw JSON object):
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
        content:
          'Generate a completely fresh, viral Instagram post concept for Builders Bid Book right now. Make it powerful and distinct from anything previously created.',
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
// Returns the temporary image URL (valid for ~1 hour after generation)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateInstagramImage(imagePrompt: string): Promise<string> {
  const openai = getOpenAI();

  // Append consistent style modifiers to enforce BBB brand aesthetic
  const finalPrompt = [
    imagePrompt,
    'Ultra-high resolution, professional advertising photography quality.',
    'Bold graphic design aesthetic. Deep navy or dark dramatic background.',
    'Yellow and white accent colors. Premium construction startup brand aesthetic.',
    'Instagram square 1:1 format. Cinematic lighting. No faces. No text overlays.',
    'Style: premium startup advertising meets construction industry marketing.',
  ].join(' ');

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: finalPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'hd',
    style: 'vivid',
  });

  const url = response.data?.[0]?.url;
  return url ?? '';
}
