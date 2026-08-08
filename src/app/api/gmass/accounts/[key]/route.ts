import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/gmass/accounts/[key] — update apiKey, fromEmail/fromName, label, active, warmup settings */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (key !== "gmass1" && key !== "gmass2") {
    return NextResponse.json({ error: "Invalid account key" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const account = await prisma.gmassAccount.upsert({
    where: { key },
    update: {},
    create: { key },
  });

  const {
    apiKey,
    fromEmail,
    fromName,
    label,
    active,
    maxPerDay,
    warmupEnabled,
    warmupSchedule,
    warmupStartDate,
    resetWarmup,
  } = body;

  const data: Record<string, unknown> = {};

  if (typeof apiKey === "string" && apiKey.trim()) data.apiKey = apiKey.trim();
  if (typeof fromEmail === "string") data.fromEmail = fromEmail.trim().slice(0, 200);
  if (typeof fromName === "string") data.fromName = fromName.trim().slice(0, 100);
  if (typeof label === "string") data.label = label.trim().slice(0, 80);
  if (typeof active === "boolean") data.active = active;
  if (typeof maxPerDay === "number") {
    data.maxPerDay = Math.min(Math.max(Math.trunc(maxPerDay), 1), 2000);
  }
  if (typeof warmupEnabled === "boolean") {
    data.warmupEnabled = warmupEnabled;
    if (warmupEnabled && !account.warmupStartDate) {
      data.warmupStartDate = new Date();
    }
    if (!warmupEnabled) {
      data.warmupStartDate = null;
    }
  }
  if (typeof warmupSchedule === "string") {
    const nums = warmupSchedule.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
    if (nums.length === 0) {
      return NextResponse.json({ error: "warmupSchedule must contain at least one positive number" }, { status: 400 });
    }
    data.warmupSchedule = nums.join(",");
  }
  if (warmupStartDate !== undefined) {
    data.warmupStartDate = warmupStartDate ? new Date(warmupStartDate) : null;
  }
  if (resetWarmup === true) {
    data.warmupEnabled = true;
    data.warmupStartDate = new Date();
  }

  const updated = await prisma.gmassAccount.update({ where: { key }, data });

  return NextResponse.json({
    ok: true,
    account: { ...updated, apiKey: undefined, apiKeyMasked: updated.apiKey ? `••••${updated.apiKey.slice(-4)}` : "" },
  });
}
