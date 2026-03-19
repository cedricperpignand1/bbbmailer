import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "HH:MM" into { hour, minute } */
function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(":").map(Number);
  return { hour: isNaN(h) ? 9 : h, minute: isNaN(m) ? 0 : m };
}

/** Distribute N tasks evenly between startTime and endTime today */
function distributeSlots(
  count: number,
  startTime: string,
  endTime: string,
  dateStr: string
): Date[] {
  if (count === 0) return [];
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = parseTime(startTime);
  const end = parseTime(endTime);

  const startMs =
    new Date(year, month - 1, day, start.hour, start.minute).getTime();
  const endMs =
    new Date(year, month - 1, day, end.hour, end.minute).getTime();

  const span = endMs - startMs;
  return Array.from({ length: count }, (_, i) => {
    const fraction = count === 1 ? 0.5 : i / (count - 1);
    return new Date(startMs + fraction * span);
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const forceRegenerate = body.force === true;

  const today = todayStr();

  try {
    // Get settings
    const settings = await prisma.instagramWorkspaceSettings.findFirst({
      orderBy: { id: "asc" },
    });
    const dailyGoal = settings?.dailyGoal ?? 50;
    const startTime = settings?.startTime ?? "09:00";
    const endTime = settings?.endTime ?? "17:00";
    const includeFollowers = settings?.includeFollowers ?? true;
    const includeFollowing = settings?.includeFollowing ?? true;

    // Get or create today's plan
    let plan = await prisma.dailyEngagementPlan.findUnique({ where: { date: today } });

    if (plan && !forceRegenerate) {
      // Already exists — just return it with tasks
      const full = await prisma.dailyEngagementPlan.findUnique({
        where: { id: plan.id },
        include: {
          tasks: {
            include: { target: true, post: true },
            orderBy: { scheduledAt: "asc" },
          },
        },
      });
      return NextResponse.json({ plan: full, generated: 0, message: "Plan already exists" });
    }

    if (!plan) {
      plan = await prisma.dailyEngagementPlan.create({
        data: { date: today, dailyGoal, startTime, endTime },
      });
    } else {
      // Force regenerate — update header fields
      await prisma.dailyEngagementPlan.update({
        where: { id: plan.id },
        data: { dailyGoal, startTime, endTime },
      });
    }

    // Find active audience types to include
    const audienceFilter: ("FOLLOWER" | "FOLLOWING")[] = [];
    if (includeFollowers) audienceFilter.push("FOLLOWER");
    if (includeFollowing) audienceFilter.push("FOLLOWING");

    if (audienceFilter.length === 0) {
      return NextResponse.json({ plan, generated: 0, message: "No audience types enabled" });
    }

    // Find how many tasks already exist in this plan (for force-regen, skip re-adding)
    const alreadyInPlan = await prisma.engagementTask.findMany({
      where: { planId: plan.id },
      select: { postIgId: true },
    });
    const alreadyInPlanIds = new Set(alreadyInPlan.map((t) => t.postIgId));
    const needed = dailyGoal - alreadyInPlan.length;

    if (needed <= 0) {
      const full = await prisma.dailyEngagementPlan.findUnique({
        where: { id: plan.id },
        include: {
          tasks: {
            include: { target: true, post: true },
            orderBy: { scheduledAt: "asc" },
          },
        },
      });
      return NextResponse.json({ plan: full, generated: 0, message: "Goal already met" });
    }

    // Find eligible posts:
    // 1. Target is active and in included audience types
    // 2. Post has no COMPLETED or ALREADY_LIKED task (across all time)
    // 3. Post is not already in today's plan
    const eligiblePosts = await prisma.instagramPost.findMany({
      where: {
        target: {
          isActive: true,
          audienceType: { in: audienceFilter },
        },
        id: { notIn: Array.from(alreadyInPlanIds) },
        tasks: {
          none: {
            status: { in: ["COMPLETED", "ALREADY_LIKED"] },
          },
        },
      },
      include: { target: true },
      orderBy: { createdAt: "asc" },
      take: needed,
    });

    if (eligiblePosts.length === 0) {
      const full = await prisma.dailyEngagementPlan.findUnique({
        where: { id: plan.id },
        include: {
          tasks: {
            include: { target: true, post: true },
            orderBy: { scheduledAt: "asc" },
          },
        },
      });
      return NextResponse.json({
        plan: full,
        generated: 0,
        message: "No eligible posts found",
      });
    }

    // Distribute time slots
    const slots = distributeSlots(eligiblePosts.length, startTime, endTime, today);

    // Create tasks
    const taskData = eligiblePosts.map((post, i) => ({
      planId: plan!.id,
      targetId: post.targetId,
      postIgId: post.id,
      scheduledAt: slots[i],
      status: "PENDING" as const,
    }));

    await prisma.engagementTask.createMany({
      data: taskData,
      skipDuplicates: true,
    });

    // Recompute plan totals
    const counts = await prisma.engagementTask.groupBy({
      by: ["status"],
      where: { planId: plan.id },
      _count: true,
    });
    const totalGenerated = counts.reduce((s, c) => s + c._count, 0);
    const totalCompleted =
      counts.find((c) => c.status === "COMPLETED")?._count ?? 0;
    const totalSkipped =
      counts.find((c) => c.status === "SKIPPED")?._count ?? 0;
    const totalAlreadyLiked =
      counts.find((c) => c.status === "ALREADY_LIKED")?._count ?? 0;

    await prisma.dailyEngagementPlan.update({
      where: { id: plan.id },
      data: { totalGenerated, totalCompleted, totalSkipped, totalAlreadyLiked },
    });

    // Log
    await prisma.engagementLog.create({
      data: {
        action: "PLAN_GENERATED",
        details: `Generated ${eligiblePosts.length} tasks for ${today}`,
      },
    });

    const full = await prisma.dailyEngagementPlan.findUnique({
      where: { id: plan.id },
      include: {
        tasks: {
          include: { target: true, post: true },
          orderBy: { scheduledAt: "asc" },
        },
      },
    });

    return NextResponse.json({
      plan: full,
      generated: eligiblePosts.length,
      message: `Generated ${eligiblePosts.length} tasks`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
