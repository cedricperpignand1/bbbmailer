import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const [config, runs, dailyRun] = await Promise.all([
    prisma.igBotConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    }),
    prisma.igBotRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    }),
    prisma.igBotDailyRun.findUnique({
      where: { configId_dateStr: { configId: 1, dateStr: todayStr() } },
    }),
  ]);

  // strip password from response
  const { igPassword: _, igSession: __, ...safeConfig } = config;
  const hasCredentials = !!config.username && !!config.igPassword;
  const hasSession = !!config.igSession && !config.challengePending;
  const totalLikes = runs.reduce((s, r) => s + r.liked, 0);

  return NextResponse.json({
    config: { ...safeConfig, hasCredentials, hasSession },
    runs,
    dailyRun,
    totalLikes,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "toggle-active") {
    const cfg = await prisma.igBotConfig.upsert({
      where: { id: 1 },
      create: { id: 1, isActive: body.value },
      update: { isActive: body.value },
    });
    const { igPassword: _, igSession: __, ...safe } = cfg;
    return NextResponse.json(safe);
  }

  if (body.action === "toggle-paused") {
    const cfg = await prisma.igBotConfig.upsert({
      where: { id: 1 },
      create: { id: 1, isPaused: body.value },
      update: { isPaused: body.value },
    });
    const { igPassword: _, igSession: __, ...safe } = cfg;
    return NextResponse.json(safe);
  }

  if (body.action === "import-session") {
    if (!body.session) return NextResponse.json({ error: "session required" }, { status: 400 });
    // Validate it's parseable JSON with expected shape
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.session);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!parsed.cookies && !parsed.authorization_token) {
      return NextResponse.json({ error: "Session JSON looks invalid (missing cookies/token)" }, { status: 400 });
    }
    const cfg = await prisma.igBotConfig.upsert({
      where: { id: 1 },
      create: { id: 1, igSession: body.session, challengePending: false },
      update: { igSession: body.session, challengePending: false },
    });
    const { igPassword: _, igSession: __, ...safe } = cfg;
    return NextResponse.json({ ...safe, hasSession: true });
  }

  if (body.action === "disconnect") {
    const cfg = await prisma.igBotConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { igSession: null, isActive: false },
    });
    const { igPassword: _, igSession: __, ...safe } = cfg;
    return NextResponse.json(safe);
  }

  // save full config (includes credentials)
  const data = {
    username: body.username ?? "",
    ...(body.igPassword ? { igPassword: body.igPassword } : {}),
    target: body.target ?? "timeline",
    likesPerDayMin: Number(body.likesPerDayMin) || 20,
    likesPerDayMax: Number(body.likesPerDayMax) || 40,
    likesPerTick: Math.max(1, Math.min(5, Number(body.likesPerTick) || 2)),
    runHourET: Number(body.runHourET) ?? 14,
    runWindowHours: Math.max(1, Math.min(12, Number(body.runWindowHours) || 3)),
  };

  const cfg = await prisma.igBotConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  const { igPassword: _, igSession: __, ...safe } = cfg;
  return NextResponse.json(safe);
}
