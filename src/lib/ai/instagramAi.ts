import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS BID BOOK — INSTAGRAM CONTENT ENGINE
// Upgraded version with:
// - Post format rotation
// - Carousel generation
// - Story generation
// - Caption style rotation
// - Stronger content diversity
// ─────────────────────────────────────────────────────────────────────────────

export const BBB_BRAND_CONTEXT = `
BRAND: Builders Bid Book (buildersbidbook.com)

CORE POSITIONING:
Builders Bid Book is a construction intelligence platform for South Florida contractors.
It helps subcontractors, general contractors, estimators, and construction business owners
find real construction projects faster, see local activity earlier, and reach decision makers directly.

WHAT CONTRACTORS GET:
- Active construction projects
- New permits being filed
- Bidding opportunities before most competitors know they exist
- Owner / developer contact info
- Local construction intelligence in one place
- Faster prospecting with less wasted time

CORE EMOTIONAL SELL:
If you see the project first, you have the first shot at the money.
Speed matters. Access matters. Local information matters.

TARGET AUDIENCE:
- Subcontractors
- General contractors
- Estimators
- Small construction business owners
- Serious contractors in South Florida
- People who want more bids, more work, more money

BRAND PERSONALITY:
- Aggressive
- Exclusive
- Clear
- Powerful
- FOMO-driven
- Smart
- Local
- Bold
- Miami / South Florida energy
- No fluff

VISUAL BRAND IDENTITY (CRITICAL):
- Primary brand color: bright royal blue / cobalt blue (#1055FF style)
- Secondary colors: white
- Small accent colors: orange / yellow only
- Visual style: clean, bright, bold, premium, flat, modern
- Canva-style ad creative feel
- Ultra-bold sans-serif text
- NOT cinematic
- NOT moody
- NOT dark luxury
- NOT gritty
- NOT overcomplicated
- NOT photorealistic poster drama

LOGO RULE:
- White pill badge with BUILDER'S BID BOOK in blue text and hammer icon
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
- first
- today
- near you
- South Florida
- competition

AVOID:
- cheesy slogans
- vague motivational language
- startup jargon
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
  format: PostFormat;
};

export type GeneratedCarousel = {
  format: 'educational-carousel' | 'myth-busting-carousel' | 'authority-carousel';
  angle: string;
  title: string;
  caption: string;
  slides: {
    headline: string;
    body?: string;
  }[];
};

export type GeneratedStory = {
  format: 'story-sequence';
  angle: string;
  caption?: string;
  frames: {
    text: string;
    imagePrompt?: string;
  }[];
};

export type GeneratedPostPackage = GeneratedContent & {
  imageUrl: string;
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
  format: PostFormat;
  captionStyle: CaptionStyle;
  hookStyle: HookStyle;
};

type StoryPromptBundle = {
  scene: Scene;
  hook: HookPack;
  marketFocus: string;
  hookStyle: HookStyle;
};

export type PostFormat =
  | 'fomo-ad'
  | 'pain-point'
  | 'platform-feature'
  | 'authority'
  | 'market-insight'
  | 'industry-truth'
  | 'educational'
  | 'project-alert-style';

type CarouselFormat =
  | 'educational-carousel'
  | 'myth-busting-carousel'
  | 'authority-carousel';

type CaptionStyle =
  | 'problem-solution'
  | 'statement-insight-cta'
  | 'contrarian'
  | 'authority'
  | 'pain-urgency';

type HookStyle =
  | 'aggressive'
  | 'educational'
  | 'curiosity'
  | 'authority'
  | 'controversial';

// ─────────────────────────────────────────────────────────────────────────────
// SCENE BANK
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
    label: 'Neighborhood active build street view',
    category: 'aerial',
    description:
      'Street-level wide view of a South Florida residential block with homes under construction, palm-lined street, bright clear sky, clean premium real estate photo feel',
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
      'Clean desk flat lay with printed satellite map, blue project markers, permit stack, hard hat, measuring tape, sharp bright studio lighting',
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
// HOOK BANK
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
      'Find projects before your competition',
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
    angle: 'market activity',
    intent: 'Use regional momentum',
    emotionalDriver: 'relevance',
    examples: [
      'South Florida construction never stops',
      'Work is moving fast in this market',
      'New construction opportunities keep appearing',
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
// FORMAT BANKS
// ─────────────────────────────────────────────────────────────────────────────

const POST_FORMATS: PostFormat[] = [
  'fomo-ad',
  'pain-point',
  'platform-feature',
  'authority',
  'market-insight',
  'industry-truth',
  'educational',
  'project-alert-style',
];

const CAROUSEL_FORMATS: CarouselFormat[] = [
  'educational-carousel',
  'myth-busting-carousel',
  'authority-carousel',
];

const CAPTION_STYLES: CaptionStyle[] = [
  'problem-solution',
  'statement-insight-cta',
  'contrarian',
  'authority',
  'pain-urgency',
];

const HOOK_STYLES: HookStyle[] = [
  'aggressive',
  'educational',
  'curiosity',
  'authority',
  'controversial',
];

const MARKET_FOCUS_BANK = [
  'South Florida residential construction activity',
  'South Florida permits and active job sites',
  'new construction projects being filed near you every week',
  'contractors competing for local work in South Florida',
  'South Florida builders chasing new jobs every week',
  'residential and small commercial jobs across South Florida',
];

const DETAIL_STYLE_BANK = [
  'Use practical contractor language.',
  'Make the caption feel like it came from someone who knows how contractors win jobs.',
  'Include operational detail, not generic marketing fluff.',
  'Stress speed, access, and local visibility.',
  'Make it feel like missing a project costs money.',
];

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

const REQUIRED_HEADLINE_WORDS = [
  'new',
  'first',
  'more',
  'find',
  'track',
  'see',
  'know',
  'win',
  'build',
  'bid',
  'jobs',
  'projects',
  'work',
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

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function hasRequiredHeadlineWord(value: string): boolean {
  const lower = value.toLowerCase();
  return REQUIRED_HEADLINE_WORDS.some((word) => lower.includes(word));
}

function ensureHashtags(caption: string): string {
  const hashtagLine =
    '#ContractorLife #SouthFlorida #ConstructionIndustry #BuildersLife #GeneralContractor #Subcontractor #ConstructionBusiness #BuildersBidBook #FloridaConstruction #ConstructionJobs';

  if (caption.includes('#')) return caption;
  return `${caption.trim()}\n\n${hashtagLine}`;
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

function pickPromptBundle(forcedFormat?: PostFormat): PromptBundle {
  const scene = randomItem(SCENE_BANK);
  const hook = randomItem(HOOK_BANK);
  const marketFocus = randomItem(MARKET_FOCUS_BANK);
  const detailLine = randomItem(DETAIL_STYLE_BANK);
  const format = forcedFormat ?? randomItem(POST_FORMATS);
  const captionStyle = randomItem(CAPTION_STYLES);
  const hookStyle = randomItem(HOOK_STYLES);

  return { scene, hook, marketFocus, detailLine, format, captionStyle, hookStyle };
}

function pickStoryPromptBundle(): StoryPromptBundle {
  return {
    scene: randomItem(SCENE_BANK),
    hook: randomItem(HOOK_BANK),
    marketFocus: randomItem(MARKET_FOCUS_BANK),
    hookStyle: randomItem(HOOK_STYLES),
  };
}

function validateGeneratedContent(payload: Partial<GeneratedContent>, fallbackFormat: PostFormat): GeneratedContent {
  const headline = sanitizeText(payload.headline || '');
  const subheadline = sanitizeText(payload.subheadline || '');
  const cta = sanitizeText(payload.cta || '');
  const angle = sanitizeText(payload.angle || '');
  const imagePrompt = sanitizeText(payload.imagePrompt || '');
  const caption = ensureHashtags(sanitizeText(payload.caption || ''));
  const format = (payload.format as PostFormat) || fallbackFormat;

  if (!headline) throw new Error('Generated headline is empty.');
  if (!angle) throw new Error('Generated angle is empty.');
  if (!imagePrompt) throw new Error('Generated imagePrompt is empty.');
  if (!caption) throw new Error('Generated caption is empty.');

  if (wordCount(headline) > 7) {
    throw new Error(`Headline too long: "${headline}"`);
  }

  if (containsBannedPhrase(headline, HARD_BANNED_HEADLINE_PHRASES)) {
    throw new Error(`Headline contained banned phrase: "${headline}"`);
  }

  if (containsBannedPhrase(caption, HARD_BANNED_CAPTION_PHRASES)) {
    throw new Error('Caption contained banned marketing fluff.');
  }

  if (!hasRequiredHeadlineWord(headline)) {
    throw new Error(`Headline lacks strong simple keyword: "${headline}"`);
  }

  return {
    headline,
    subheadline: subheadline || undefined,
    cta: cta || undefined,
    angle,
    imagePrompt,
    caption,
    format,
  };
}

function validateGeneratedCarousel(payload: Partial<GeneratedCarousel>, fallbackFormat: CarouselFormat): GeneratedCarousel {
  const title = sanitizeText(payload.title || '');
  const angle = sanitizeText(payload.angle || '');
  const caption = ensureHashtags(sanitizeText(payload.caption || ''));
  const slides = Array.isArray(payload.slides)
    ? payload.slides
        .map((s) => ({
          headline: sanitizeText(s?.headline || ''),
          body: sanitizeText(s?.body || '') || undefined,
        }))
        .filter((s) => s.headline)
    : [];

  if (!title) throw new Error('Carousel title is empty.');
  if (!angle) throw new Error('Carousel angle is empty.');
  if (slides.length < 4) throw new Error('Carousel must have at least 4 slides.');

  return {
    format: (payload.format as CarouselFormat) || fallbackFormat,
    angle,
    title,
    caption,
    slides: slides.slice(0, 7),
  };
}

function validateGeneratedStory(payload: Partial<GeneratedStory>): GeneratedStory {
  const angle = sanitizeText(payload.angle || '');
  const caption = sanitizeText(payload.caption || '') || undefined;
  const frames = Array.isArray(payload.frames)
    ? payload.frames
        .map((frame) => ({
          text: sanitizeText(frame?.text || ''),
          imagePrompt: sanitizeText(frame?.imagePrompt || '') || undefined,
        }))
        .filter((frame) => frame.text)
    : [];

  if (!angle) throw new Error('Story angle is empty.');
  if (frames.length < 3) throw new Error('Story must have at least 3 frames.');

  return {
    format: 'story-sequence',
    angle,
    caption,
    frames: frames.slice(0, 6),
  };
}

function fallbackContent(bundle: PromptBundle): GeneratedContent {
  const headlineOptions: Record<PostFormat, string[]> = {
    'fomo-ad': [
      'Your Competition Saw This First',
      'Find Projects Before They Do',
      'Most Subs Hear Too Late',
    ],
    'pain-point': [
      'Late Info Costs You Jobs',
      'Stop Finding Jobs Too Late',
      'Most Contractors Wait Too Long',
    ],
    'platform-feature': [
      'Track Local Projects Faster',
      'See Construction Jobs Near You',
      'Find Projects In One Place',
    ],
    'authority': [
      'Smart Contractors Track Jobs Daily',
      'Serious Builders Find Work Early',
      'Winning More Bids Starts Here',
    ],
    'market-insight': [
      'South Florida Keeps Building',
      'New Jobs Keep Showing Up',
      'Construction Activity Moves Fast',
    ],
    'industry-truth': [
      'Most Subs Chase Work Wrong',
      'The First Call Matters Most',
      'Better Info Wins More Jobs',
    ],
    'educational': [
      'Know Which Jobs To Chase',
      'Find Better Projects Faster',
      'See What Matters First',
    ],
    'project-alert-style': [
      'New Projects Are Filing Daily',
      'Track New Construction Near You',
      'See New Jobs Before Others',
    ],
  };

  const fallbackHeadline = randomItem(headlineOptions[bundle.format]);

  const fallbackCaption = normalizeLineBreaks(`
Contractors who see the project first usually get the first real shot at the work.

Builders Bid Book helps you track local construction activity, permits, and project opportunities so you can move faster than your competition.

If you want more bids and more work, you need better local information. buildersbidbook.com

#ContractorLife #SouthFlorida #ConstructionIndustry #BuildersLife #GeneralContractor #Subcontractor #ConstructionBusiness #BuildersBidBook #FloridaConstruction #ConstructionJobs
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
    format: bundle.format,
  };
}

function fallbackCarousel(format: CarouselFormat): GeneratedCarousel {
  return {
    format,
    angle: 'contractor education',
    title: 'How Smart Contractors Find More Work',
    caption: ensureHashtags(normalizeLineBreaks(`
Most contractors are late because they only hear about jobs after everyone else.

The smartest ones track construction activity early, move fast, and stay consistent.

Builders Bid Book helps contractors find local work faster. buildersbidbook.com
    `)),
    slides: [
      { headline: 'How Smart Contractors Find More Work' },
      { headline: 'They Track New Projects Early' },
      { headline: 'They Move Before Competition' },
      { headline: 'They Know Which Jobs To Chase' },
      { headline: 'Builders Bid Book Helps You Do That' },
    ],
  };
}

function fallbackStory(): GeneratedStory {
  return {
    format: 'story-sequence',
    angle: 'story urgency',
    caption: 'Builders Bid Book tracks local construction activity.',
    frames: [
      { text: 'New construction activity near you' },
      { text: 'Your competition is already looking' },
      { text: 'Builders Bid Book helps you find it first' },
    ],
  };
}

function enhanceImagePrompt(imagePrompt: string): string {
  const parts = [
    imagePrompt,
    'Instagram 1:1 composition.',
    'Premium bright editorial ad image.',
    'Flat, clean, modern, bold visual style.',
    'South Florida daylight feel.',
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
// MAIN SINGLE POST GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInstagramContent(
  previousPosts: PreviousPost[],
  forcedFormat?: PostFormat
): Promise<GeneratedContent> {
  const openai = getOpenAI();
  const bundle = pickPromptBundle(forcedFormat);
  const previousContext = buildPreviousContext(previousPosts);

  const systemPrompt = `
You are an elite direct-response Instagram strategist for Builders Bid Book.

${BBB_BRAND_CONTEXT}

YOUR JOB:
Generate ONE high-converting Instagram post concept for Builders Bid Book.

POST FORMAT FOR THIS GENERATION:
${bundle.format}

FORMAT DEFINITIONS:
- fomo-ad = fear of missing projects your competition will find first
- pain-point = frustration, lost bids, late discovery
- platform-feature = explain a useful Builders Bid Book feature or use case
- authority = make the brand sound smart, trusted, professional, high-level
- market-insight = what is happening in South Florida construction generally
- industry-truth = bold opinion or uncomfortable truth contractors relate to
- educational = practical learning-oriented content
- project-alert-style = post should feel like a construction activity alert, without using real live data

CAPTION STYLE FOR THIS GENERATION:
${bundle.captionStyle}

HOOK STYLE FOR THIS GENERATION:
${bundle.hookStyle}

SELECTED STRATEGIC DIRECTION:
- Core angle: ${bundle.hook.angle}
- Intent: ${bundle.hook.intent}
- Emotional driver: ${bundle.hook.emotionalDriver}
- Market focus: ${bundle.marketFocus}
- Direction note: ${bundle.detailLine}

SCENE TO USE:
- Scene ID: ${bundle.scene.id}
- Scene label: ${bundle.scene.label}
- Scene category: ${bundle.scene.category}
- Required scene: ${bundle.scene.description}
- Layout note: ${bundle.scene.layoutHint}
- People rule: ${buildPeopleRule(bundle.scene)}

STRICT OUTPUT RULES:

1. HEADLINE
- Max 7 words
- Must be immediately understandable
- No metaphors
- No idioms
- No wordplay
- No vague slogans
- Strong, direct, contractor-focused
- Must include simple concrete language
- Must feel like a premium ad hook

2. SUBHEADLINE
- Optional
- Max 8 words
- Supports the headline
- Should feel like support copy

3. CTA
- Very short
- Example:
  - buildersbidbook.com
  - Link in bio
  - Track projects now

4. ANGLE
- Short internal phrase only

5. IMAGE_PROMPT
- This is ONLY the image background prompt
- Text and logo are added later
- AI image must NOT include any readable text or branding
- Must describe the selected scene vividly and clearly
- Must preserve open space for text overlay
- Must feel bright, premium, bold, sharp, clean
- Must feel South Florida
- Must explicitly say no text, no logos, no watermarks
- If people appear, obey the people rule exactly

6. CAPTION
- 3 to 5 short sentences before hashtags
- First sentence must be a strong statement, not a question
- Must fit the selected format:
  - fomo-ad: create urgency and fear of being late
  - pain-point: highlight frustration or missed opportunity
  - platform-feature: show practical platform value
  - authority: sound credible and confident
  - market-insight: show what is happening in the local market generally
  - industry-truth: say a sharp truth contractors relate to
  - educational: teach something useful
  - project-alert-style: feel like a useful alert post
- Keep location wording general like South Florida or near you
- No city names
- No fake statistics
- No cheesy motivation
- No startup jargon
- Final line should be buildersbidbook.com or Link in bio
- End with strong hashtags

HEADLINE PHRASES TO AVOID:
${HARD_BANNED_HEADLINE_PHRASES.join(', ')}

CAPTION PHRASES TO AVOID:
${HARD_BANNED_CAPTION_PHRASES.join(', ')}

${previousContext}

Return ONLY valid JSON:
{
  "headline": "string",
  "subheadline": "string",
  "cta": "string",
  "angle": "string",
  "imagePrompt": "string",
  "caption": "string",
  "format": "${bundle.format}"
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
            'Generate a fresh Instagram post for Builders Bid Book. Make it high-converting, distinct, clear, and on-brand.',
        },
      ],
      temperature: 0.82,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<GeneratedContent>;
    return validateGeneratedContent(parsed, bundle.format);
  } catch (error) {
    console.error('[generateInstagramContent] Falling back after generation error:', error);
    return fallbackContent(bundle);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CAROUSEL GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInstagramCarousel(
  previousPosts: PreviousPost[],
  forcedFormat?: CarouselFormat
): Promise<GeneratedCarousel> {
  const openai = getOpenAI();
  const format = forcedFormat ?? randomItem(CAROUSEL_FORMATS);
  const hook = randomItem(HOOK_BANK);
  const previousContext = buildPreviousContext(previousPosts);

  const systemPrompt = `
You are an elite Instagram carousel strategist for Builders Bid Book.

${BBB_BRAND_CONTEXT}

YOUR JOB:
Generate ONE Instagram carousel concept for Builders Bid Book.

CAROUSEL FORMAT:
${format}

FORMAT DEFINITIONS:
- educational-carousel = teach something useful to contractors
- myth-busting-carousel = challenge bad assumptions contractors make
- authority-carousel = strong professional guidance or industry truths

STRICT OUTPUT RULES:
- 5 to 7 slides total
- Slide 1 should be the main title slide
- Each slide must be short, simple, bold, and easy to understand
- This is NOT a long-form essay
- Keep each slide useful and punchy
- Language must be very direct
- No fluff
- No fake stats
- No city names
- Keep wording general like South Florida or near you
- Final slide should tie naturally to Builders Bid Book
- Caption should be 3 to 5 short sentences before hashtags
- Caption should feel useful, not spammy

CORE ANGLE:
${hook.angle}

PAST GENERATED CONTENT TO AVOID COPYING:
${previousContext}

Return ONLY valid JSON:
{
  "format": "${format}",
  "angle": "string",
  "title": "string",
  "caption": "string",
  "slides": [
    { "headline": "string", "body": "string" }
  ]
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: 'Generate a strong Instagram carousel for Builders Bid Book.',
        },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<GeneratedCarousel>;
    return validateGeneratedCarousel(parsed, format);
  } catch (error) {
    console.error('[generateInstagramCarousel] Falling back after generation error:', error);
    return fallbackCarousel(format);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STORY GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInstagramStory(): Promise<GeneratedStory> {
  const openai = getOpenAI();
  const bundle = pickStoryPromptBundle();

  const systemPrompt = `
You are an elite Instagram Story strategist for Builders Bid Book.

${BBB_BRAND_CONTEXT}

YOUR JOB:
Generate ONE short Instagram Story sequence for Builders Bid Book.

STORY GOAL:
- Fast attention
- Easy to read
- Strong rhythm from frame to frame
- Feels like a live, useful, contractor-focused story
- Good for daily posting

REQUIRED OUTPUT:
- 3 to 5 frames
- Each frame must be very short
- Each frame should feel like a continuation of the previous one
- Strong, direct, simple language
- No fluff
- No fake numbers
- No specific city names
- Keep geography general like South Florida or near you
- Can be urgency, FOMO, insight, or value-based
- Optionally provide imagePrompt for a frame if it would help

CORE ANGLE:
${bundle.hook.angle}

HOOK STYLE:
${bundle.hookStyle}

MARKET FOCUS:
${bundle.marketFocus}

Return ONLY valid JSON:
{
  "format": "story-sequence",
  "angle": "string",
  "caption": "string",
  "frames": [
    { "text": "string", "imagePrompt": "string" }
  ]
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: 'Generate a Builders Bid Book Instagram Story sequence.',
        },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<GeneratedStory>;
    return validateGeneratedStory(parsed);
  } catch (error) {
    console.error('[generateInstagramStory] Falling back after generation error:', error);
    return fallbackStory();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE GENERATOR
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
// PACKAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInstagramPostPackage(
  previousPosts: PreviousPost[],
  forcedFormat?: PostFormat
): Promise<GeneratedPostPackage> {
  const content = await generateInstagramContent(previousPosts, forcedFormat);
  const imageUrl = await generateInstagramImage(content.imagePrompt);

  return {
    ...content,
    imageUrl,
  };
}

// Optional helper if you want one function that rotates between formats later
export async function generateInstagramAsset(
  previousPosts: PreviousPost[]
): Promise<GeneratedPostPackage | GeneratedCarousel | GeneratedStory> {
  const mode = randomItem(['single', 'carousel', 'story'] as const);

  if (mode === 'single') {
    return generateInstagramPostPackage(previousPosts);
  }

  if (mode === 'carousel') {
    return generateInstagramCarousel(previousPosts);
  }

  return generateInstagramStory();
}