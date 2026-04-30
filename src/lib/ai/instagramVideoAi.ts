// src/lib/ai/instagramVideoAi.ts
// Thursday Instagram Reel content engine.
// Every concept is tied directly to BuildersBidBook's core value:
// "Find active construction projects before they start — reach owners early, bid confidently."
//
// Flow: GPT-4o picks concept → DALL-E generates branded first frame →
//       stampAndSaveImage burns headline on it → minimax/video-01-live animates it.

import OpenAI from 'openai';
import { BBB_BRAND_CONTEXT } from './instagramAi';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ─────────────────────────────────────────────────────────────────────────────
// 26 EXPLOSIVE VIDEO CONCEPTS — each one directly promotes BBB's value prop
//
// dalleImagePrompt → what the STILL first-frame image looks like (DALL-E 3)
// replicatePrompt  → how minimax should ANIMATE that image (motion description)
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_CONCEPTS = [

  // ── PERMIT DISCOVERY / DATA ADVANTAGE ─────────────────────────────────────
  {
    angle: 'permit-map-explosion',
    viralHook: 'data-shock',
    headline: 'New permits drop every morning.',
    dalleImagePrompt: 'Top-down aerial view of South Florida map with glowing blue construction permit location pins clustered densely across Miami-Dade, Broward, and Palm Beach counties. Hundreds of bright royal blue (#1055FF) pins. Dark map background, pins glowing like city lights. Tech-forward, data visualization style. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'New glowing blue permit pins rapidly burst onto the South Florida map one after another, spreading across Miami-Dade, Broward, and Palm Beach counties. Each pin pulses and glows as it appears. Camera slowly zooms in toward Miami as pins keep dropping. Dramatic, fast, explosive energy.',
    captionSeed: 'Every pin is a project. Every project is money.',
  },
  {
    angle: 'contractor-gets-alert-first',
    viralHook: 'fomo-winner',
    headline: 'The contractor who sees it first wins.',
    dalleImagePrompt: 'Close-up of a contractor\'s hand holding a smartphone on a South Florida construction site. The phone screen shows a bright BuildersBidBook-style permit alert: "NEW PERMIT — $4.2M Luxury Residence, Coral Gables, FL — Owner Contact Available." Morning golden light. Concrete and work boots visible. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor\'s phone screen lights up with a permit alert notification. The contractor immediately taps to open it, reads the project details — their face showing focused determination — then dials. Camera gently pushes in toward the phone screen.',
    captionSeed: 'You have seconds before your competitor sees the same alert.',
  },
  {
    angle: 'while-competitors-sleep',
    viralHook: 'hustle-contrast',
    headline: 'Permits filed at 6 AM. Most contractors find out at noon.',
    dalleImagePrompt: 'Split mood image: left half shows a dark bedroom with a contractor sleeping, alarm clock reading 6:03 AM; right half shows a bright South Florida construction site already active with a crane and workers. Bold royal blue dividing line down the center. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Left side stays dark and still (sleeping contractor). Right side comes alive — crane begins to move, workers start walking, concrete truck pulls in. The contrast grows. Camera slowly pulls back to show both sides simultaneously. Dramatic and urgent.',
    captionSeed: 'The permit was filed while you slept. Someone else already called.',
  },
  {
    angle: 'reach-owner-before-anyone',
    viralHook: 'relationship-edge',
    headline: 'Most contractors never even get to talk to the owner.',
    dalleImagePrompt: 'Confident contractor in safety vest shaking hands with a well-dressed developer/project owner in front of an empty construction lot with survey stakes. South Florida palm trees, blue sky. Contract papers visible under the developer\'s arm. Golden hour lighting. Professional, successful energy. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The handshake begins. Camera slowly pushes in toward the joined hands. The developer smiles. Behind them, heavy equipment begins arriving on the empty lot. The job is clearly won before anyone else even knew it existed.',
    captionSeed: 'BuildersBidBook shows you who owns the project. Before it starts.',
  },
  {
    angle: 'bid-confidently',
    viralHook: 'authority',
    headline: 'Stop guessing. Start knowing.',
    dalleImagePrompt: 'Contractor sitting at a truck dashboard in a construction site parking lot, laptop open showing a clean project intelligence dashboard with project addresses, square footage, permit values, and owner contact information. Coffee cup in holder. Focused expression. Professional, data-forward. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor types on the laptop. New projects populate the screen in real time — addresses, values, contacts. The contractor picks up the phone and dials with confidence. Camera gently pushes in toward the screen showing the rich project data.',
    captionSeed: 'Full project intel before you make the call.',
  },

  // ── SOUTH FLORIDA MARKET SCALE ─────────────────────────────────────────────
  {
    angle: 'south-florida-boom-aerial',
    viralHook: 'market-scale-shock',
    headline: 'The South Florida building boom is not slowing down.',
    dalleImagePrompt: 'Dramatic wide aerial photograph of South Florida showing dozens of construction cranes and active construction sites stretching across Miami, Fort Lauderdale, and Boca Raton — all visible simultaneously. Intracoastal waterway gleaming in sunlight. Photorealistic aerial photography. 9:16 vertical.',
    replicatePrompt: 'Drone slowly glides forward over the vast South Florida construction landscape. New cranes and job sites come into frame one after another. The sheer scale is overwhelming — construction everywhere you look. Steady, majestic, awe-inspiring forward movement.',
    captionSeed: 'All of this is happening. Are you getting your share of these bids?',
  },
  {
    angle: 'permits-per-day-counter',
    viralHook: 'stat-shock',
    headline: '47 permits filed today. How many did you know about?',
    dalleImagePrompt: 'Bold graphic-style image: large "47" in massive white bold type against a deep royal blue background, with "NEW CONSTRUCTION PERMITS — MIAMI-DADE TODAY" in smaller white text below. Small South Florida outline map in the corner. Clean, modern, high-contrast. Photorealistic render. 9:16 vertical.',
    replicatePrompt: 'The number counter on screen rapidly increments: 12... 23... 35... 47. Each number appears with a punch. After reaching 47, individual project pins start appearing on a map of Miami-Dade in rapid-fire succession. Camera slowly zooms in on the counter.',
    captionSeed: 'These permits are public record. Most contractors never look.',
  },
  {
    angle: 'billions-active-construction',
    viralHook: 'wealth-scale',
    headline: '$2.4 billion in active South Florida construction right now.',
    dalleImagePrompt: 'Epic wide angle photograph of multiple simultaneous South Florida luxury construction sites — high-rise condos, waterfront mansions, commercial plazas — all visible in one panoramic frame. Golden hour, dramatic sky, cranes silhouetted. Overwhelming scale. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera drifts slowly across the massive construction panorama. Each site becomes clearer as we pass — high-rises, luxury homes, commercial buildings all going up simultaneously. The movement feels like flying above an economic boom in progress.',
    captionSeed: 'Billions in construction. Thousands of bid opportunities. One platform.',
  },
  {
    angle: 'waterfront-luxury-projects',
    viralHook: 'luxury-fomo',
    headline: 'The biggest contracts go to whoever calls first.',
    dalleImagePrompt: 'Aerial photograph of Fort Lauderdale Intracoastal waterway showing two massive luxury waterfront mansion projects under simultaneous construction. Cranes visible, foundations poured, framing starting. Yachts in the canal. Turquoise water, palm trees, perfect blue sky. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera glides slowly forward over the waterfront construction. Details become clearer — the scale of each mansion, the cranes at work, the high-end materials. A yacht passes below. This is the high-value contract territory most contractors never reach because they find out too late.',
    captionSeed: 'These owners posted permits days ago. Do you have their contact info?',
  },

  // ── BEFORE/AFTER TRANSFORMATION ────────────────────────────────────────────
  {
    angle: 'empty-lot-permit-filed',
    viralHook: 'opportunity-reveal',
    headline: 'This empty lot has an active permit. Most contractors walk past it.',
    dalleImagePrompt: 'Photorealistic image of an empty sandy lot in Coral Gables, Florida — survey stakes in the ground, a freshly posted construction permit sign on a stake at the edge. Palm trees, blue sky. The lot looks unremarkable but the permit sign is visible and detailed. Early morning light. 9:16 vertical.',
    replicatePrompt: 'Camera slowly pushes in toward the permit sign on the empty lot. As we get closer, the permit details become readable — $3.8M new construction, contact information visible. Then the camera pulls back to show the full street with similar lots on both sides, all having hidden permit signs.',
    captionSeed: 'Empty lots with active permits are your best leads. We find them for you.',
  },
  {
    angle: 'blueprint-to-winning-bid',
    viralHook: 'from-intel-to-win',
    headline: 'From permit filed to bid won — in 48 hours.',
    dalleImagePrompt: 'Architectural blueprint plans spread on a job site table, with a contractor\'s hand placing a signed contract on top. Phone next to it showing a permit notification. Sunlight casting shadows across the blueprints. Professional, decisive energy. South Florida jobsite background. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor\'s hand slides the signed contract firmly onto the blueprints. The phone screen shows the permit that started it all. Camera slowly pulls back to reveal the construction site behind them where work is already beginning. Story of speed-to-win.',
    captionSeed: 'The contractors who win bids fastest have the best intel.',
  },
  {
    angle: 'lot-to-luxury-mansion',
    viralHook: 'transformation',
    headline: 'This lot filed a $5M permit 6 months ago. Who got the work?',
    dalleImagePrompt: 'Side-by-side comparison image: left half shows an empty sandy Florida lot with a for-sale sign and survey stakes; right half shows a stunning completed 8,000 sqft Mediterranean luxury mansion with pool and lush landscaping — same camera angle, same location. Bold blue dividing line. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'A dramatic dissolve transition from the empty lot on the left to the completed mansion on the right. The transition sweeps across the frame revealing the finished luxury home. Camera gently zooms out after the reveal to show the full scale of the property.',
    captionSeed: 'That permit was public. The contractor who knew first got everything.',
  },

  // ── CONTRACTOR HUSTLE / IDENTITY ───────────────────────────────────────────
  {
    angle: 'first-on-site-every-morning',
    viralHook: 'identity-hustle',
    headline: 'First on site. First to bid. That is the formula.',
    dalleImagePrompt: 'Cinematic close-up of worn leather work boots stepping onto a fresh concrete foundation slab at sunrise. The boots are mid-stride, confident. Golden morning light rakes across the concrete surface. A construction site waking up in the background. Power and purpose in every detail. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The boots take a second step forward onto the concrete. Camera follows low along the ground. As they walk, the site comes alive around them — workers arriving, equipment starting up, the South Florida sun rising higher. The first person on site energy is palpable.',
    captionSeed: 'The best contractors are already on site before their competitors know the job exists.',
  },
  {
    angle: 'contractor-morning-advantage',
    viralHook: 'grind-culture',
    headline: 'The contractors winning in South Florida wake up to permit alerts.',
    dalleImagePrompt: 'Contractor sitting in a pickup truck at 5:47 AM in an empty South Florida construction site parking lot. Interior lit by phone screen glow showing a permit alert notification. Steam from a coffee cup. Miami skyline barely visible in the pre-dawn. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor reads the permit alert, immediately taps the owner contact info, and dials. Through the windshield, the first light of dawn starts to emerge over the Miami skyline. This contractor is working while the competition is still asleep.',
    captionSeed: '5:47 AM. New permit alert. Active project. Owner contact info. Call made.',
  },
  {
    angle: 'handshake-job-already-won',
    viralHook: 'win-reveal',
    headline: 'The job was won before the first nail was driven.',
    dalleImagePrompt: 'Close-up confident handshake between a contractor in safety vest and hard hat and a project owner in business casual wear. Behind them, an empty construction lot with fresh survey stakes. Contract papers visible under the owner\'s arm. South Florida golden afternoon light. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The handshake locks in firmly. Behind them in slow motion, the first delivery trucks begin arriving at the empty lot — lumber, equipment. Time is accelerating. The contractor who knew about this permit first is now running the job.',
    captionSeed: 'Relationships with owners are built before the project starts — or not at all.',
  },
  {
    angle: 'subcontractor-wins-big',
    viralHook: 'success-proof',
    headline: 'Subcontractors who use the right intel stop chasing and start winning.',
    dalleImagePrompt: 'South Florida subcontractor (electrician/plumber) confidently reviewing a tablet showing active project listings on a job site. Multiple open projects visible on screen. Hard hat, professional gear. Behind them, a large active residential construction site. Proud, busy, in-demand. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The subcontractor scrolls through active projects — each one a potential job. They tap one, see the project owner contact info, and make the call right on site. In the background, their crew continues working on an existing job. Fully booked, always winning.',
    captionSeed: 'Stop waiting for the GC to call you. Find the projects yourself.',
  },

  // ── SPEED / URGENCY ─────────────────────────────────────────────────────────
  {
    angle: 'permit-timestamp-race',
    viralHook: 'urgency-clock',
    headline: 'A permit was filed 4 hours ago. Your competitor already called.',
    dalleImagePrompt: 'Dramatic close-up of a digital permit filing system screen showing fresh timestamps: 6:02 AM, 6:14 AM, 6:31 AM, 6:47 AM — four separate new permits filed this morning. Each entry shows project address, value, and "OWNER CONTACT AVAILABLE." Phone on a construction site desk. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'New permit entries appear on the screen one by one with a punchy sound-effect visual flair — each timestamp ticking in. The camera pushes slowly into the screen. The most recent permit shows "filed 4 hours ago." The urgency builds with every new line.',
    captionSeed: '4 hours ago. Your competitor already called. Where were you?',
  },
  {
    angle: 'missed-project-reveal',
    viralHook: 'missed-opportunity',
    headline: 'This project started without your bid in the pile.',
    dalleImagePrompt: 'Active South Florida construction site with workers and equipment already in full operation. A second contractor arrives at the site entrance holding a bid folder — but concrete is already being poured and framing has started. The job is taken. South Florida morning light. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The late contractor approaches the active site. Workers pass them without stopping. A concrete truck rolls by. The project is clearly awarded and in progress. The contractor looks at their bid folder, then at the busy site. Camera slowly closes in on their face — this won\'t happen again.',
    captionSeed: 'Don\'t be the contractor who shows up after the job is gone.',
  },
  {
    angle: 'sunday-prep-monday-win',
    viralHook: 'preparation-ritual',
    headline: 'The bids you win on Monday were found on Sunday.',
    dalleImagePrompt: 'Contractor at a kitchen table Sunday evening with a laptop showing a construction project intelligence dashboard, coffee cup, legal pad with project notes. Phone next to them. South Florida neighborhood visible through the window at dusk. Focused, preparing, ahead of the game. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor scrolls through new project listings — tapping stars on the best leads, writing notes. Outside the window, the neighborhood goes dark. This is preparation. By Monday morning they\'ll already have calls scheduled. Camera slowly pushes in toward the laptop screen.',
    captionSeed: 'Your competitors will scramble Monday. You\'ll already have the calls booked.',
  },

  // ── PLATFORM CAPABILITY / PRODUCT ─────────────────────────────────────────
  {
    angle: 'owner-contact-revealed',
    viralHook: 'product-reveal',
    headline: 'We show you who owns the project and how to reach them.',
    dalleImagePrompt: 'Clean close-up of a smartphone screen showing a BuildersBidBook-style project detail page: project address, $3.1M value, permit number, and below it a "PROJECT OWNER" section with a contact name, phone number, and email. The data is specific and actionable. Phone held by contractor on a job site. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The phone screen scrolls down slowly revealing the owner contact information — name, phone number, email. A finger taps the phone number. The call connects. Camera slowly zooms in on the screen. This is the intelligence that changes everything.',
    captionSeed: 'Permit address. Owner name. Phone number. All in one place.',
  },
  {
    angle: 'active-projects-map-live',
    viralHook: 'platform-power',
    headline: 'Every active project in your area. Updated daily.',
    dalleImagePrompt: 'Aerial-style map view of South Florida (Miami Beach to Boca Raton) with dozens of bright royal blue project pins spread across it — each pin representing an active construction permit. The map is clean and modern, the pins clustered in construction-heavy neighborhoods. Satellite imagery base. Photorealistic render. 9:16 vertical.',
    replicatePrompt: 'New project pins begin appearing on the map one by one — Miami Beach, Coconut Grove, Brickell, Coral Gables, Fort Lauderdale. The pins pulse blue as they appear. Camera slowly zooms into the Miami cluster. Each pin is a real opportunity. The map fills up quickly.',
    captionSeed: 'This is what the South Florida market looks like right now.',
  },
  {
    angle: 'early-access-advantage',
    viralHook: 'exclusive-access',
    headline: 'Most contractors bid on projects that are already built.',
    dalleImagePrompt: 'Side-by-side timeline image showing the construction phases: far left — empty lot with permit sign (marked "EARLY ACCESS — BuildersBidBook users"); center — foundation and framing (marked "GOOD — some contractors know"); right — near-complete building (marked "TOO LATE — most contractors"). Bold blue stage markers. Photorealistic illustration style. 9:16 vertical.',
    replicatePrompt: 'Camera pans slowly from left to right across the three-stage timeline. Each stage label appears as the camera reaches it. When it lands on the "EARLY ACCESS" empty lot stage, the camera stops and slowly zooms in — this is where the opportunity is. This is where BuildersBidBook puts you.',
    captionSeed: 'We put you at the start of the timeline. Not the end.',
  },
  {
    angle: 'central-platform-hub',
    viralHook: 'simplicity-power',
    headline: 'Stop hunting across 10 websites. One platform has everything.',
    dalleImagePrompt: 'Clean flat-lay photograph of a contractor\'s work desk: multiple browser tabs printed out and scattered (city permit portals, county sites, Zillow, etc.) all crossed out — and one central tablet in the middle glowing with a clean construction intelligence dashboard. Bold, organized, decisive. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'One by one, the scattered browser printouts are swept off the desk. The central tablet remains, its screen glowing brighter. The contractor\'s hand confidently taps the dashboard — new projects, owner contacts, permit alerts all in one place. Clean. Simple. Powerful.',
    captionSeed: 'Permits. Projects. Owner contacts. One place. Updated daily.',
  },

  // ── CONSTRUCTION CRAFT / ASPIRATIONAL ─────────────────────────────────────
  {
    angle: 'concrete-pour-golden-hour',
    viralHook: 'satisfying-cinematic',
    headline: 'Every pour started with a permit. Were you the first call?',
    dalleImagePrompt: 'Ultra close-up of liquid concrete being poured onto a fresh foundation slab at golden hour in South Florida. The concrete is smooth and fluid, steam rising gently, the surface catching warm orange-gold light. Extreme macro detail — every aggregate visible. Photorealistic ASMR-quality construction photography. 9:16 vertical.',
    replicatePrompt: 'The concrete flows in slow beautiful motion — smooth, liquid, satisfying. Steam rises in the warm golden light. Camera drifts slowly across the surface of the pour. The rhythmic, meditative quality is hypnotic. Every pour started with a permit. Who made the first call on this one?',
    captionSeed: 'This started as a permit. The contractor who knew about it first is running this job.',
  },
  {
    angle: 'luxury-home-frame-rising',
    viralHook: 'build-pride',
    headline: 'The contractors building South Florida\'s most beautiful homes started early.',
    dalleImagePrompt: 'Stunning wide-angle photograph of a luxury home wood frame fully erected in Boca Raton — massive two-story frame against a perfect blue Florida sky, palm trees surrounding the property, the scale of the home visible in every beam. Workers visible on the structure. Golden hour light. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera slowly circles the impressive wood frame structure. The scale becomes increasingly apparent — this is a massive luxury home. Workers move purposefully across the frame. The camera tilts up toward the peak of the roof structure against the blue sky. This is the work that defines South Florida\'s skyline.',
    captionSeed: 'Projects like this don\'t wait for contractors to find them. Contractors find them first.',
  },
  {
    angle: 'miami-tower-crane-skyline',
    viralHook: 'epic-market',
    headline: 'South Florida construction is exploding. Your pipeline should be too.',
    dalleImagePrompt: 'Epic dramatic photograph of the Miami skyline at golden hour with five tower cranes visible and silhouetted against the orange sky — buildings under construction at different heights, Ocean in the distance, the scale of the development overwhelming. Photorealistic architectural photography. 9:16 vertical.',
    replicatePrompt: 'Camera slowly drifts across the Miami skyline, crane by crane. Each crane swings its load against the glowing sky. The city is building at an incredible pace. The scale is inspiring and overwhelming simultaneously. This market is active — the question is how much of it you\'re capturing.',
    captionSeed: 'All of these started with permits. BuildersBidBook tracks every single one.',
  },

] as const;

type Concept = (typeof VIDEO_CONCEPTS)[number];

// ─────────────────────────────────────────────────────────────────────────────

export interface VideoContent {
  conceptAngle: string;
  replicatePrompt: string;
  dalleImagePrompt: string;
  caption: string;
  headline: string;
}

export async function generateVideoContent(previousAngles: string[]): Promise<VideoContent> {
  const usedSet = new Set(previousAngles);
  const fresh = VIDEO_CONCEPTS.filter(c => !usedSet.has(c.angle));
  const pool: readonly Concept[] = fresh.length >= 3 ? fresh : VIDEO_CONCEPTS;

  // Weighted random — pick from the first 10 to bias toward freshest concepts
  const concept = pool[Math.floor(Math.random() * Math.min(pool.length, 10))];

  const caption = await buildCaption(concept);

  return {
    conceptAngle: concept.angle,
    replicatePrompt: concept.replicatePrompt,
    dalleImagePrompt: concept.dalleImagePrompt,
    caption,
    headline: concept.headline,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const HASHTAG_SETS = [
  '#buildersbidbook #contractors #southflorida #construction #constructionjobs #gccontractor #subcontractor #miamiconstruction #permitready #newconstruction',
  '#buildersbidbook #constructionintelligence #southfloridaconstruction #generalcontractor #estimator #constructionbusiness #bidmore #winmore #contractorlife',
  '#buildersbidbook #constructionfl #miamideveloper #fortlauderdaleconstruction #bocaconstruction #newpermits #gclife #subcontractors #buildersbidbook',
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
          content: `You write viral Instagram Reel captions for BuildersBidBook.com.

${BBB_BRAND_CONTEXT}

CORE MESSAGE TO ALWAYS REINFORCE:
"We track active construction addresses in your area. We find projects before they start so you can reach out early, connect with project owners, and build strong relationships. Stay ahead, bid confidently, and grow from one central platform."

VIDEO CONCEPT:
Angle: ${concept.angle}
Viral hook: ${concept.viralHook}
Headline: "${concept.headline}"
Caption seed: "${concept.captionSeed}"

Write a punchy viral Instagram Reel caption. Rules:
- Line 1 (HOOK): The headline above verbatim or a stronger version. Max 12 words. No emoji.
- Lines 2-3: 1-2 punchy sentences expanding on the FOMO or value. Reference South Florida, permits, or owner contacts specifically.
- Line 4: Mention buildersbidbook.com with a clear CTA — "Find active projects at buildersbidbook.com" or similar.
- Voice: Direct, aggressive, no-fluff Miami contractor energy.
- BANNED words: "game changer", "unlock", "revolutionize", "in today's world", "don't miss out", "leverage"
- Total: 4-5 short lines.

Respond with JSON: { "headline": "the hook line, max 10 words", "caption": "full caption with \\n between lines" }`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
    });

    const parsed = JSON.parse(res.choices[0].message.content ?? '{}') as {
      headline?: string;
      caption?: string;
    };

    const body = parsed.caption?.trim() ?? concept.captionSeed;
    return `${body}\n\n${hashtags}`;
  } catch {
    return `${concept.headline}\n\n${concept.captionSeed}\n\nFind active construction projects before your competitors at buildersbidbook.com\n\n${hashtags}`;
  }
}
