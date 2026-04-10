import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code     = searchParams.get('code');
  const error    = searchParams.get('error');
  const errorMsg = searchParams.get('error_message');

  const base        = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const appId       = process.env.IG_APP_ID!;
  const appSecret   = process.env.IG_APP_SECRET!;
  const redirectUri = process.env.IG_REDIRECT_URI!;

  if (error || errorMsg || !code) {
    const msg = errorMsg ?? error ?? 'no_code';
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=${encodeURIComponent(msg)}`);
  }

  try {
    // ── 1. Exchange code for short-lived token ──────────────────────────────
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     appId,
        client_secret: appSecret,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
        code,
      }),
    });

    const tokenData = await tokenRes.json() as {
      access_token?: string;
      user_id?: number;
      error_message?: string;
    };

    if (!tokenData.access_token) {
      const msg = tokenData.error_message ?? 'token_exchange_failed';
      return NextResponse.redirect(`${base}/instagram-ai?ig_error=${encodeURIComponent(msg)}`);
    }

    const shortToken = tokenData.access_token;
    const igUserId   = String(tokenData.user_id ?? '');

    // ── 2. Exchange for long-lived token (60 days) ────────────────────────
    const llUrl = new URL('https://graph.instagram.com/access_token');
    llUrl.searchParams.set('grant_type',    'ig_exchange_token');
    llUrl.searchParams.set('client_secret', appSecret);
    llUrl.searchParams.set('access_token',  shortToken);

    const llRes  = await fetch(llUrl.toString());
    const llData = await llRes.json() as { access_token?: string; error?: { message: string } };

    const finalToken = llData.access_token ?? shortToken;

    // ── 3. Save to DB ───────────────────────────────────────────────────────
    await prisma.igPublishConfig.upsert({
      where:  { id: 1 },
      create: { id: 1, igUserId, accessToken: finalToken },
      update: { igUserId, accessToken: finalToken },
    });

    return NextResponse.redirect(`${base}/instagram-ai?ig_connected=1`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=${encodeURIComponent(msg)}`);
  }
}
