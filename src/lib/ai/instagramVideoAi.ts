// src/lib/ai/instagramVideoAi.ts
// Thursday Instagram Reel content engine.
//
// All concepts are residential South Florida — luxury homes, gated communities,
// new construction neighborhoods. NO commercial highrises. NO tower cranes.
//
// Flow: GPT-4o picks concept + writes caption →
//       DALL-E generates clean first-frame image →
//       minimax/video-01-live animates it (clean video, no text blur) →
//       Story gets the stamped image with headline + logo (fully readable text).

import OpenAI from 'openai';
import { BBB_BRAND_CONTEXT } from './instagramAi';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ─────────────────────────────────────────────────────────────────────────────
// 26 RESIDENTIAL VIDEO CONCEPTS FOR BUILDERSBIDBOOK
//
// dalleImagePrompt → still first-frame image (DALL-E 3, clean no text)
// replicatePrompt  → subtle motion description for minimax (keep it gentle)
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_CONCEPTS = [

  // ── PERMIT DISCOVERY ──────────────────────────────────────────────────────
  {
    angle: 'permit-map-residential',
    viralHook: 'data-shock',
    headline: 'New permits drop every morning.',
    dalleImagePrompt: 'Top-down aerial view of a South Florida residential neighborhood map with glowing royal blue (#1055FF) location pins appearing across Coral Gables, Boca Raton, and Davie — each pin marking a new home construction permit. Dozens of bright blue pins on a clean street-level map. Tech-forward data visualization style. No skyscrapers. Only houses and residential streets. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'New glowing blue permit pins gently appear one by one across the residential neighborhood map, spreading from Miami toward Boca Raton. Camera slowly zooms toward a cluster of new pins in a quiet suburban neighborhood. Calm but exciting energy.',
    captionSeed: 'Every pin is a home being built. Every home is a bid opportunity.',
  },
  {
    angle: 'contractor-alert-on-site',
    viralHook: 'fomo-winner',
    headline: 'The contractor who sees it first wins.',
    dalleImagePrompt: 'Close-up of a contractor\'s hand holding a smartphone on a residential South Florida job site. The phone screen shows a permit alert: "NEW PERMIT — $1.8M Luxury Residence, Coral Gables, FL — Owner Contact Available." Morning golden light. Residential framing visible in background, palm trees. No commercial buildings. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The phone screen glows as the permit alert appears. The contractor\'s thumb taps the notification. Camera gently pushes in toward the phone screen, slowly revealing the owner contact details below the project address. Purposeful, focused energy.',
    captionSeed: 'Owner name. Phone number. Email. All right there.',
  },
  {
    angle: 'permits-filed-overnight',
    viralHook: 'hustle-contrast',
    headline: 'Permits were filed while you slept.',
    dalleImagePrompt: 'Split image: left half shows dark suburban South Florida neighborhood at night with house silhouettes under a star-filled sky; right half shows the same neighborhood at golden sunrise with active residential construction — wood framing going up, lumber trucks arriving. Bold royal blue dividing line. No commercial buildings. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The right side gradually comes alive — workers arrive at the residential construction site, a lumber truck pulls up, framing begins. The left stays dark and still. Camera slowly pulls back to show both halves. Contrast between sleeping and winning.',
    captionSeed: 'The permit was filed at 6 AM. Did you make the call?',
  },
  {
    angle: 'reach-homeowner-first',
    viralHook: 'relationship-edge',
    headline: 'Most contractors never even meet the homeowner.',
    dalleImagePrompt: 'Confident contractor in safety vest shaking hands with a homeowner couple in front of an empty residential lot in a South Florida gated community. Survey stakes in the ground. Palm trees, blue sky. Plans rolled up under the contractor\'s arm. Warm, professional, residential setting. No commercial buildings. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The handshake is firm and warm. Behind them, a survey crew begins marking the lot. The homeowner gestures toward the empty land explaining their vision. Camera gently circles to show the full residential lot and neighboring homes.',
    captionSeed: 'BuildersBidBook shows you who owns the project — before it starts.',
  },
  {
    angle: 'project-intel-dashboard',
    viralHook: 'platform-power',
    headline: 'Stop guessing. Start knowing.',
    dalleImagePrompt: 'Contractor sitting in a pickup truck parked in a quiet South Florida residential neighborhood, laptop open on the dashboard showing a clean construction intelligence dashboard — home addresses, permit values ($800K, $1.2M, $2.1M), owner contact info. Coffee in cupholder. Focused expression. Residential homes visible through windshield. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor scrolls through new residential project listings — each one a real home address with owner contacts. A finger taps one entry to open the full details. Camera gently zooms toward the laptop screen. Purpose and confidence in every movement.',
    captionSeed: 'Full project intel. Owner contacts. Before anyone else calls.',
  },

  // ── SOUTH FLORIDA RESIDENTIAL MARKET ──────────────────────────────────────
  {
    angle: 'residential-neighborhood-aerial',
    viralHook: 'market-scale',
    headline: 'South Florida residential construction is everywhere.',
    dalleImagePrompt: 'Wide aerial photograph of a South Florida suburban residential neighborhood showing 15-20 homes at various stages of construction — some at foundation, some framed, some nearly complete. Quiet streets, palm trees, blue sky. No commercial buildings, no skyscrapers, no cranes. Purely residential. Golden hour lighting. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Drone drifts slowly forward over the residential neighborhood. Individual homes at different construction stages come into focus — foundations, wood frames, roofing in progress. The peaceful suburban scale of the South Florida building market reveals itself.',
    captionSeed: 'All of this activity. How many of these homeowners have you called?',
  },
  {
    angle: 'gated-community-development',
    viralHook: 'fomo-scale',
    headline: 'An entire gated community going up at once.',
    dalleImagePrompt: 'Aerial photograph of a new gated residential community in Boca Raton with 25-30 luxury homes simultaneously under construction. Lots at different stages — slabs, frames, roofs. New palm tree landscaping starting. Quiet streets, no cranes, no commercial buildings. Late afternoon Florida sun. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera glides slowly over the gated community revealing home after home under construction. The scale builds — this is a major residential development with dozens of opportunities. Camera settles on one home at the framing stage, showing the craftsmanship.',
    captionSeed: 'Every lot in here filed a permit. Did you know about them?',
  },
  {
    angle: 'luxury-home-permits-dropping',
    viralHook: 'market-data',
    headline: 'Luxury home permits filed daily in South Florida.',
    dalleImagePrompt: 'Aerial view of an upscale South Florida residential street (Coral Gables or Pinecrest style) with several large luxury homes under construction side by side. Custom Mediterranean and modern architectural styles. Lush mature trees, manicured lots. No commercial anything. Pure luxury residential. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera slowly descends toward one of the luxury homes under construction, revealing the scale and quality of the build. Beautiful wood framing, custom windows going in. Camera circles the structure gently. This is high-value residential work.',
    captionSeed: 'High-value residential permits. Filed daily. We track every one.',
  },
  {
    angle: 'waterfront-residential',
    viralHook: 'luxury-opportunity',
    headline: 'Waterfront home permits are the highest value bids.',
    dalleImagePrompt: 'Aerial photograph of Fort Lauderdale residential canal street showing two large luxury waterfront single-family homes under construction side by side. Residential docks, the blue canal, palm trees. No commercial buildings. Purely residential waterfront. Warm afternoon light. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera drifts slowly forward along the canal, revealing each waterfront home under construction. The turquoise water, the palm trees, the custom boat docks being built. High-value residential work that rewards contractors who knew about it early.',
    captionSeed: 'Waterfront permits go to contractors who move first.',
  },

  // ── CONTRACTOR HUSTLE ─────────────────────────────────────────────────────
  {
    angle: 'boots-on-residential-slab',
    viralHook: 'identity-hustle',
    headline: 'First on site. First to bid.',
    dalleImagePrompt: 'Cinematic close-up of worn leather work boots stepping onto a fresh concrete residential foundation slab at sunrise. Golden light raking across the smooth concrete. A residential neighborhood with homes visible in the soft background. Palm trees. Power and purpose. No commercial buildings. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The boots take a slow, confident second step onto the concrete slab. Camera follows low along the ground. The residential job site wakes up around them — workers arriving, a concrete mixer nearby. First one here. First one to bid.',
    captionSeed: 'The best contractors show up before anyone else knows the job exists.',
  },
  {
    angle: 'morning-permit-alerts',
    viralHook: 'grind-culture',
    headline: 'Winning contractors wake up to permit alerts.',
    dalleImagePrompt: 'Contractor sitting in a pickup truck at dawn in a South Florida residential neighborhood. Interior glows with phone screen showing a new permit notification. Steam rises from a coffee cup in the holder. Through the windshield: quiet residential street, palm trees, soft pre-dawn sky. No commercial buildings. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor reads the alert, immediately taps the owner contact, and begins dialing. Through the windshield, the neighborhood slowly brightens as dawn arrives over the residential street. A neighbor\'s light turns on. This contractor is already working.',
    captionSeed: '5:47 AM. New permit. New home. New opportunity. Call already made.',
  },
  {
    angle: 'residential-handshake-win',
    viralHook: 'win-reveal',
    headline: 'The job was won before the first nail.',
    dalleImagePrompt: 'Close-up of a firm handshake between a contractor and a homeowner couple in front of a residential lot with survey stakes in Coral Gables. The homeowner is holding house plans. Lush palm trees, beautiful Florida afternoon light. Residential neighborhood in background. No commercial. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The handshake seals the deal. Behind the contractor, a surveying crew continues working the lot. The homeowner gestures excitedly toward where different rooms will be. Camera slowly pulls back to reveal the full empty lot — this build starts next week.',
    captionSeed: 'They built this relationship before the permit was even approved.',
  },
  {
    angle: 'sub-winning-residential',
    viralHook: 'success-proof',
    headline: 'Subcontractors who find projects early stay booked solid.',
    dalleImagePrompt: 'South Florida subcontractor (electrician or plumber) confidently reviewing a tablet showing a list of active residential construction projects on a job site. Single-family homes under construction in the background. Hard hat, work belt, professional gear. Busy, in-demand, winning. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The subcontractor scrolls through their project pipeline — multiple residential jobs, each one a home being built. They tap one, see the general contractor contact, and make a call. In the background, their crew continues working on an existing home. Fully booked.',
    captionSeed: 'Stop waiting for the GC to call you. Find the homes yourself.',
  },

  // ── SPEED / URGENCY ───────────────────────────────────────────────────────
  {
    angle: 'permit-timestamps-residential',
    viralHook: 'urgency-clock',
    headline: 'A permit filed 4 hours ago. Your competitor already called.',
    dalleImagePrompt: 'Close-up of a smartphone screen showing a residential permit filing record: "NEW HOME PERMIT — 847 Banyan Rd, Coral Gables — $1.4M Single Family Residence — Filed 4 hours ago — Owner Contact Available." Clean permit data interface. Contractor hand visible holding the phone. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The phone screen scrolls slowly, revealing the permit details — address, value, owner contact, filed timestamp showing 4 hours ago. Camera zooms gently into the owner contact section. This information is the competitive edge. Time is running out.',
    captionSeed: '4 hours ago. Your competitor already called the homeowner.',
  },
  {
    angle: 'late-to-residential-project',
    viralHook: 'missed-opportunity',
    headline: 'This home started without your bid.',
    dalleImagePrompt: 'Active residential construction site — a beautiful single-family home frame fully erected with workers already installing roof trusses. A contractor arrives at the site entrance holding a bid folder, looking at the fully active job. Residential neighborhood, palm trees, blue sky. The job is clearly already awarded. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The late contractor walks slowly toward the active residential site. Workers pass without stopping. Roof trusses go up. Lumber is being cut. The job is in full swing — awarded, started, moving forward. Camera closes in on the bid folder in the contractor\'s hand, then on the active workers behind.',
    captionSeed: 'Don\'t be the contractor who shows up after the homeowner already signed.',
  },
  {
    angle: 'sunday-prep-residential',
    viralHook: 'preparation-ritual',
    headline: 'Monday bids go to whoever prepped Sunday night.',
    dalleImagePrompt: 'Contractor at a home kitchen table Sunday evening, laptop open showing residential construction project listings — home addresses, permit values, owner contact names. Coffee mug, legal pad with handwritten notes. Through the kitchen window: quiet South Florida neighborhood at dusk, palm trees. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The contractor scrolls through new residential permits, starring the best leads, writing notes. The neighborhood outside goes dark. Inside, they\'re building tomorrow\'s pipeline. Camera slowly pushes in toward the laptop screen showing the home addresses and owner contacts.',
    captionSeed: 'Your competitors scramble Monday morning. You\'ll already have calls booked.',
  },
  {
    angle: 'winner-loser-residential',
    viralHook: 'contrast-reveal',
    headline: 'The gap between first and second call is everything.',
    dalleImagePrompt: 'Split screen: left side — contractor on phone smiling, shaking hands with a homeowner in front of an empty residential lot with survey stakes; right side — different contractor arriving at the same lot type later, seeing construction has already begun without them. Bold royal blue dividing line. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Left side: the winning contractor walks the lot with the homeowner, plans in hand, job secured. Right side: the late contractor arrives to find workers already on site, turns and walks away. Camera slowly pulls back to show both halves simultaneously.',
    captionSeed: 'The difference between these two contractors is 4 hours of information.',
  },

  // ── PLATFORM CAPABILITY ───────────────────────────────────────────────────
  {
    angle: 'owner-contact-revealed',
    viralHook: 'product-power',
    headline: 'We show you who owns the home and how to reach them.',
    dalleImagePrompt: 'Close-up of a smartphone screen showing a BuildersBidBook-style project detail: home address, $1.6M permit value, and below it a section labeled "HOMEOWNER" with a contact name, phone number, and email. Contractor hand holding the phone on a residential street with homes visible. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The screen scrolls slowly downward revealing the homeowner contact section — name appears, then phone number, then email. A thumb taps the phone number. The call connects. Camera gently zooms toward the contact details. This is the intelligence that changes everything.',
    captionSeed: 'Homeowner name. Phone number. Email. One platform. Updated daily.',
  },
  {
    angle: 'residential-map-live',
    viralHook: 'scale-reveal',
    headline: 'Every active home construction in your area. Daily.',
    dalleImagePrompt: 'Street-level neighborhood map of South Florida (Coral Gables, Kendall, Davie, Boca) with dozens of bright royal blue permit pins clustered on residential streets — each pin a home under construction. Clean, modern map interface. No commercial zones. Purely residential streets. Photorealistic render. 9:16 vertical.',
    replicatePrompt: 'New residential permit pins appear one by one on the neighborhood streets — a house here, another there, then three more on the same block. Camera slowly zooms into a cluster of pins in a busy building neighborhood. Each pin is a homeowner waiting for a call.',
    captionSeed: 'Every pin is a home. Every home is a homeowner you can reach.',
  },
  {
    angle: 'find-projects-early',
    viralHook: 'timing-advantage',
    headline: 'We find homes before construction even starts.',
    dalleImagePrompt: 'Three-stage split showing the same residential lot: far left — empty lot with permit sign just posted (labeled "Day 1 — Permit Filed"); center — foundation being poured (labeled "Week 3"); right — completed luxury home (labeled "Month 8"). Royal blue stage labels. No commercial anything. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera pans slowly left to right across the three stages. When it reaches "Day 1 — Permit Filed" it stops and gently zooms in — this is where BuildersBidBook puts you. The permit sign becomes clearly readable. This is the beginning. This is where you win.',
    captionSeed: 'We put you at Day 1. Not Month 8.',
  },
  {
    angle: 'central-platform-simple',
    viralHook: 'simplicity',
    headline: 'Permits. Addresses. Owner contacts. One platform.',
    dalleImagePrompt: 'Clean top-down flat lay of a contractor\'s work desk: scattered county permit portal printouts pushed to the side, and one tablet in the center glowing with a clean residential project dashboard showing home addresses, permit values, and owner contact info. Simple, organized, decisive. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The cluttered permit printouts slide off the desk. The central tablet comes into focus — clean, organized, powerful. A finger scrolls through residential project listings. New homes appearing. Owner contacts visible. Camera slowly zooms toward the tablet screen.',
    captionSeed: 'Stop hunting across 10 county websites. One platform has everything.',
  },

  // ── CONSTRUCTION CRAFT (RESIDENTIAL) ──────────────────────────────────────
  {
    angle: 'concrete-pour-residential',
    viralHook: 'satisfying',
    headline: 'Every pour started with a permit. Were you the first call?',
    dalleImagePrompt: 'Ultra close-up of smooth liquid concrete being poured onto a residential foundation slab in South Florida at golden hour. Concrete flows in satisfying slow motion, warm light catching the surface. Residential framing and palm trees softly blurred in background. No commercial buildings. ASMR-quality construction photography. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'The concrete flows in beautiful slow motion across the residential foundation. Steam rises gently in the warm golden light. Camera drifts slowly across the smooth wet surface. Deeply satisfying, meditative, and cinematic.',
    captionSeed: 'This started as a permit. The contractor who knew first is running this job.',
  },
  {
    angle: 'luxury-home-frame',
    viralHook: 'craft-pride',
    headline: 'South Florida\'s best homes start with the right contractor.',
    dalleImagePrompt: 'Beautiful wide-angle photo of a luxury single-family home wood frame fully erected in Boca Raton. Two-story frame, large footprint, palm trees surrounding it, perfect blue Florida sky. Workers visible on the structure. Custom home scale — large but residential. No commercial anything. Golden hour. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera slowly circles the impressive luxury home wood frame. The scale becomes clear — custom rooms, large windows framed out, second-story balcony structure taking shape. Workers move purposefully. Camera tilts up toward the roofline against the blue Florida sky.',
    captionSeed: 'Projects like this go to contractors who knew about the permit on Day 1.',
  },
  {
    angle: 'residential-roof-going-on',
    viralHook: 'satisfying-build',
    headline: 'The roof goes on. Did you get the framing bid?',
    dalleImagePrompt: 'Workers installing a beautiful clay tile roof on a large South Florida luxury residential home. Aerial perspective showing the full roofline, workers in bright safety vests, palm trees and residential neighborhood below. Blue sky. Pure residential — no commercial buildings in sight. Golden afternoon light. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'Camera drifts slowly over the roofline as tiles are set in place one by one. Workers move steadily across the surface. The camera pulls back slightly to reveal the full home below — the neighborhood of similar luxury homes surrounding it. A satisfying reveal of scale.',
    captionSeed: 'The roof is going on. Three other bids were awarded two months ago.',
  },
  {
    angle: 'empty-lot-opportunity',
    viralHook: 'early-signal',
    headline: 'This empty lot has an active permit. Most contractors walk past.',
    dalleImagePrompt: 'Photorealistic image of an empty sunny lot in Coral Gables with survey stakes and a freshly posted construction permit sign at the edge. Neighboring luxury homes visible on both sides. Palm trees, perfect blue sky. The lot looks unremarkable but the permit sign is prominent and detailed. Early morning light. 9:16 vertical.',
    replicatePrompt: 'Camera slowly pushes in toward the permit sign on the empty residential lot. Details become clearer — the permit number, the project value, the owner name visible in the lower section. Then the camera pulls back to reveal more vacant lots on the same street with similar permit signs.',
    captionSeed: 'Empty lots with permits are your best early leads. We find them for you.',
  },
  {
    angle: 'before-after-residential',
    viralHook: 'transformation',
    headline: 'This was an empty lot 8 months ago.',
    dalleImagePrompt: 'Side-by-side comparison: left half shows an empty sandy lot in Coral Gables with survey stakes; right half shows a stunning completed 6,000 sqft Mediterranean luxury home with pool and landscaping — same exact angle. Bold royal blue dividing line. No commercial buildings. Photorealistic. 9:16 vertical.',
    replicatePrompt: 'A slow sweep reveals the right side of the image — the completed luxury home, the pool, the lush landscaping. The contrast with the empty lot on the left is dramatic. Camera gently zooms in on the finished home. This is what a permit filed 8 months ago looks like today.',
    captionSeed: 'Every lot was empty once. The permit tells you what\'s coming.',
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
  '#buildersbidbook #contractors #southflorida #construction #newconstruction #luxuryhomes #gccontractor #subcontractor #miamiconstruction #residentialconstruction',
  '#buildersbidbook #constructionintelligence #southfloridaconstruction #generalcontractor #estimator #constructionbusiness #bidmore #winmore #contractorlife #luxuryhomebuilder',
  '#buildersbidbook #residentialconstruction #miamihomes #fortlauderdalehomes #bocaconstrction #newpermits #gclife #subcontractors #homebuilder #southfloridahomes',
  '#buildersbidbook #contractorlife #newpermits #southfloridahomes #residentialbuilder #luxuryconstruction #constructionnetwork #bidfast #homebuilding #floridaconstruction',
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
"We track active residential construction addresses in South Florida. We find homes before they start so you can reach homeowners early, connect directly, and build strong relationships. Stay ahead, bid confidently, grow from one central platform."

VIDEO CONCEPT:
Angle: ${concept.angle}
Headline: "${concept.headline}"
Caption seed: "${concept.captionSeed}"

Write a punchy viral Instagram Reel caption. Rules:
- Line 1 (HOOK): Use the headline or make it stronger. Max 12 words. No emoji.
- Lines 2-3: 1-2 short punchy sentences — specific South Florida residential context, FOMO or insight.
- Line 4: Clear CTA mentioning buildersbidbook.com — "Find active homes before your competitors at buildersbidbook.com" or similar.
- Voice: Direct, no-fluff, Miami contractor energy.
- BANNED: "game changer", "unlock", "revolutionize", "leverage", "in today's world"
- Total: 4-5 short lines.

Respond with JSON: { "headline": "hook line max 10 words", "caption": "full caption with \\n between lines" }`,
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
    return `${concept.headline}\n\n${concept.captionSeed}\n\nFind active residential construction projects at buildersbidbook.com\n\n${hashtags}`;
  }
}
