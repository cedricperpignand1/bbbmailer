import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IgApiClient } from "instagram-private-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const cfg = await prisma.igBotConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.igSession) return NextResponse.json({ error: "no session state saved" }, { status: 400 });

  const ig = new IgApiClient();
  ig.state.generateDevice(cfg.username);

  try {
    await ig.state.deserialize(cfg.igSession);
    await ig.challenge.sendSecurityCode(code);

    // Success — save clean session, clear challenge flag
    const session = await ig.state.serialize();
    delete (session as Record<string, unknown>).constants;

    await prisma.igBotConfig.update({
      where: { id: 1 },
      data: { igSession: JSON.stringify(session), challengePending: false },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = String(e);
    console.error("[ig-challenge]", msg);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 400 });
  }
}
