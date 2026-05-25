import { NextResponse } from "next/server";
import { getGmailStatus } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AE_EMAIL =
  process.env.AE_GMAIL_SENDER_EMAIL || "angryestimators@gmail.com";

export async function GET() {
  const status = await getGmailStatus(AE_EMAIL);
  return NextResponse.json(status);
}
