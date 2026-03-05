import { NextResponse } from "next/server";
import { getMassGmailAuthUrl } from "@/lib/mass-gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const url = getMassGmailAuthUrl();
  return NextResponse.redirect(url);
}
