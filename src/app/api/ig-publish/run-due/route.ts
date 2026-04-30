import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInstagramContent, generateInstagramImage } from '@/lib/ai/instagramAi';
import { generateVideoContent } from '@/lib/ai/instagramVideoAi';
import { stampAndSaveImage, stampStoryImage } from '@/lib/imageStamp';
import { createMediaContainer, createReelContainer, publishMedia, waitForContainer, currentPublishWindow, todayET } from '@/lib/igPublish';
import { generateReplicateVideo } from '@/lib/replicateVideo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Thursday Reel: Replicate gen (~3 min) + Meta processing (~2 min)

// Vercel cron calls GET — just delegate to the same logic
export async function GET(req: NextRequest) {
  return POST(req);
}

/** Helper: record why this cron tick was skipped and return the skip response */
async function skipWith(reason: string) {
  await prisma.igPublishConfig.update({
    where: { id: 1 },
    data: { lastCronAt: new Date(), lastSkipReason: reason },
  }).catch(() => {/* ignore if row doesn't exist yet */});
  return NextResponse.json({ skip: true, reason });
}

export async function POST(req: NextRequest) {
  // Optional cron key guard
  const cronKey = req.headers.get('x-cron-key');
  const force = new URL(req.url).searchParams.get('force') === '1';
  const forceVideo = new URL(req.url).searchParams.get('video') === '1';

  if (cronKey && process.env.AUTO_CRON_KEY && cronKey !== process.env.AUTO_CRON_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ── 1. Load config ────────────────────────────────────────────────────────
  const config = await prisma.igPublishConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: { lastCronAt: new Date() },
  });

  if (!config.igUserId || !config.accessToken) {
    return skipWith('not_connected — enter IG User ID + token in the panel');
  }
  if (!config.isActive && !force) {
    return skipWith('not_active — toggle Active on in the panel');
  }

  // ── 2. Check publish window ───────────────────────────────────────────────
  const window = currentPublishWindow();
  if (!window.active && !force) {
    return skipWith('outside_window — next windows: Tue 7am · Wed 12pm · Thu 6:30pm ET');
  }

  const windowKey = window.active ? window.key : 'force';
  const dateStr   = todayET();

  // ── 3. Prevent duplicate runs in the same window ──────────────────────────
  if (!force) {
    const existing = await prisma.igPublishLog.findUnique({
      where: { dateStr_windowKey: { dateStr, windowKey } },
    });
    if (existing) {
      return skipWith(`already_ran for ${windowKey} on ${dateStr}`);
    }
  }

  // ── 4. Branch: Thursday or ?video=1 = AI video Reel, other days = AI image ──
  const isVideoRun = forceVideo || windowKey === 'thu-630pm';

  if (isVideoRun) {
    return runThursdayReel(req, config, windowKey, dateStr, force);
  }
  return runImagePost(config, windowKey, dateStr);
}

// ─────────────────────────────────────────────────────────────────────────────
// THURSDAY: Generate & post an AI video Reel via Replicate
// ─────────────────────────────────────────────────────────────────────────────
async function runThursdayReel(
  _req: NextRequest,
  config: { igUserId: string; accessToken: string },
  windowKey: string,
  dateStr: string,
  _force: boolean
) {
  // Load last 20 Thursday video angles for anti-repetition
  const previousVideos = await prisma.igVideoPost.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { conceptAngle: true },
  });
  const usedAngles = previousVideos.map(v => v.conceptAngle);

  // Generate concept + caption via GPT-4o
  const videoContent = await generateVideoContent(usedAngles);

  // Generate DALL-E first-frame image (minimax/video-01-live is image-to-video)
  const firstFrameUrl = await generateInstagramImage(videoContent.dalleImagePrompt);
  if (!firstFrameUrl) {
    return NextResponse.json({ ok: false, error: 'DALL-E first frame generation failed' }, { status: 500 });
  }

  // Animate the first frame into a video via Replicate (~2-4 min)
  let videoUrl: string;
  try {
    videoUrl = await generateReplicateVideo(videoContent.replicatePrompt, firstFrameUrl);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Replicate video generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // Save video post record for anti-repetition tracking
  await prisma.igVideoPost.create({
    data: {
      conceptAngle: videoContent.conceptAngle,
      headline:     videoContent.headline,
      videoUrl,
      caption:      videoContent.caption,
    },
  });

  // Publish as Instagram Reel via Meta Graph API
  let feedPostId = '';
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errorMsg: string | undefined;

  try {
    const reelContainerId = await createReelContainer(
      config.igUserId, config.accessToken, videoUrl, videoContent.caption
    );
    // Reels take longer to process than images — use more retries
    await waitForContainer(config.igUserId, config.accessToken, reelContainerId, 20);
    feedPostId = await publishMedia(config.igUserId, config.accessToken, reelContainerId);
  } catch (err) {
    status   = 'failed';
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const [logEntry] = await Promise.all([
    prisma.igPublishLog.upsert({
      where:  { dateStr_windowKey: { dateStr, windowKey } },
      create: {
        configId: 1, dateStr, windowKey,
        headline:  videoContent.headline,
        caption:   videoContent.caption,
        imageFile: '',
        videoUrl,
        feedPostId,
        storyPostId: '',
        status, error: errorMsg,
      },
      update: {
        headline:  videoContent.headline,
        caption:   videoContent.caption,
        videoUrl,
        feedPostId,
        status, error: errorMsg,
        publishedAt: new Date(),
      },
    }),
    prisma.igPublishConfig.update({
      where: { id: 1 },
      data: {
        lastCronAt: new Date(),
        lastSkipReason: status === 'success'
          ? `reel posted — ${windowKey} on ${dateStr}`
          : `reel ${status}: ${errorMsg?.slice(0, 100) ?? 'unknown error'}`,
      },
    }),
  ]);

  return NextResponse.json({
    ok: status !== 'failed',
    type: 'reel',
    status,
    feedPostId,
    videoUrl,
    conceptAngle: videoContent.conceptAngle,
    error: errorMsg,
    log: logEntry,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TUE / WED: Generate & post a stamped AI image (existing flow)
// ─────────────────────────────────────────────────────────────────────────────
async function runImagePost(
  config: { igUserId: string; accessToken: string },
  windowKey: string,
  dateStr: string
) {
  // ── 4. Generate AI content ────────────────────────────────────────────────
  const previousPosts = await prisma.igAiPost.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { headline: true, angle: true, caption: true },
  });

  const content = await generateInstagramContent(previousPosts);

  if (!content.caption || !content.imagePrompt) {
    return NextResponse.json({ ok: false, error: 'AI returned incomplete content' }, { status: 500 });
  }

  // ── 5. Generate + stamp image, save to DB ────────────────────────────────
  const dalleUrl = await generateInstagramImage(content.imagePrompt);
  if (!dalleUrl) {
    return NextResponse.json({ ok: false, error: 'Image generation failed' }, { status: 500 });
  }

  const dataUri  = await stampAndSaveImage(dalleUrl, content.headline);
  const base64   = dataUri.replace(/^data:image\/jpeg;base64,/, '');
  const stored   = await prisma.igImageStore.create({ data: { data: base64 } });
  const baseUrl  = (process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://bbbmailer.vercel.app').replace(/\/$/, '');
  const imageUrl = `${baseUrl}/api/ig-publish/img/${stored.id}`;

  const storyDataUri  = await stampStoryImage(dalleUrl, content.headline);
  const storyBase64   = storyDataUri.replace(/^data:image\/jpeg;base64,/, '');
  const storyStored   = await prisma.igImageStore.create({ data: { data: storyBase64 } });
  const storyImageUrl = `${baseUrl}/api/ig-publish/img/${storyStored.id}`;

  await prisma.igAiPost.create({
    data: {
      headline:     content.headline,
      angle:        content.angle,
      imagePrompt:  content.imagePrompt,
      caption:      content.caption,
      firstComment: '',
    },
  });

  // Pre-warm image endpoints so Meta doesn't hit a cold serverless start
  await Promise.all([
    fetch(imageUrl,      { method: 'HEAD' }).catch(() => {}),
    fetch(storyImageUrl, { method: 'HEAD' }).catch(() => {}),
  ]);
  await new Promise(r => setTimeout(r, 1500));

  // ── 7. Publish to Instagram (feed post + story) ───────────────────────────
  let feedPostId  = '';
  let storyPostId = '';
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errorMsg: string | undefined;

  try {
    const feedContainerId = await createMediaContainer(
      config.igUserId, config.accessToken, imageUrl, content.caption, false
    );
    await waitForContainer(config.igUserId, config.accessToken, feedContainerId);
    feedPostId = await publishMedia(config.igUserId, config.accessToken, feedContainerId);
  } catch (err) {
    status   = 'failed';
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  if (status !== 'failed') {
    try {
      const storyContainerId = await createMediaContainer(
        config.igUserId, config.accessToken, storyImageUrl, '', true
      );
      await waitForContainer(config.igUserId, config.accessToken, storyContainerId);
      storyPostId = await publishMedia(config.igUserId, config.accessToken, storyContainerId);
    } catch (err) {
      status   = 'partial';
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  const [logEntry] = await Promise.all([
    prisma.igPublishLog.upsert({
      where:  { dateStr_windowKey: { dateStr, windowKey } },
      create: {
        configId: 1, dateStr, windowKey,
        headline: content.headline,
        caption:  content.caption,
        imageFile: String(stored.id),
        feedPostId, storyPostId, status, error: errorMsg,
      },
      update: {
        headline: content.headline,
        caption:  content.caption,
        imageFile: String(stored.id),
        feedPostId, storyPostId, status, error: errorMsg,
        publishedAt: new Date(),
      },
    }),
    prisma.igPublishConfig.update({
      where: { id: 1 },
      data: {
        lastCronAt: new Date(),
        lastSkipReason: status === 'success'
          ? `posted — ${windowKey} on ${dateStr}`
          : `${status}: ${errorMsg?.slice(0, 100) ?? 'unknown error'}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: status !== 'failed', type: 'image', status, feedPostId, storyPostId, error: errorMsg, log: logEntry });
}
