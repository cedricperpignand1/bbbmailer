import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { log, error } from '@/lib/logger';
import { checkIp } from '@/lib/fraud/ipQualityScore';
import { scoreClick } from '@/lib/fraud/detector';
import { blockIpAllCampaigns } from '@/lib/rules/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  gclid: z.string().min(1),
  duration: z.number().int().min(0),
  hasMouse: z.boolean(),
  pages: z.number().int().min(1),
  ts: z.number().int(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const body = parsed.data;

    const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
    const ip = forwardedFor.split(',')[0].trim() || '0.0.0.0';
    const userAgent = req.headers.get('user-agent') ?? '';

    const ipqsScore = await checkIp(ip);

    const clickTimestamp = new Date(body.ts - body.duration);
    const pageLoadTimestamp = new Date(body.ts);

    const clickData = {
      gclid: body.gclid,
      ip,
      userAgent,
      clickTimestamp,
      pageLoadTimestamp,
      timeDeltaMs: body.duration,
      hasMouse: body.hasMouse,
      sessionDurationMs: body.duration,
      pagesViewed: body.pages,
    };

    const result = await scoreClick(clickData, ipqsScore);

    await prisma.gadsAdClick.upsert({
      where: { gclid: body.gclid },
      update: {
        ip,
        userAgent,
        clickTimestamp,
        pageLoadTimestamp,
        timeDeltaMs: body.duration,
        hasMouse: body.hasMouse,
        sessionDurationMs: body.duration,
        pagesViewed: body.pages,
        fraudScore: result.score,
        flags: result.flags,
        flagged: result.action === 'flag' || result.action === 'block',
        blocked: result.action === 'block',
      },
      create: {
        gclid: body.gclid,
        ip,
        userAgent,
        clickTimestamp,
        pageLoadTimestamp,
        timeDeltaMs: body.duration,
        hasMouse: body.hasMouse,
        sessionDurationMs: body.duration,
        pagesViewed: body.pages,
        fraudScore: result.score,
        flags: result.flags,
        flagged: result.action === 'flag' || result.action === 'block',
        blocked: result.action === 'block',
      },
    });

    if (result.action === 'block') {
      // Fire and forget — don't await so the beacon response stays fast
      void blockIpAllCampaigns(ip, result.flags.join(','));
      log('ClickTrack', `Block triggered for IP ${ip} gclid=${body.gclid}`);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    error('ClickTrack', 'Unhandled error in click-track', err);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
