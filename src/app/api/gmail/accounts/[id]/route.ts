import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/gmail/accounts/[id] — update label, usedForMass, maxPerDay, warmup settings */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const account = await prisma.gmailAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const {
    label,
    usedForMass,
    maxPerDay,
    warmupEnabled,
    warmupSchedule,
    warmupStartDate,
    resetWarmup,
  } = body;

  // Build update payload
  const data: Record<string, unknown> = {};

  if (typeof label === "string") data.label = label.trim().slice(0, 80);
  if (typeof usedForMass === "boolean") data.usedForMass = usedForMass;
  if (typeof maxPerDay === "number") {
    data.maxPerDay = Math.min(Math.max(Math.trunc(maxPerDay), 1), 2000);
  }
  if (typeof warmupEnabled === "boolean") {
    data.warmupEnabled = warmupEnabled;
    // Auto-set start date when enabling warmup if not already set
    if (warmupEnabled && !account.warmupStartDate) {
      data.warmupStartDate = new Date();
    }
    // Clear start date when disabling warmup
    if (!warmupEnabled) {
      data.warmupStartDate = null;
    }
  }
  if (typeof warmupSchedule === "string") {
    // Validate: must be comma-separated positive integers
    const nums = warmupSchedule.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
    if (nums.length === 0) {
      return NextResponse.json({ error: "warmupSchedule must contain at least one positive number" }, { status: 400 });
    }
    data.warmupSchedule = nums.join(",");
  }
  // Allow explicitly setting warmupStartDate (e.g. to back-date)
  if (warmupStartDate !== undefined) {
    data.warmupStartDate = warmupStartDate ? new Date(warmupStartDate) : null;
  }
  // Reset warmup to today
  if (resetWarmup === true) {
    data.warmupEnabled = true;
    data.warmupStartDate = new Date();
  }

  const updated = await prisma.gmailAccount.update({ where: { id }, data });

  return NextResponse.json({ ok: true, account: updated });
}

/** DELETE /api/gmail/accounts/[id] — disconnect (clear token) or fully remove */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";

  if (hard) {
    // Hard delete — removes all related mass campaign sends too (cascade needed)
    // For safety, just clear the token and mark inactive
    await prisma.gmailAccount.update({
      where: { id },
      data: { refreshToken: "", usedForMass: false },
    });
  } else {
    // Soft disconnect — clear token, keep row + history
    await prisma.gmailAccount.update({
      where: { id },
      data: { refreshToken: "", usedForMass: false },
    });
  }

  return NextResponse.json({ ok: true });
}
