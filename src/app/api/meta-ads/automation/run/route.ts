// src/app/api/meta-ads/automation/run/route.ts
// Cron endpoint — runs every hour via Vercel cron.
// Also callable manually for testing with ?force=1 or the cron key.

import { NextRequest, NextResponse } from "next/server";
import { runAutomationLoop } from "@/lib/meta/metaAutomationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  // Auth: Vercel cron header OR ?key= param
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const keyParam = req.nextUrl.searchParams.get("key");
  const cronKey = process.env.META_CRON_KEY ?? process.env.AUTO_CRON_KEY;
  const isKeyValid = cronKey && keyParam === cronKey;
  const isForced = req.nextUrl.searchParams.get("force") === "1";

  if (!isVercelCron && !isKeyValid && !isForced) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutomationLoop();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[meta-ads/automation/run]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
