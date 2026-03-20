/**
 * POST /api/instagram/run-tick
 * Called every 5 min by Vercel Cron.
 * Likes a small batch of posts, then exits.
 * Fast enough to stay well under Vercel's 60s cron timeout.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IgApiClient, IgCheckpointError } from "instagram-private-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

function nowET() {
  // Returns a Date-like object with hour/minute in Eastern Time (handles DST)
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etStr);
}

function todayStr() {
  const et = nowET();
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
}

function isInWindow(runHourET: number, windowHours: number): boolean {
  const hour = nowET().getHours();
  const end = (runHourET + windowHours) % 24;
  if (end > runHourET) return hour >= runHourET && hour < end;
  return hour >= runHourET || hour < end; // wraps midnight
}

async function getOrCreateSession(
  ig: IgApiClient,
  username: string,
  savedSession: string | null
): Promise<string> {
  ig.state.generateDevice(username);

  if (!savedSession) {
    throw new Error("SESSION_REQUIRED — no session saved. Use 'Import Session' on the Instagram tab.");
  }

  await ig.state.deserialize(savedSession);
  try {
    await ig.account.currentUser(); // verify session still valid
    console.log("[ig-bot] session restored");
  } catch (e) {
    if (e instanceof IgCheckpointError) {
      await ig.challenge.auto(true);
      const state = await ig.state.serialize();
      delete (state as Record<string, unknown>).constants;
      await prisma.igBotConfig.update({
        where: { id: 1 },
        data: { igSession: JSON.stringify(state), challengePending: true },
      });
      throw new Error("CHALLENGE_REQUIRED");
    }
    // Session expired — clear it so the UI shows "Not connected"
    await prisma.igBotConfig.update({
      where: { id: 1 },
      data: { igSession: null },
    });
    throw new Error("SESSION_EXPIRED — re-run 'node scripts/ig-login.mjs' locally and re-import.");
  }
  return savedSession;
}

export async function POST() {
  const cfg = await prisma.igBotConfig.findUnique({ where: { id: 1 } });

  if (!cfg) return NextResponse.json({ skip: "no config" });
  if (!cfg.isActive) return NextResponse.json({ skip: "inactive" });
  if (cfg.isPaused) return NextResponse.json({ skip: "paused" });
  if (!cfg.username || !cfg.igPassword)
    return NextResponse.json({ skip: "no credentials" });

  if (cfg.challengePending)
    return NextResponse.json({ skip: "challenge pending — enter code in the Instagram tab" });

  if (!isInWindow(cfg.runHourET, cfg.runWindowHours)) // runHourET field now stores ET hour
    return NextResponse.json({ skip: "outside window" });

  // Check daily limit
  const today = todayStr();
  const dailyRun = await prisma.igBotDailyRun.findUnique({
    where: { configId_dateStr: { configId: 1, dateStr: today } },
  });
  const likedToday = dailyRun?.likedCount ?? 0;
  const dailyLimit = cfg.likesPerDayMax;

  if (likedToday >= dailyLimit) {
    await prisma.igBotRun.create({
      data: { liked: 0, skipped: 0, note: `daily limit ${dailyLimit} reached` },
    });
    return NextResponse.json({ skip: "daily limit reached", likedToday });
  }

  // How many likes are left for today
  const remaining = dailyLimit - likedToday;
  const wantToLike = Math.min(cfg.likesPerTick, remaining);

  // Instagram client
  const ig = new IgApiClient();
  let liked = 0;
  let skipped = 0;
  let note = "";

  try {
    const session = await getOrCreateSession(
      ig,
      cfg.username,
      cfg.igSession
    );

    // Save session back if it changed
    if (session !== cfg.igSession) {
      await prisma.igBotConfig.update({
        where: { id: 1 },
        data: { igSession: session },
      });
    }

    // Pick feed source
    let mediaItems: Array<{ id: string; has_liked: boolean; feed_position?: number }> = [];

    if (cfg.target === "timeline") {
      const feed = ig.feed.timeline();
      mediaItems = await feed.items() as typeof mediaItems;
    } else {
      // followers or following: pick a random user and get their recent posts
      const myId = (await ig.account.currentUser()).pk;
      let users: Array<{ pk: number }> = [];
      if (cfg.target === "followers") {
        users = await ig.feed.accountFollowers(myId).items() as typeof users;
      } else {
        users = await ig.feed.accountFollowing(myId).items() as typeof users;
      }
      if (users.length > 0) {
        const pick = users[Math.floor(Math.random() * Math.min(users.length, 20))] as { pk: number };
        const userFeed = ig.feed.user(String(pick.pk));
        const posts = await userFeed.items() as typeof mediaItems;
        mediaItems = posts;
      }
    }

    // Like up to wantToLike posts
    for (const item of mediaItems) {
      if (liked >= wantToLike) break;
      if (item.has_liked) { skipped++; continue; }
      try {
        await ig.media.like({
          mediaId: item.id,
          moduleInfo: { module_name: "feed_timeline", feed_position: liked },
          d: 1,
        });
        liked++;
        // small natural pause between likes
        await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2500));
      } catch (e) {
        console.error("[ig-bot] like failed:", e);
        skipped++;
      }
    }

    // Refresh + save session after work
    const finalSession = await ig.state.serialize();
    delete (finalSession as Record<string, unknown>).constants;
    await prisma.igBotConfig.update({
      where: { id: 1 },
      data: { igSession: JSON.stringify(finalSession) },
    });
  } catch (e) {
    note = String(e).slice(0, 200);
    console.error("[ig-bot] tick error:", e);
  }

  // Persist run + daily stats
  await Promise.all([
    prisma.igBotRun.create({ data: { liked, skipped, note } }),
    liked > 0
      ? prisma.igBotDailyRun.upsert({
          where: { configId_dateStr: { configId: 1, dateStr: today } },
          create: { configId: 1, dateStr: today, likedCount: liked },
          update: { likedCount: { increment: liked } },
        })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ liked, skipped, likedToday: likedToday + liked, note });
}

// Allow Vercel cron (GET) as well
export async function GET() {
  return POST();
}
