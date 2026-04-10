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
    // ── 1. Exchange code for short-lived user token (Facebook OAuth) ────────
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

    // ── 2. Exchange for long-lived token (60 days) ────────────────────────
    const llUrl = new URL('https://graph.facebook.com/oauth/access_token');
    llUrl.searchParams.set('grant_type',        'fb_exchange_token');
    llUrl.searchParams.set('client_id',         appId);
    llUrl.searchParams.set('client_secret',     appSecret);
    llUrl.searchParams.set('fb_exchange_token', shortToken);

    const llRes  = await fetch(llUrl.toString());
    const llData = await llRes.json() as { access_token?: string; error?: { message: string } };
    const longToken = llData.access_token ?? shortToken;

    // ── 3. Get Instagram Business Account ID via Pages ────────────────────
    const pagesRes  = await fetch(`https://graph.facebook.com/me/accounts?access_token=${longToken}`);
    const pagesData = await pagesRes.json() as { data?: { id: string; access_token: string }[] };

    let igUserId   = '';
    let finalToken = longToken;

    if (pagesData.data && pagesData.data.length > 0) {
      const page   = pagesData.data[0];
      const igRes  = await fetch(`https://graph.facebook.com/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
      const igData = await igRes.json() as { instagram_business_account?: { id: string } };
      if (igData.instagram_business_account?.id) {
        igUserId   = igData.instagram_business_account.id;
        finalToken = page.access_token;
      }
    }

    if (!igUserId) {
      return NextResponse.redirect(`${base}/instagram-ai?ig_error=no_ig_account_found`);
    }

    // ── 4. Save to DB ───────────────────────────────────────────────────────
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
