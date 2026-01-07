import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron hits this endpoint.
 *
 * Auth:
 * - Preferred: x-vercel-cron header (Vercel sets this automatically)
 * - Fallback: ?key=... compared to process.env.AUTO_CRON_KEY (for local/manual)
 *
 * Behavior:
 * - Calls /api/auto-campaigns/run-today (scheduled mode)
 * - Optional: if AUTO_SEND=1, will also call /api/send/run once when a new campaign is created
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const vercelCronHeader = req.headers.get("x-vercel-cron");
  const key = url.searchParams.get("key") || "";
  const expected = process.env.AUTO_CRON_KEY || "";

  const authorizedByHeader = vercelCronHeader === "1";
  const authorizedByKey = expected && key === expected;

  if (!authorizedByHeader && !authorizedByKey) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint:
          "On Vercel Cron, use x-vercel-cron header (remove ?key=...). For local tests, pass ?key=YOUR_AUTO_CRON_KEY.",
      },
      { status: 401 }
    );
  }

  // Prefer request origin (works on Vercel). Fallback to envs.
  const origin =
    url.origin ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://127.0.0.1:3000";

  // Call run-today WITHOUT force=1 (scheduled mode)
  const runRes = await fetch(`${origin}/api/auto-campaigns/run-today`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const runText = await runRes.text();

  // Try parse JSON (run-today returns JSON)
  let runJson: any = null;
  try {
    runJson = JSON.parse(runText);
  } catch {
    // keep as text
  }

  // OPTIONAL: auto-send immediately when a new campaign is created
  // This will only fire once per day because run-today dedupes by runDateET.
  const autoSend = process.env.AUTO_SEND === "1";
  const autoSendLimit = Math.min(
    Math.max(Number(process.env.AUTO_SEND_LIMIT || 50), 1),
    500
  );

  let sendJson: any = null;

  if (
    autoSend &&
    runRes.ok &&
    runJson &&
    runJson.ok === true &&
    runJson.skipped !== true &&
    runJson.campaignId
  ) {
    const sendRes = await fetch(`${origin}/api/send/run`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: runJson.campaignId, limit: autoSendLimit }),
    });

    const sendText = await sendRes.text();
    try {
      sendJson = JSON.parse(sendText);
    } catch {
      sendJson = { raw: sendText };
    }

    return NextResponse.json(
      {
        ok: true,
        mode: "cron",
        run: runJson,
        autoSend: { enabled: true, limit: autoSendLimit, result: sendJson },
      },
      { status: 200 }
    );
  }

  // Default: just return run-today result
  if (runJson) {
    return NextResponse.json(
      { ok: true, mode: "cron", run: runJson },
      { status: runRes.status }
    );
  }

  // fallback if non-json
  return new NextResponse(runText, {
    status: runRes.status,
    headers: { "Content-Type": "application/json" },
  });
}
