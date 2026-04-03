import { NextResponse } from "next/server";
import { exchangeCodeAndDetectEmail } from "@/lib/mass-gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `OAuth error: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "Missing code param" }, { status: 400 });
  }

  try {
    const redirectUri =
      process.env.MASS_GOOGLE_REDIRECT_URI ||
      `${url.origin}/api/mass-gmail/callback`;
    const email = await exchangeCodeAndDetectEmail(code, redirectUri);
    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
      url.origin;
    return NextResponse.redirect(`${appUrl}/mass-campaigns?connected=${encodeURIComponent(email)}`);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
