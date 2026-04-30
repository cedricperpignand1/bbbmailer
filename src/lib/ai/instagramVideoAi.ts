// src/lib/ai/instagramVideoAi.ts
// Thursday Instagram Reel content engine.
// GPT-4o picks a viral concept from a 26-entry bank, writes the caption,
// and returns the Replicate video prompt.

import OpenAI from 'openai';
import { BBB_BRAND_CONTEXT } from './instagramAi';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ─────────────────────────────────────────────────────────────────────────────
// 26 VIRAL VIDEO CONCEPTS FOR BUILDERSBIDBOOK
// Each angle targets a different emotional driver / audience state.
// Scene descriptions are written as Replicate video prompts (vertical 9:16).
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_CONCEPTS = [
  // ── SATISFYING CONSTRUCTION VISUALS ──────────────────────────────────────
  {
    angle: 'concrete-pour-golden',
    viralHook: 'satisfying',
    scene:
      'Ultra-smooth liquid concrete being poured onto a large fresh foundation slab at golden hour in South Florida. Steam rising, workers guiding the pour with professional equipment. Palm trees and warm sky in background. Cinematic slow motion close-up. Satisfying textures. 9:16 vertical.',
    captionSeed: 'Fresh concrete. Fresh opportunity.',
  },
  {
    angle: 'steel-frame-crane',
    viralHook: 'epic-scale',
    scene:
      'Tower crane swinging a massive steel beam into place on a Miami commercial building under construction. Ironworkers guiding it in with gloved hands, sparks from welding, Miami skyline visible. High-energy, dynamic, cinematic. 9:16 vertical.',
    captionSeed: 'Steel goes up. Bids go out first.',
  },
  {
    angle: 'wood-frame-timelapse',
    viralHook: 'satisfying-timelapse',
    scene:
      'Stunning time-lapse of a luxury home wood frame rising in Boca Raton — from empty concrete slab to complete frame structure. Bright Florida sun, blue sky, green trees. Smooth, satisfying fast motion. 9:16 vertical.',
    captionSeed: 'Permit to frame. 3 weeks. Did you get that call?',
  },
  {
    angle: 'foundation-slab-sunrise',
    viralHook: 'hustle',
    scene:
      'Workers finishing a massive poured concrete foundation slab at sunrise. Bright pink and orange South Florida sky, concrete surface catching early light, screeds moving in perfect sync. Cinematic wide shot then close-up. 9:16 vertical.',
    captionSeed: 'Every slab started with a permit. Who knew first?',
  },
  // ── AERIAL / DRONE ────────────────────────────────────────────────────────
  {
    angle: 'aerial-site-reveal',
    viralHook: 'market-scale',
    scene:
      'Cinematic drone shot pulling back to reveal a massive active South Florida construction site — multiple buildings at different stages, cranes in motion, workers moving like ants. Intracoastal waterway visible in background. Golden hour. 9:16 vertical.',
    captionSeed: 'This is the South Florida market right now.',
  },
  {
    angle: 'aerial-community-build',
    viralHook: 'fomo-scale',
    scene:
      'Sweeping aerial drone shot revealing 40+ luxury homes under simultaneous construction in a gated Boca Raton community. Rooftops at various stages, streets being paved, brand-new landscaping. Late afternoon light. 9:16 vertical.',
    captionSeed: 'How many of these bids did you get?',
  },
  {
    angle: 'miami-cranes-skyline',
    viralHook: 'market-energy',
    scene:
      'Dramatic slow pan of the Miami skyline with a dozen tower cranes visible against a perfect blue sky and ocean backdrop. Buildings mid-construction rising between completed towers. Epic, aspirational. 9:16 vertical.',
    captionSeed: 'The South Florida building boom is not slowing down.',
  },
  {
    angle: 'waterfront-luxury-aerial',
    viralHook: 'luxury-fomo',
    scene:
      'Aerial drone shot over Fort Lauderdale Intracoastal waterway showing two massive luxury waterfront mansions under construction side by side. Yachts in the canal, turquoise water, palm trees. 9:16 vertical.',
    captionSeed: 'Waterfront contracts go to whoever moves first.',
  },
  // ── CONTRACTOR HUSTLE / IDENTITY ──────────────────────────────────────────
  {
    angle: 'boots-on-concrete',
    viralHook: 'identity',
    scene:
      'Slow motion extreme close-up of worn leather work boots stepping confidently onto a fresh concrete job site at dawn. Golden light raking across the surface. Power and confidence in every step. 9:16 vertical.',
    captionSeed: 'First one on site. First one to bid.',
  },
  {
    angle: 'truck-jobsite-dawn',
    viralHook: 'grind-culture',
    scene:
      'Slow motion shot of a contractor pickup truck pulling into an empty construction site parking lot before dawn. Tools and equipment visible in the bed. Miami sky turning orange and pink on the horizon. First truck there. 9:16 vertical.',
    captionSeed: 'Every morning is another shot at the job.',
  },
  {
    angle: 'blueprint-phone-alert',
    viralHook: 'intel-edge',
    scene:
      'Contractor reviewing large blueprints spread on a job-site trailer desk. Phone next to the plans lights up with a bright notification: "New permit filed — $3.8M commercial build, Brickell." Contractor looks up, dials immediately. 9:16 vertical.',
    captionSeed: 'Speed is the edge. This is how you get it.',
  },
  {
    angle: 'handshake-job-won',
    viralHook: 'win-reveal',
    scene:
      'Close-up of a firm confident handshake between a contractor in work clothes and a developer in a hard hat in front of an active construction site. South Florida sun. Project sign visible behind them. 9:16 vertical.',
    captionSeed: 'This is what happens when you bid first.',
  },
  {
    angle: '3am-grind-start',
    viralHook: 'grind-identity',
    scene:
      'Phone alarm goes off: 3:47 AM. Contractor gets up in the dark, pulls on work clothes, grabs coffee and phone. Drives through empty Miami streets to the construction site. First truck in the parking lot as sun begins to rise. 9:16 vertical.',
    captionSeed: 'The best contractors do not wait for opportunity.',
  },
  // ── PLATFORM / TECHNOLOGY FEEL ────────────────────────────────────────────
  {
    angle: 'permit-pins-exploding',
    viralHook: 'data-reveal',
    scene:
      'Close-up of a smartphone screen showing a South Florida map with construction permit location pins rapidly appearing across Miami-Dade, Broward, and Palm Beach counties — dozens in seconds. High energy, exciting. 9:16 vertical.',
    captionSeed: 'This many new permits. One morning.',
  },
  {
    angle: 'dashboard-loading-projects',
    viralHook: 'opportunity-scale',
    scene:
      'Laptop screen showing a construction project dashboard. Project names, addresses, and bid values populate rapidly as the page loads — row after row appearing. Numbers ticking up. Clean professional interface. 9:16 vertical.',
    captionSeed: 'Every row is money on the table.',
  },
  {
    angle: 'alert-notification-call',
    viralHook: 'real-time-intel',
    scene:
      'Contractor on a South Florida job site pulls phone from pocket. Bright alert notification flashes: "New permit filed — 5.2M luxury home, Coral Gables." Contractor immediately dials. Wide smile. Gets confirmation. 9:16 vertical.',
    captionSeed: 'Real-time permits. Real competitive advantage.',
  },
  // ── FOMO / URGENCY ────────────────────────────────────────────────────────
  {
    angle: 'permits-filing-timestamps',
    viralHook: 'while-you-sleep',
    scene:
      'Dramatic rapid sequence: permit after permit appearing on a digital filing system with timestamps — 6:02 AM, 6:14 AM, 6:31 AM, 6:47 AM, 6:58 AM. South Florida map in background. Urgent ticking clock energy. 9:16 vertical.',
    captionSeed: 'While you were sleeping. Permits were being filed.',
  },
  {
    angle: 'late-to-the-project',
    viralHook: 'missed-opportunity',
    scene:
      'Concrete being poured on a large commercial foundation — work well underway. A contractor arrives and looks at the active scene, realizing the job is already awarded. Camera reveals the project already in full swing without them. 9:16 vertical.',
    captionSeed: 'This one started without you.',
  },
  {
    angle: 'sunday-prep-session',
    viralHook: 'preparation-edge',
    scene:
      'Sunday evening. Contractor at kitchen table with laptop open showing a construction project feed, coffee cup, legal pad with notes. New project alerts loading. Outside the window, South Florida neighborhood at dusk. Gets ahead. 9:16 vertical.',
    captionSeed: 'Monday bids go to whoever prepped Sunday night.',
  },
  {
    angle: 'winner-loser-split',
    viralHook: 'contrast-reveal',
    scene:
      'Split screen: left side, contractor checks phone app, sees new project alert, makes immediate call, smiles — deal is on. Right side, competitor contractor walks up to same project address with a bid folder, sees it already active, walks away. 9:16 vertical.',
    captionSeed: 'The gap between first and second place is hours.',
  },
  // ── MARKET SCALE / NUMBERS ────────────────────────────────────────────────
  {
    angle: 'billion-dollar-market',
    viralHook: 'market-fomo',
    scene:
      'Cinematic aerial montage of five active South Florida construction sites in quick succession — luxury high-rise, waterfront mansion, commercial plaza, gated community, mixed-use development. Epic scale. 9:16 vertical.',
    captionSeed: '$2.4 billion in active South Florida construction. Your cut is out there.',
  },
  {
    angle: 'permit-count-stat-reveal',
    viralHook: 'stat-shock',
    scene:
      'Bold dynamic text animation over aerial South Florida construction footage: "47 NEW PERMITS FILED THIS MORNING" in white text on deep royal blue background. Cut to wide shot of busy construction sites. 9:16 vertical.',
    captionSeed: '47 permits this morning. How many did you know about?',
  },
  // ── BEFORE / AFTER REVEALS ────────────────────────────────────────────────
  {
    angle: 'empty-lot-to-mansion',
    viralHook: 'transformation',
    scene:
      'Seamless cinematic wipe transition: Empty sandy lot in Coral Gables → stunning completed 8,000 sqft Mediterranean luxury mansion with infinity pool and landscaping in the same camera position. Dramatic reveal. Magical. 9:16 vertical.',
    captionSeed: 'This was an empty lot 8 months ago.',
  },
  {
    angle: 'blueprint-to-building',
    viralHook: 'from-plan-to-real',
    scene:
      'Architectural blueprint flat on a table → dramatic zoom out transition revealing the actual completed building seen from the same angle the blueprint depicted. South Florida architecture. Powerful visual match. 9:16 vertical.',
    captionSeed: 'It starts with the permit. Know who to call first.',
  },
  {
    angle: 'demolition-to-tower',
    viralHook: 'cycle-of-construction',
    scene:
      'Old commercial building being demolished by excavator — then seamless fast-forward time-lapse of a new luxury condo tower rising in the exact same spot. Crane swinging, glass going up, Miami skyline. 9:16 vertical.',
    captionSeed: 'Every teardown is a rebuild opportunity.',
  },
  // ── CRAFT / PRIDE ─────────────────────────────────────────────────────────
  {
    angle: 'tools-of-the-trade',
    viralHook: 'craft-pride',
    scene:
      'Slow-motion montage of construction tools in use: tape measure snapping out over a fresh board, level placed perfectly on a steel beam, hard hat going on with confidence, plans unrolled on a bright clean table. Premium, cinematic. 9:16 vertical.',
    captionSeed: 'The craft has not changed. The information edge has.',
  },
] as const;

type Concept = (typeof VIDEO_CONCEPTS)[number];

// ─────────────────────────────────────────────────────────────────────────────

export interface VideoContent {
  conceptAngle: string;
  replicatePrompt: string;
  dalleImagePrompt: string;  // first-frame image for minimax/video-01-live
  caption: string;
  headline: string;
}

export async function generateVideoContent(
  previousAngles: string[]
): Promise<VideoContent> {
  const usedSet = new Set(previousAngles);

  // Prefer angles not used in the last N Thursday posts
  const fresh = VIDEO_CONCEPTS.filter(c => !usedSet.has(c.angle));
  const pool: readonly Concept[] = fresh.length >= 3 ? fresh : VIDEO_CONCEPTS;

  // Pick randomly from the first 10 of the pool (weighted toward freshest)
  const concept = pool[Math.floor(Math.random() * Math.min(pool.length, 10))];

  const caption = await buildCaption(concept);

  return {
    conceptAngle: concept.angle,
    replicatePrompt: buildReplicatePrompt(concept.scene),
    dalleImagePrompt: buildDallePrompt(concept.scene),
    caption,
    headline: concept.captionSeed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const HASHTAG_SETS = [
  '#buildersbidbook #contractors #southflorida #construction #constructionjobs #gccontractor #subcontractor #miamiconstruction #permitready #newconstruction',
  '#buildersbidbook #constructionintelligence #southfloridaconstruction #generalcontractor #estimator #constructionbusiness #bidmore #winmore #contractorlife',
  '#buildersbidbook #constructionfl #miamideveloper #fortlauderdaleconstruction #bocaconstruction #newpermits #gclife #subcontractors #buildersoftiktok',
  '#buildersbidbook #miamiconstruction #contractorlife #newpermits #southfloridarealestate #gcconstruction #constructionnetwork #bidfast #contractorgrind',
];

async function buildCaption(concept: Concept): Promise<string> {
  const hashtags = HASHTAG_SETS[Math.floor(Math.random() * HASHTAG_SETS.length)];

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `You write viral Instagram Reel captions for BuildersBidBook.com — a construction intelligence platform for South Florida contractors.

${BBB_BRAND_CONTEXT}

VIDEO CONCEPT:
Angle: ${concept.angle}
Viral hook type: ${concept.viralHook}
Scene being shown: ${concept.scene}
Suggested caption seed: "${concept.captionSeed}"

Write a punchy Instagram Reel caption. Rules:
- Line 1 (HOOK): stops the scroll. Bold statement or question. Max 10 words. No emojis.
- Lines 2-3: expand on the hook with FOMO, urgency, or insight. 1-2 sentences.
- Final line: clear CTA mentioning buildersbidbook.com
- Voice: direct, aggressive, no-fluff, Miami contractor energy
- BANNED: "game changer", "unlock", "revolutionize", "in today's world", "don't miss out", "fast-paced"
- Total: 4-5 lines

Respond with JSON: { "headline": "hook line only, max 8 words", "caption": "full caption with \\n between lines" }`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 350,
    });

    const parsed = JSON.parse(res.choices[0].message.content ?? '{}') as {
      headline?: string;
      caption?: string;
    };

    const body = parsed.caption?.trim() ?? concept.captionSeed;
    return `${body}\n\n${hashtags}`;
  } catch {
    return `${concept.captionSeed}\n\nFind active South Florida construction projects before your competitors at buildersbidbook.com\n\n${hashtags}`;
  }
}

function buildReplicatePrompt(scene: string): string {
  return `${scene} No text, no logos, no watermarks, no subtitles. Cinematic professional videography. Smooth motion. High production value. Photorealistic.`;
}

// Strips animation/motion words so the scene description works as a DALL-E still-image prompt.
function buildDallePrompt(scene: string): string {
  const cleaned = scene
    .replace(/\b(slow[\s-]motion|time[\s-]lapse|fast[\s-]forward|seamless transition|wipe transition|split[\s-]screen|rapid succession|rapid|cut to|fade to|pull back|zoom out|zoom in|camera [a-z]+|montage|timelapse|pan of|sweeping|flying over|pulling back|drone shot)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return `${cleaned} Bright royal blue (#1055FF) brand accent colors, white, clean premium flat design. South Florida. Photorealistic high-quality architectural or construction photography. No text, no logos, no watermarks. Ultra sharp, well-lit, professional.`;
}
