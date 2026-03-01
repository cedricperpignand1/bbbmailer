import { NextResponse } from "next/server";
import { exchangeCodeAndStore } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { error: `OAuth error: ${error}` },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing code parameter" },
      { status: 400 }
    );
  }

  try {
    await exchangeCodeAndStore(code);
    // Redirect to auto-campaigns page with success flag
    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
      url.origin;
    return NextResponse.redirect(`${appUrl}/auto-campaigns?gmail=connected`);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to exchange OAuth code" },
      { status: 500 }
    );
  }
}
