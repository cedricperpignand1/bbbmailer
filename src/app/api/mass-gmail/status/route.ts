import { NextResponse } from "next/server";
import { getMassGmailStatus } from "@/lib/mass-gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getMassGmailStatus();
  return NextResponse.json(status);
}
