import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const appId      = process.env.IG_APP_ID;
  const redirectUri = process.env.IG_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.json({ error: 'IG_APP_ID or IG_REDIRECT_URI not set in .env' }, { status: 500 });
  }

  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',');

  // Must use Facebook dialog OAuth for the Instagram Graph API
  const url = new URL('https://www.facebook.com/dialog/oauth');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');

  return NextResponse.redirect(url.toString());
}
