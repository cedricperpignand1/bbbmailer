/**
 * Local Instagram bot tick — runs from your machine (residential IP).
 * Reads config from DB, likes posts, saves results back.
 *
 * Schedule this with Windows Task Scheduler every 5 minutes.
 *
 * Usage: node scripts/ig-tick.mjs
 * Force run (ignore time window): node scripts/ig-tick.mjs --force
 */
import { PrismaClient } from "@prisma/client";
import { IgApiClient } from "instagram-private-api";

const prisma = new PrismaClient();
const force = process.argv.includes("--force");

function nowET() {
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etStr);
}

function todayStr() {
  const et = nowET();
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
}

function isInWindow(runHourET, windowHours) {
  const hour = nowET().getHours();
  const end = (runHourET + windowHours) % 24;
  if (end > runHourET) return hour >= runHourET && hour < end;
  return hour >= runHourET || hour < end;
}

async function main() {
  const cfg = await prisma.igBotConfig.findUnique({ where: { id: 1 } });

  if (!cfg) { console.log("skip: no config"); return; }
  if (!cfg.isActive) { console.log("skip: inactive"); return; }
  if (cfg.isPaused) { console.log("skip: paused"); return; }
  if (!cfg.username || !cfg.igSession) { console.log("skip: no session — run ig-login.mjs first"); return; }
  if (cfg.challengePending) { console.log("skip: challenge pending"); return; }

  if (!force && !isInWindow(cfg.runHourET, cfg.runWindowHours)) {
    const et = nowET();
    console.log(`skip: outside window (now ${et.getHours()}:${String(et.getMinutes()).padStart(2,"0")} ET, window starts at ${cfg.runHourET}:00)`);
    return;
  }

  // Check daily limit
  const today = todayStr();
  const dailyRun = await prisma.igBotDailyRun.findUnique({
    where: { configId_dateStr: { configId: 1, dateStr: today } },
  });
  const likedToday = dailyRun?.likedCount ?? 0;

  if (likedToday >= cfg.likesPerDayMax) {
    console.log(`skip: daily limit ${cfg.likesPerDayMax} reached (${likedToday} liked today)`);
    return;
  }

  const remaining = cfg.likesPerDayMax - likedToday;
  const wantToLike = Math.min(cfg.likesPerTick, remaining);

  console.log(`[ig-bot] starting tick — want ${wantToLike} likes (${likedToday}/${cfg.likesPerDayMax} today)`);

  const ig = new IgApiClient();
  ig.state.generateDevice(cfg.username);
  await ig.state.deserialize(cfg.igSession);

  let liked = 0;
  let skipped = 0;
  let note = "";

  try {
    let mediaItems = [];

    if (cfg.target === "timeline") {
      mediaItems = await ig.feed.timeline().items();
    } else {
      try {
        const myId = ig.state.cookieUserId;
        let users = [];
        if (cfg.target === "followers") {
          users = await ig.feed.accountFollowers(myId).items();
        } else {
          users = await ig.feed.accountFollowing(myId).items();
        }
        if (users.length > 0) {
          const pick = users[Math.floor(Math.random() * Math.min(users.length, 20))];
          mediaItems = await ig.feed.user(String(pick.pk)).items();
        }
      } catch {
        console.log("[ig-bot] followers/following failed, falling back to timeline");
        mediaItems = await ig.feed.timeline().items();
      }
    }

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
        console.log(`  liked ${item.id} (${liked}/${wantToLike})`);
        await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2500));
      } catch (e) {
        console.error(`  like failed: ${e.message}`);
        skipped++;
      }
    }

    // Save refreshed session
    const finalSession = await ig.state.serialize();
    delete finalSession.constants;
    await prisma.igBotConfig.update({
      where: { id: 1 },
      data: { igSession: JSON.stringify(finalSession) },
    });
  } catch (e) {
    note = String(e).slice(0, 200);
    console.error("[ig-bot] error:", e.message);
  }

  // Save run record + daily stats
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

  console.log(`[ig-bot] done — liked: ${liked}, skipped: ${skipped}, total today: ${likedToday + liked}/${cfg.likesPerDayMax}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
