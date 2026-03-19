import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get("targetId");
  const search = searchParams.get("search")?.trim() || "";

  try {
    const posts = await prisma.instagramPost.findMany({
      where: {
        ...(targetId ? { targetId: parseInt(targetId) } : {}),
        ...(search
          ? {
              OR: [
                { postId: { contains: search, mode: "insensitive" } },
                { postUrl: { contains: search, mode: "insensitive" } },
                { target: { username: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        target: { select: { username: true, audienceType: true } },
        _count: {
          select: {
            tasks: {
              where: { status: { in: ["COMPLETED", "ALREADY_LIKED"] } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ posts });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostImportRow = {
  username: string;
  audienceType?: string;
  postId: string;
  postUrl: string;
  thumbnailUrl?: string;
  caption?: string;
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // Support single row or bulk array
  const rows: PostImportRow[] = Array.isArray(body.posts)
    ? body.posts
    : [body];

  if (!rows.length) return NextResponse.json({ error: "No posts provided" }, { status: 400 });

  const created: number[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const username = String(row.username || "").trim().replace(/^@/, "").toLowerCase();
    const audienceType = row.audienceType === "FOLLOWING" ? "FOLLOWING" : "FOLLOWER";
    const postId = String(row.postId || "").trim();
    const postUrl = String(row.postUrl || "").trim();

    if (!username || !postId || !postUrl) {
      errors.push(`Missing fields for post: ${postId || "(no id)"}`);
      continue;
    }

    try {
      // Upsert target
      const target = await prisma.instagramTarget.upsert({
        where: { username_audienceType: { username, audienceType } },
        update: {},
        create: { username, audienceType },
      });

      // Upsert post — deduplicate by postId
      const existing = await prisma.instagramPost.findUnique({ where: { postId } });
      if (existing) {
        skipped.push(postId);
        continue;
      }

      const post = await prisma.instagramPost.create({
        data: {
          targetId: target.id,
          postId,
          postUrl,
          thumbnailUrl: row.thumbnailUrl?.trim() || null,
          caption: row.caption?.trim() || null,
        },
      });
      created.push(post.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.toLowerCase().includes("unique")) {
        skipped.push(postId);
      } else {
        errors.push(`${postId}: ${msg}`);
      }
    }
  }

  return NextResponse.json({
    created: created.length,
    skipped: skipped.length,
    errors,
  });
}
