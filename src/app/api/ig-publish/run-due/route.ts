import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInstagramContent, generateInstagramImage } from '@/lib/ai/instagramAi';
import { stampAndSaveImage, stampStoryImage } from '@/lib/imageStamp';
import { createMediaContainer, publishMedia, waitForContainer, currentPublishWindow, todayET } from '@/lib/igPublish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180; // image gen + two IG API calls can take ~2 min

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

  // stampAndSaveImage returns "data:image/jpeg;base64,..." — extract base64 only
  const dataUri  = await stampAndSaveImage(dalleUrl, content.headline);
  const base64   = dataUri.replace(/^data:image\/jpeg;base64,/, '');

  // Save to DB so we can serve it via /api/ig-publish/img?id=X
  const stored   = await prisma.igImageStore.create({ data: { data: base64 } });
  const baseUrl  = (process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://bbbmailer.vercel.app').replace(/\/$/, '');
  const imageUrl = `${baseUrl}/api/ig-publish/img/${stored.id}`;

  // ── 6b. Generate 9:16 story image ────────────────────────────────────────
  const storyDataUri = await stampStoryImage(dalleUrl, content.headline);
  const storyBase64  = storyDataUri.replace(/^data:image\/jpeg;base64,/, '');
  const storyStored  = await prisma.igImageStore.create({ data: { data: storyBase64 } });
  const storyImageUrl = `${baseUrl}/api/ig-publish/img/${storyStored.id}`;

  // ── 6. Save AI post record for anti-repetition ────────────────────────────
  await prisma.igAiPost.create({
    data: {
      headline:     content.headline,
      angle:        content.angle,
      imagePrompt:  content.imagePrompt,
      caption:      content.caption,
      firstComment: '',
    },
  });

  // ── 6c. Pre-warm image endpoints so Meta doesn't hit a cold serverless start ──
  // Instagram downloads the image URL immediately — if the function is cold it fails.
  await Promise.all([
    fetch(imageUrl,      { method: 'HEAD' }).catch(() => {}),
    fetch(storyImageUrl, { method: 'HEAD' }).catch(() => {}),
  ]);
  // Small buffer for the warm instance to be ready
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
      status   = 'partial'; // feed worked, story failed
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  // ── 8. Log the result ─────────────────────────────────────────────────────
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

  return NextResponse.json({ ok: status !== 'failed', status, feedPostId, storyPostId, error: errorMsg, log: logEntry });
}
