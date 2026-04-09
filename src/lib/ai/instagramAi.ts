import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS BID BOOK — INSTAGRAM CONTENT ENGINE
// Full upgraded version
// ─────────────────────────────────────────────────────────────────────────────

export const BBB_BRAND_CONTEXT = `
BRAND: Builders Bid Book (buildersbidbook.com)

CORE POSITIONING:
Builders Bid Book is a construction intelligence platform for South Florida contractors.
It helps subs, GCs, estimators, and construction business owners find real projects faster,
see construction activity earlier, and reach owners / developers directly.

WHAT CONTRACTORS GET:
- Active construction projects in South Florida
- New permits as they are filed
- Bidding opportunities before most competitors know about them
- Owner / developer contact info
- Local project intelligence in one place
- Faster prospecting with less wasted time

CORE EMOTIONAL SELL:
If you see the project first, you have the first shot at the money.
Speed matters. Local information matters. Access matters.

TARGET AUDIENCE:
- Subcontractors
- General contractors
- Estimators
- Small construction business owners
- Hustlers in Miami-Dade, Broward, Palm Beach
- Contractors who want more bids, more work, more money

BRAND PERSONALITY:
- Aggressive
- Exclusive
- Smart
- Powerful
- FOMO-driven
- Local
- Clear
- Bold
- Miami energy
- No fluff

VISUAL BRAND IDENTITY (CRITICAL):
- Primary brand color: BRIGHT ROYAL BLUE / COBALT BLUE (#1055FF style)
- Secondary colors: white
- Accent colors: orange / yellow in small amounts only
- Background style: clean white or bright royal blue
- Text style: ultra-bold, heavy, huge sans-serif
- Layout style: Canva-style premium marketing creative
- Style should feel like a high-converting social ad
- NOT cinematic
- NOT moody
- NOT dark luxury
- NOT gritty grunge
- NOT photorealistic poster with dramatic shadows
- Flat, clean, premium, sharp, bright, social-media-native

LOGO RULE:
- White pill badge with BUILDER'S BID BOOK in bold blue
- Hammer icon
- Logo is added later in post-processing
- AI image must NOT generate any logo or text

IMPORTANT BRAND LANGUAGE:
Use direct contractor language:
- projects
- permits
- bids
- work
- jobs
- owners
- developers
- local construction
- competition
- first
- today
- near you
- South Florida

AVOID:
- cheesy slogans
- vague motivational language
- corporate jargon
- startup-speak
- abstract metaphors
- cute wordplay
- confusing hooks
`;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type GeneratedContent = {
  headline: string;
  subheadline?: string;
  cta?: string;
  angle: string;
  imagePrompt: string;
  caption: string;
};

type PreviousPost = {
  headline: string;
  angle: string;
  caption: string;
};

type Scene = {
  id: string;
  label: string;
  category: 'jobsite' | 'documents' | 'aerial' | 'tech' | 'luxury-home' | 'permit-board';
  description: string;
  allowPeople?: boolean;
  layoutHint: string;
};

type HookPack = {
  id: string;
  angle: string;
  intent: string;
  emotionalDriver: string;
  examples: string[];
};

type PromptBundle = {
  scene: Scene;
  hook: HookPack;
  marketFocus: string;
  detailLine: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE BANK
// More variety. All still on-brand.
// ─────────────────────────────────────────────────────────────────────────────

const SCENE_BANK: Scene[] = [
  {
    id: 'A1',
    label: 'Fresh concrete slab',
    category: 'jobsite',
    description:
      'Freshly poured concrete slab on a South Florida residential lot, clean wooden forms, rebar at edges, bright tropical daylight, palm trees, vivid blue sky, crisp professional composition',
    allowPeople: false,
    layoutHint: 'Keep lower-left and top-center visually clean for bold text overlay',
  },
  {
    id: 'A2',
    label: 'Wood framing home build',
    category: 'jobsite',
    description:
      'New residential wood framing in a South Florida neighborhood, roof trusses and stud walls, premium editorial construction photography, vivid blue sky, palm trees, bright sun',
    allowPeople: true,
    layoutHint: 'Strong framing structure in upper half, clean negative space in bottom-left',
  },
  {
    id: 'A3',
    label: 'CBS block construction',
    category: 'jobsite',
    description:
      'Concrete block masonry walls going up on a South Florida residential site, rebar columns, stacked materials, bright midday light, tropical surroundings',
    allowPeople: false,
    layoutHint: 'Subject centered, left edge clean for large text',
  },
  {
    id: 'A4',
    label: 'Excavator on cleared lot',
    category: 'jobsite',
    description:
      'Yellow excavator working on a cleared South Florida lot, fresh soil, palm trees, warm bright daylight, premium construction editorial style',
    allowPeople: false,
    layoutHint: 'Machine in upper-right, open lower-left for headline',
  },
  {
    id: 'A5',
    label: 'Concrete pour action',
    category: 'jobsite',
    description:
      'Concrete truck chute pouring into residential forms, active job site in South Florida, bright high-energy daylight, clean premium photo style',
    allowPeople: true,
    layoutHint: 'Action focused in top half, bold text zone preserved lower-left',
  },
  {
    id: 'A6',
    label: 'Contractor reviewing plans from behind',
    category: 'jobsite',
    description:
      'Contractor standing fully from behind holding rolled plans while facing a home under construction, South Florida vegetation, bright morning light, premium editorial style',
    allowPeople: true,
    layoutHint: 'Person on right third, open left side for ad text',
  },
  {
    id: 'B1',
    label: 'Blueprint flat lay',
    category: 'documents',
    description:
      'Overhead flat lay of architectural blueprints, measuring tape, pencil, yellow hard hat, clean desk or plywood surface, bright crisp lighting',
    allowPeople: false,
    layoutHint: 'Blueprint detail across frame with open lower-left for typography',
  },
  {
    id: 'B2',
    label: 'Permit documents flat lay',
    category: 'documents',
    description:
      'Stack of South Florida building permit style paperwork, ruler, pen, clipboard, crisp overhead composition, bright studio lighting, premium marketing look',
    allowPeople: false,
    layoutHint: 'Papers concentrated upper-right, left side clean',
  },
  {
    id: 'B3',
    label: 'Permit board in front of property',
    category: 'permit-board',
    description:
      'Building permit board posted in front of a South Florida residential property under construction, palm trees blurred in background, bright daylight',
    allowPeople: false,
    layoutHint: 'Permit board upper-middle, clear lower-left area',
  },
  {
    id: 'B4',
    label: 'Tools and permit papers',
    category: 'documents',
    description:
      'Tool belt, folded permit papers, measuring tape, hard hat arranged on plywood, clean bright ad-style composition',
    allowPeople: false,
    layoutHint: 'Cluster in upper half, preserve bottom-left open space',
  },
  {
    id: 'C1',
    label: 'Aerial neighborhood construction',
    category: 'aerial',
    description:
      'Drone view of a South Florida residential neighborhood with a few lots visibly under construction, palm canopy, bright tropical light, clean urban pattern',
    allowPeople: false,
    layoutHint: 'Main visual energy top and center, open lower-left text area',
  },
  {
    id: 'C2',
    label: 'Single aerial construction site',
    category: 'aerial',
    description:
      'Drone shot looking down on one active South Florida residential construction site surrounded by finished homes, bright midday sun',
    allowPeople: false,
    layoutHint: 'Site centered high, keep lower-left negative space simple',
  },
  {
    id: 'C3',
    label: 'Miami neighborhood street with active builds',
    category: 'aerial',
    description:
      'Street-level wide view of a Miami-Dade residential block with homes under construction, palm-lined street, bright clear sky, clean premium real estate photo feel',
    allowPeople: false,
    layoutHint: 'Buildings dominate upper 60%, text room at lower-left',
  },
  {
    id: 'D1',
    label: 'Laptop with project map',
    category: 'tech',
    description:
      'Open laptop on a folding table outdoors at a construction setting, map-like project tracking screen visible with bright blue markers, rolled plans nearby, daylight',
    allowPeople: false,
    layoutHint: 'Laptop on right or center-right, negative space left',
  },
  {
    id: 'D2',
    label: 'Data desk flat lay',
    category: 'tech',
    description:
      'Clean desk flat lay with printed satellite map of Miami-Dade, blue project markers, permit stack, hard hat, measuring tape, sharp bright studio lighting',
    allowPeople: false,
    layoutHint: 'Map concentrated upper-right, clean left side',
  },
  {
    id: 'D3',
    label: 'Permit stack beside laptop',
    category: 'tech',
    description:
      'Large stack of permit printouts beside an open laptop, natural light, palm trees visible through a window, bright premium office feel',
    allowPeople: false,
    layoutHint: 'Objects grouped right, spacious left text field',
  },
  {
    id: 'E1',
    label: 'Luxury new build',
    category: 'luxury-home',
    description:
      'Brand-new modern South Florida stucco home with large impact windows, tropical landscaping, paver driveway, bright editorial real estate photography',
    allowPeople: false,
    layoutHint: 'Home in upper frame, lower-left reserved for bold copy',
  },
  {
    id: 'E2',
    label: 'Townhomes under construction',
    category: 'luxury-home',
    description:
      'New row of modern townhomes under construction in South Florida, block walls in progress, stacks of material, palm trees, vivid daylight',
    allowPeople: false,
    layoutHint: 'Buildings carry top half, lower-left remains clean',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ANGLE / HOOK BANK
// These control the psychology and messaging strategy
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_BANK: HookPack[] = [
  {
    id: 'H1',
    angle: 'competitor FOMO',
    intent: 'Show that competitors are finding work first',
    emotionalDriver: 'fear of being late',
    examples: [
      'Your competition is finding projects first',
      'The first contractor to see it usually wins the shot',
      'You are losing bids before you even know the project exists',
    ],
  },
  {
    id: 'H2',
    angle: 'permit speed advantage',
    intent: 'Connect permits today with jobs tomorrow',
    emotionalDriver: 'urgency',
    examples: [
      'Permits filed today become jobs next',
      'See construction starting before everybody else',
      'Know who is building while others are still guessing',
    ],
  },
  {
    id: 'H3',
    angle: 'local project discovery',
    intent: 'Make the product feel hyper-local and practical',
    emotionalDriver: 'control',
    examples: [
      'See what is being built near you',
      'Find projects in Miami before your competition',
      'South Florida contractors need local intel',
    ],
  },
  {
    id: 'H4',
    angle: 'owner contact advantage',
    intent: 'Stress direct access to decision makers',
    emotionalDriver: 'power',
    examples: [
      'Reach owners directly',
      'Stop guessing who to call',
      'Get the contact info behind the project',
    ],
  },
  {
    id: 'H5',
    angle: 'real contractor hustle',
    intent: 'Frame BBB as a hustler tool',
    emotionalDriver: 'identity',
    examples: [
      'Real contractors go find the work',
      'The hungriest contractors do not wait',
      'Serious builders track jobs every day',
    ],
  },
  {
    id: 'H6',
    angle: 'map intelligence',
    intent: 'Show visual platform value',
    emotionalDriver: 'clarity',
    examples: [
      'See active construction on a map',
      'Track projects visually',
      'Construction activity all in one place',
    ],
  },
  {
    id: 'H7',
    angle: 'more bids more money',
    intent: 'Tie usage directly to financial upside',
    emotionalDriver: 'gain',
    examples: [
      'More projects means more bids',
      'More bids means more work',
      'More work means more money',
    ],
  },
  {
    id: 'H8',
    angle: 'Miami market activity',
    intent: 'Use regional momentum',
    emotionalDriver: 'relevance',
    examples: [
      'Miami is building every day',
      'South Florida construction never stops',
      'Work is moving fast in this market',
    ],
  },
  {
    id: 'H9',
    angle: 'pain of late discovery',
    intent: 'Hit the frustration point',
    emotionalDriver: 'regret',
    examples: [
      'Worst feeling is hearing about a project too late',
      'By the time most people find it, it is already moving',
      'Late information kills good opportunities',
    ],
  },
  {
    id: 'H10',
    angle: 'exclusive access',
    intent: 'Make the platform feel unfairly valuable',
    emotionalDriver: 'exclusivity',
    examples: [
      'This is the unfair advantage',
      'Get access most contractors do not have',
      'Be the first one in the room',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL MARKET SPECIFICITY BANK
// Makes posts feel more real and less generic
// ─────────────────────────────────────────────────────────────────────────────

const MARKET_FOCUS_BANK = [
  'Miami-Dade residential construction activity',
  'South Florida permits and active job sites',
  'Miami, Hialeah, Doral, Kendall, Homestead project movement',
  'Broward and Miami-Dade contractors competing for local work',
  'South Florida builders chasing new jobs every week',
  'Residential and small commercial jobs across Miami-Dade and Broward',
];

// Adds numbers / specificity flavor without hard-coding fake claims into output.
// The model can use this as “style direction,” not factual reporting.
const DETAIL_STYLE_BANK = [
  'Use concrete local detail and practical contractor language.',
  'Make the caption feel like it came from someone who knows how contractors win jobs.',
  'Include operational detail, not generic marketing fluff.',
  'Stress speed, access, and local visibility.',
  'Make it feel like missing a project costs money.',
];

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-REPETITION / PHRASE BANS
// ─────────────────────────────────────────────────────────────────────────────

const HARD_BANNED_HEADLINE_PHRASES = [
  'early bird',
  'strike while the iron is hot',
  'game changer',
  'unlock',
  'revolutionize',
  'next level',
  'secret weapon',
  'skyrocket',
  'dominate the market',
];

const HARD_BANNED_CAPTION_PHRASES = [
  'in today’s fast-paced world',
  'whether you are',
  'this isn’t just',
  'it’s not just',
  'don’t miss out',
  'ready to take your business to the next level',
  'the future of construction',
  'change the game',
];

// ─────────────────────────────────────────────────────────────────────────────
// OPENAI CLIENT
// ─────────────────────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }
  return _openai;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sanitizeText(value: string): string {
  return normalizeLineBreaks(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function containsBannedPhrase(value: string, bannedList: string[]): boolean {
  const lower = value.toLowerCase();
  return bannedList.some((phrase) => lower.includes(phrase.toLowerCase()));
}

function safeSlice(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function buildPreviousContext(previousPosts: PreviousPost[]): string {
  if (!previousPosts.length) return '';

  return `
PREVIOUSLY GENERATED CONTENT — DO NOT REPEAT THESE HOOKS, HEADLINES, OPENINGS, OR STRUCTURES:
${previousPosts
  .slice(0, 40)
  .map((p, i) => {
    const headline = sanitizeText(p.headline || '');
    const angle = sanitizeText(p.angle || '');
    const caption = sanitizeText(p.caption || '');
    return `${i + 1}. Angle="${safeSlice(angle, 80)}" | Headline="${safeSlice(headline, 80)}" | CaptionStart="${safeSlice(caption, 120)}"`;
  })
  .join('\n')}
`;
}

function pickPromptBundle(): PromptBundle {
  const scene = randomItem(SCENE_BANK);
  const hook = randomItem(HOOK_BANK);
  const marketFocus = randomItem(MARKET_FOCUS_BANK);
  const detailLine = randomItem(DETAIL_STYLE_BANK);

  return { scene, hook, marketFocus, detailLine };
}

function buildPeopleRule(scene: Scene): string {
  if (!scene.allowPeople) {
    return 'No people, no humans, no faces, no hands in frame.';
  }

  return [
    'If any person appears, they must be shown only from behind or side profile.',
    'No visible face.',
    'No identifiable features.',
    'No readable ethnicity or gender cues.',
    'Generic work clothes and hard hat only.',
    'No direct eye contact.',
  ].join(' ');
}

function ensureHashtags(caption: string): string {
  const hashtagLine =
    '#ContractorLife #SouthFlorida #ConstructionIndustry #BuildersLife #MiamiConstruction #GeneralContractor #Subcontractor #ConstructionBusiness #BuildersBidBook #FloridaConstruction';

  if (caption.includes('#')) return caption;
  return `${caption.trim()}\n\n${hashtagLine}`;
}

function validateGeneratedContent(payload: Partial<GeneratedContent>): GeneratedContent {
  const headline = sanitizeText(payload.headline || '');
  const subheadline = sanitizeText(payload.subheadline || '');
  const cta = sanitizeText(payload.cta || '');
  const angle = sanitizeText(payload.angle || '');
  const imagePrompt = sanitizeText(payload.imagePrompt || '');
  const caption = ensureHashtags(sanitizeText(payload.caption || ''));

  if (!headline) throw new Error('Generated headline is empty.');
  if (!angle) throw new Error('Generated angle is empty.');
  if (!imagePrompt) throw new Error('Generated imagePrompt is empty.');
  if (!caption) throw new Error('Generated caption is empty.');

  if (containsBannedPhrase(headline, HARD_BANNED_HEADLINE_PHRASES)) {
    throw new Error(`Headline contained banned phrase: "${headline}"`);
  }

  if (containsBannedPhrase(caption, HARD_BANNED_CAPTION_PHRASES)) {
    throw new Error('Caption contained banned marketing fluff.');
  }

  return {
    headline,
    subheadline: subheadline || undefined,
    cta: cta || undefined,
    angle,
    imagePrompt,
    caption,
  };
}

function fallbackContent(bundle: PromptBundle): GeneratedContent {
  const fallbackHeadlineOptions = [
    'Find Projects Before They Do',
    'See New Jobs Near You',
    'Know Who Is Building First',
    'More Projects. More Bids. More Money.',
    'Track New Permits In Miami',
    'Get Local Construction Jobs Faster',
  ];

  const fallbackHeadline = randomItem(fallbackHeadlineOptions);

  const fallbackCaption = normalizeLineBreaks(`
South Florida contractors who see the project first usually get the first shot at the work.

Builders Bid Book helps you track local construction activity, permits, and project opportunities so you can move faster than your competition.

If you want more bids and more work, you need better local information. buildersbidbook.com

#ContractorLife #SouthFlorida #ConstructionIndustry #BuildersLife #MiamiConstruction #GeneralContractor #Subcontractor #ConstructionBusiness #BuildersBidBook #FloridaConstruction
  `);

  const fallbackPrompt = normalizeLineBreaks(`
${bundle.scene.description}. 
Square 1:1 social-media ad composition. 
Premium bright editorial construction photography. 
South Florida feel with vivid blue sky, palm trees, strong daylight, crisp details, clean premium visual hierarchy. 
Keep the strongest visual weight in the upper 60% of the frame. 
${bundle.scene.layoutHint}. 
${buildPeopleRule(bundle.scene)} 
No text, no words, no logos, no watermarks, no signage.
  `);

  return {
    headline: fallbackHeadline,
    subheadline: 'South Florida construction intelligence',
    cta: 'buildersbidbook.com',
    angle: bundle.hook.angle,
    imagePrompt: fallbackPrompt,
    caption: fallbackCaption,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CONTENT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInstagramContent(
  previousPosts: PreviousPost[]
): Promise<GeneratedContent> {
  const openai = getOpenAI();
  const bundle = pickPromptBundle();
  const previousContext = buildPreviousContext(previousPosts);

  const systemPrompt = `
You are an elite direct-response Instagram creative strategist for Builders Bid Book.

${BBB_BRAND_CONTEXT}

YOUR JOB:
Generate ONE high-converting Instagram post concept for Builders Bid Book.

This output will be used for:
1. The on-image headline text
2. The image generation prompt
3. The Instagram caption
4. Memory tracking so future posts do not repeat

GOAL:
Create a post that feels like a premium paid ad made specifically for contractors in South Florida.

SELECTED STRATEGIC DIRECTION FOR THIS GENERATION:
- Core angle: ${bundle.hook.angle}
- Intent: ${bundle.hook.intent}
- Emotional driver: ${bundle.hook.emotionalDriver}
- Market focus: ${bundle.marketFocus}
- Direction note: ${bundle.detailLine}

SCENE TO USE FOR THE IMAGE:
- Scene ID: ${bundle.scene.id}
- Scene label: ${bundle.scene.label}
- Scene category: ${bundle.scene.category}
- Required scene: ${bundle.scene.description}
- Layout note: ${bundle.scene.layoutHint}
- People rule: ${buildPeopleRule(bundle.scene)}

STRICT OUTPUT RULES:

1. HEADLINE
- Max 7 words
- Must be simple enough to understand in under 2 seconds
- No metaphors
- No idioms
- No slang that reduces clarity
- No cute wordplay
- Must feel direct, strong, contractor-focused
- Prefer plain action words and concrete nouns
- Examples of style:
  - Find Projects Before They Do
  - See New Jobs Near You
  - Track New Permits In Miami
  - More Bids. More Work. More Money.
  - Know Who Is Building First

2. SUBHEADLINE
- Optional
- Max 8 words
- Supports the headline without repeating it
- Should feel like ad support copy
- Example:
  - South Florida construction intelligence
  - Local permits and project activity
  - Owner info and bid opportunities

3. CTA
- Short
- Example:
  - buildersbidbook.com
  - Link in bio
  - See local projects now

4. ANGLE
- Short phrase only
- Used internally for tracking the concept
- Example:
  - competitor FOMO
  - permit speed advantage
  - local construction map
  - owner contact advantage

5. IMAGE_PROMPT
- This is ONLY the visual background scene prompt
- Text and logo are added later
- The AI image must NOT include any readable text or branding
- Must describe the chosen scene vividly and precisely
- Must feel bright, premium, bold, sharp, social-media-native
- Must be a square Instagram ad composition
- Must preserve open space for text overlay
- Must feel South Florida: tropical daylight, vivid sky, clean brightness
- NOT cinematic
- NOT moody
- NOT dark luxury
- NOT grunge
- NOT posterized
- NOT AI fantasy
- NOT dramatic shadows
- Must explicitly say:
  - no text
  - no logos
  - no watermarks
- If the scene allows people, obey the people rule exactly

6. CAPTION
- 3 to 5 short sentences maximum before hashtags
- Each sentence on its own line or separated clearly for readability
- First sentence must be a bold direct statement, not a question
- Second sentence should add local specificity or practical value
- Third sentence should position Builders Bid Book as the solution
- Final line should include a CTA like buildersbidbook.com or Link in bio
- Tone must feel like contractor psychology, not generic social media fluff
- No exaggerated fake numbers
- No cheesy motivational copy
- No startup/corporate jargon
- End with 8 to 10 strong hashtags

ADDITIONAL RULES:
- Avoid repeating the exact structure or wording from previous examples
- Avoid these headline phrases: ${HARD_BANNED_HEADLINE_PHRASES.join(', ')}
- Avoid these caption phrases: ${HARD_BANNED_CAPTION_PHRASES.join(', ')}
- Use direct contractor language
- Make this feel expensive, powerful, and clear

${previousContext}

Return ONLY valid JSON:
{
  "headline": "string",
  "subheadline": "string",
  "cta": "string",
  "angle": "string",
  "imagePrompt": "string",
  "caption": "string"
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            'Generate a fresh Instagram post for Builders Bid Book. Make it bold, high-converting, local, and clearly different from previous posts.',
        },
      ],
      temperature: 0.95,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<GeneratedContent>;
    return validateGeneratedContent(parsed);
  } catch (error) {
    console.error('[generateInstagramContent] Falling back after generation error:', error);
    return fallbackContent(bundle);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE PROMPT ENHANCER
// This final pass sharpens the image prompt before sending it to the image model
// ─────────────────────────────────────────────────────────────────────────────

function enhanceImagePrompt(imagePrompt: string): string {
  const parts = [
    imagePrompt,
    'Instagram 1:1 composition.',
    'Premium bright editorial ad image.',
    'Flat, clean, modern, bold visual style.',
    'South Florida / Miami daylight feel.',
    'Vivid blue sky, tropical brightness, clean contrast, sharp detail.',
    'Designed to support large bold overlay text in post-processing.',
    'Keep lower-left area visually clean for headline placement.',
    'No text, no words, no readable signs, no logos, no watermarks.',
    'No dark mood, no cinematic lighting, no grunge, no fantasy, no dramatic shadows.',
    'High quality, premium marketing creative, polished, crisp, social-media ad ready.',
  ];

  return collapseWhitespace(parts.join(' '));
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE GENERATOR
// Returns temporary image URL
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInstagramImage(imagePrompt: string): Promise<string> {
  const openai = getOpenAI();
  const finalPrompt = enhanceImagePrompt(imagePrompt);

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: finalPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    });

    const url = response.data?.[0]?.url;
    return url ?? '';
  } catch (error) {
    console.error('[generateInstagramImage] Image generation failed:', error);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL HELPER
// Generates both text + image URL together if you want one-call workflow later
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInstagramPostPackage(
  previousPosts: PreviousPost[]
): Promise<GeneratedContent & { imageUrl: string }> {
  const content = await generateInstagramContent(previousPosts);
  const imageUrl = await generateInstagramImage(content.imagePrompt);

  return {
    ...content,
    imageUrl,
  };
}