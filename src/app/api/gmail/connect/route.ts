import { NextResponse } from "next/server";
import { getGmailAuthUrl } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env" },
      { status: 500 }
    );
  }

  const url = getGmailAuthUrl();
  return NextResponse.redirect(url);
}
