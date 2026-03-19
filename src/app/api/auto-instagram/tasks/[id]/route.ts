import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "ALREADY_LIKED";
const VALID_STATUSES: TaskStatus[] = ["PENDING", "COMPLETED", "SKIPPED", "ALREADY_LIKED"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = parseInt(id);
  if (isNaN(taskId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const status = body.status as TaskStatus;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const task = await prisma.engagementTask.update({
      where: { id: taskId },
      data: {
        status,
        notes: body.notes !== undefined ? String(body.notes).trim() || null : undefined,
      },
      include: { target: true, post: true },
    });

    // Recompute plan totals
    const counts = await prisma.engagementTask.groupBy({
      by: ["status"],
      where: { planId: task.planId },
      _count: true,
    });
    const totalGenerated = counts.reduce((s, c) => s + c._count, 0);
    const totalCompleted = counts.find((c) => c.status === "COMPLETED")?._count ?? 0;
    const totalSkipped = counts.find((c) => c.status === "SKIPPED")?._count ?? 0;
    const totalAlreadyLiked = counts.find((c) => c.status === "ALREADY_LIKED")?._count ?? 0;

    await prisma.dailyEngagementPlan.update({
      where: { id: task.planId },
      data: { totalGenerated, totalCompleted, totalSkipped, totalAlreadyLiked },
    });

    // Write log
    await prisma.engagementLog.create({
      data: {
        taskId: task.id,
        targetId: task.targetId,
        postIgId: task.postIgId,
        action: `STATUS_CHANGED_TO_${status}`,
        details: body.notes ? String(body.notes).trim() : null,
      },
    });

    return NextResponse.json({ task });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
