import { NextResponse } from "next/server";
import { getMassGmailAuthUrl } from "@/lib/mass-gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const redirectUri =
    process.env.MASS_GOOGLE_REDIRECT_URI ||
    `${origin}/api/mass-gmail/callback`;
  const url = getMassGmailAuthUrl(redirectUri);
  return NextResponse.redirect(url);
}
