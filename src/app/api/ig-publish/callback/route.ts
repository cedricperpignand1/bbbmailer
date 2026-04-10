import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code       = searchParams.get('code');
  const error      = searchParams.get('error');
  const errorMsg   = searchParams.get('error_message');

  const base        = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const appId       = process.env.IG_APP_ID!;
  const appSecret   = process.env.IG_APP_SECRET!;
  const redirectUri = process.env.IG_REDIRECT_URI!;

  if (error || errorMsg || !code) {
    const msg = errorMsg ?? error ?? 'no_code';
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=${encodeURIComponent(msg)}`);
  }

  // ── 1. Exchange code for short-lived token (Facebook OAuth) ──────────────
  const tokenUrl = new URL('https://graph.facebook.com/oauth/access_token');
  tokenUrl.searchParams.set('client_id',     appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('redirect_uri',  redirectUri);
  tokenUrl.searchParams.set('code',          code);

  const tokenRes  = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };

  if (!tokenData.access_token) {
    const msg = tokenData.error?.message ?? 'token_exchange_failed';
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=${encodeURIComponent(msg)}`);
  }

  const shortToken = tokenData.access_token;

  // ── 2. Exchange for long-lived token (60 days) ────────────────────────────
  const llUrl = new URL('https://graph.facebook.com/oauth/access_token');
  llUrl.searchParams.set('grant_type',        'fb_exchange_token');
  llUrl.searchParams.set('client_id',         appId);
  llUrl.searchParams.set('client_secret',     appSecret);
  llUrl.searchParams.set('fb_exchange_token', shortToken);

  const llRes  = await fetch(llUrl.toString());
  const llData = await llRes.json() as { access_token?: string; error?: { message: string } };

  if (!llData.access_token) {
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=longtoken_failed`);
  }

  const longToken = llData.access_token;

  // ── 3. Get Instagram user ID from the new Instagram API ──────────────────
  const meRes  = await fetch(`https://graph.instagram.com/v19.0/me?fields=id,username&access_token=${longToken}`);
  const meData = await meRes.json() as { id?: string; username?: string; error?: { message: string } };

  if (!meData.id) {
    const msg = meData.error?.message ?? 'no_ig_account_found';
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=${encodeURIComponent(msg)}`);
  }

  // ── 4. Save to DB ─────────────────────────────────────────────────────────
  await prisma.igPublishConfig.upsert({
    where:  { id: 1 },
    create: { id: 1, igUserId: meData.id, accessToken: longToken },
    update: { igUserId: meData.id, accessToken: longToken },
  });

  return NextResponse.redirect(`${base}/instagram-ai?ig_connected=1`);
}
