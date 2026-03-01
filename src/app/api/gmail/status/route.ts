import { NextResponse } from "next/server";
import { getGmailStatus } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getGmailStatus();
  return NextResponse.json(status);
}
