import { NextResponse } from "next/server";
import { scanBouncesForPoolAccounts } from "@/lib/mass-bounce-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const result = await scanBouncesForPoolAccounts();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
