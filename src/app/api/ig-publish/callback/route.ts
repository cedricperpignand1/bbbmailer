import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  if (error || !code) {
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=${error ?? 'no_code'}`);
  }

  const appId      = process.env.IG_APP_ID!;
  const appSecret  = process.env.IG_APP_SECRET!;
  const redirectUri = process.env.IG_REDIRECT_URI!;

  // ── 1. Exchange code for short-lived token ────────────────────────────────
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
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=token_exchange_failed`);
  }

  const shortToken = tokenData.access_token;
  const igUserId   = String(tokenData.user_id ?? '');

  // ── 2. Exchange for long-lived token (60 days) ────────────────────────────
  const llUrl = new URL('https://graph.instagram.com/access_token');
  llUrl.searchParams.set('grant_type',    'ig_exchange_token');
  llUrl.searchParams.set('client_secret', appSecret);
  llUrl.searchParams.set('access_token',  shortToken);

  const llRes  = await fetch(llUrl.toString());
  const llData = await llRes.json() as { access_token?: string; error?: { message: string } };

  if (!llData.access_token) {
    return NextResponse.redirect(`${base}/instagram-ai?ig_error=longtoken_failed`);
  }

  // ── 3. Save to DB ─────────────────────────────────────────────────────────
  await prisma.igPublishConfig.upsert({
    where:  { id: 1 },
    create: { id: 1, igUserId, accessToken: llData.access_token },
    update: { igUserId, accessToken: llData.access_token },
  });

  return NextResponse.redirect(`${base}/instagram-ai?ig_connected=1`);
}
