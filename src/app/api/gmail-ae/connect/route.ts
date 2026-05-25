import { NextResponse } from "next/server";
import { getGmailAuthUrl } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.AE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AE_GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI_AE;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "AE_GOOGLE_CLIENT_ID and AE_GOOGLE_CLIENT_SECRET must be set in .env" },
      { status: 500 }
    );
  }

  if (!redirectUri) {
    return NextResponse.json(
      { error: "GOOGLE_REDIRECT_URI_AE must be set in .env (e.g. https://yourdomain.com/api/gmail-ae/callback)" },
      { status: 500 }
    );
  }

  const url = getGmailAuthUrl({ clientId, clientSecret, redirectUri });
  return NextResponse.redirect(url);
}
