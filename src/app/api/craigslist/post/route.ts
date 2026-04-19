import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/craigslist/post
 *
 * This endpoint does NOT run Playwright (Vercel can't run a browser).
 * Browser automation runs via the local script: node scripts/cl-post.js
 *
 * The local script calls this endpoint with action="mark-posted" after
 * it finishes posting, so the live app stays in sync.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  // ── action: mark-posted (called by local script after Playwright run) ──────
  if (action === "mark-posted") {
    const { addressId, title, postBody, city, category, success, error } =
      body as Record<string, unknown>;

    if (!addressId) {
      return NextResponse.json({ error: "addressId required" }, { status: 400 });
    }

    const address = await prisma.craigslistAddress.findUnique({
      where: { id: Number(addressId) },
    });
    if (!address) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    if (success) {
      await prisma.craigslistAddress.update({
        where: { id: Number(addressId) },
        data: { status: "used" },
      });
    }

    await prisma.craigslistPostLog.create({
      data: {
        address: address.address,
        generatedTitle: String(title || ""),
        generatedBody: String(postBody || ""),
        city: String(city || ""),
        category: String(category || ""),
        status: success ? "posted" : "failed",
        error: error ? String(error) : null,
      },
    });

    return NextResponse.json({
      ok: true,
      addressMarkedUsed: !!success,
    });
  }

  // ── Fallback: Playwright must run locally, not on Vercel ──────────────────
  return NextResponse.json(
    {
      error:
        "Browser automation cannot run on Vercel. Run the local script instead: node scripts/cl-post.js",
      localScript: true,
    },
    { status: 400 }
  );
}
