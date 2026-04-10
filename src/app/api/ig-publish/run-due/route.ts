import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInstagramContent, generateInstagramImage } from '@/lib/ai/instagramAi';
import { stampAndSaveImage } from '@/lib/imageStamp';
import { createMediaContainer, publishMedia, currentPublishWindow, todayET } from '@/lib/igPublish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180; // image gen + two IG API calls can take ~2 min

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
    update: {},
  });

  if (!config.igUserId || !config.accessToken) {
    return NextResponse.json({ skip: true, reason: 'not_connected' });
  }
  if (!config.isActive && !force) {
    return NextResponse.json({ skip: true, reason: 'not_active' });
  }

  // ── 2. Check publish window ───────────────────────────────────────────────
  const window = currentPublishWindow();
  if (!window.active && !force) {
    return NextResponse.json({ skip: true, reason: 'outside_window' });
  }

  const windowKey = window.active ? window.key : 'force';
  const dateStr   = todayET();

  // ── 3. Prevent duplicate runs in the same window ──────────────────────────
  if (!force) {
    const existing = await prisma.igPublishLog.findUnique({
      where: { dateStr_windowKey: { dateStr, windowKey } },
    });
    if (existing) {
      return NextResponse.json({ skip: true, reason: 'already_ran', log: existing });
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
  const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
  const imageUrl = `${baseUrl}/api/ig-publish/img/${stored.id}`;

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

  // ── 7. Publish to Instagram (feed post + story) ───────────────────────────
  let feedPostId  = '';
  let storyPostId = '';
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errorMsg: string | undefined;

  try {
    const feedContainerId = await createMediaContainer(
      config.igUserId, config.accessToken, imageUrl, content.caption, false
    );
    feedPostId = await publishMedia(config.igUserId, config.accessToken, feedContainerId);
  } catch (err) {
    status   = 'failed';
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  if (status !== 'failed') {
    try {
      const storyContainerId = await createMediaContainer(
        config.igUserId, config.accessToken, imageUrl, '', true
      );
      storyPostId = await publishMedia(config.igUserId, config.accessToken, storyContainerId);
    } catch (err) {
      status   = 'partial'; // feed worked, story failed
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  // ── 8. Log the result ─────────────────────────────────────────────────────
  const logEntry = await prisma.igPublishLog.upsert({
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
  });

  return NextResponse.json({ ok: status !== 'failed', status, feedPostId, storyPostId, error: errorMsg, log: logEntry });
}
