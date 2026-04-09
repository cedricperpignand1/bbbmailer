import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  generateInstagramContent,
  generateInstagramImage,
} from '@/lib/ai/instagramAi';
import { stampAndSaveImage } from '@/lib/imageStamp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    // ── 1. Fetch recent history for anti-repetition ──────────────────────────
    const previousPosts = await prisma.igAiPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        headline: true,
        angle: true,
        caption: true,
      },
    });

    // ── 2. Generate text content via GPT-4o ──────────────────────────────────
    const content = await generateInstagramContent(previousPosts);

    if (!content.caption || !content.imagePrompt) {
      return NextResponse.json(
        { ok: false, error: 'AI returned incomplete content — try again.' },
        { status: 500 }
      );
    }

    // ── 3. Generate image via DALL-E 3 ───────────────────────────────────────
    const dalleUrl = await generateInstagramImage(content.imagePrompt);

    if (!dalleUrl) {
      return NextResponse.json(
        { ok: false, error: 'Image generation failed — try again.' },
        { status: 500 }
      );
    }

    // ── 4. Fetch, composite headline + logo, return as base64 ────────────────
    const imageData = await stampAndSaveImage(dalleUrl);

    // ── 5. Save text to DB for anti-repetition memory ────────────────────────
    await prisma.igAiPost.create({
      data: {
        headline: content.headline,
        angle: content.angle,
        imagePrompt: content.imagePrompt,
        caption: content.caption,
        firstComment: '',
      },
    });

    // ── 6. Return result ──────────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      imageUrl: imageData,
      headline: content.headline,
      angle: content.angle,
      caption: content.caption,
      imagePrompt: content.imagePrompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('[instagram-ai/generate]', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
