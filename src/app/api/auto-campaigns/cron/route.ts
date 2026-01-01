import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";

  const expected = process.env.AUTO_CRON_KEY || "";
  if (!expected) {
    return NextResponse.json({ error: "AUTO_CRON_KEY is not set" }, { status: 500 });
  }

  if (key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prefer origin from the request (works on Vercel), fallback to NEXT_PUBLIC_SITE_URL
  const origin = url.origin || process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

  // IMPORTANT: call run-today WITHOUT force=1 (scheduled mode)
  const res = await fetch(`${origin}/api/auto-campaigns/run-today`, {
    method: "POST",
    cache: "no-store",
  });

  const text = await res.text();

  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
