import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IgApiClient, IgCheckpointError, IgLoginBadPasswordError, IgLoginTwoFactorRequiredError } from "instagram-private-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const cfg = await prisma.igBotConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.username || !cfg?.igPassword) {
    return NextResponse.json({ ok: false, error: "No credentials saved." });
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(cfg.username.trim());

  try {
    await ig.simulate.preLoginFlow();
    await ig.account.login(cfg.username.trim(), cfg.igPassword.trim());
    await ig.simulate.postLoginFlow();
    const user = await ig.account.currentUser();

    // Save the fresh session
    const serialized = await ig.state.serialize();
    delete (serialized as Record<string, unknown>).constants;
    await prisma.igBotConfig.update({
      where: { id: 1 },
      data: { igSession: JSON.stringify(serialized), challengePending: false },
    });

    return NextResponse.json({
      ok: true,
      message: `Logged in as @${user.username} (${user.full_name}). Session saved — bot is ready.`,
    });
  } catch (e) {
    if (e instanceof IgCheckpointError) {
      try { await ig.challenge.auto(true); } catch { /* ignore */ }
      const state = await ig.state.serialize();
      delete (state as Record<string, unknown>).constants;
      await prisma.igBotConfig.update({
        where: { id: 1 },
        data: { igSession: JSON.stringify(state), challengePending: true },
      });
      return NextResponse.json({
        ok: false,
        error: "CHALLENGE_REQUIRED — Instagram sent a verification code to your email/phone. Enter it in the banner above.",
      });
    }
    if (e instanceof IgLoginBadPasswordError) {
      return NextResponse.json({
        ok: false,
        error: "BAD_PASSWORD — Instagram rejected the login. If your password is correct, try logging out of all Instagram sessions at instagram.com, wait a few minutes, then retry.",
      });
    }
    if (e instanceof IgLoginTwoFactorRequiredError) {
      return NextResponse.json({
        ok: false,
        error: "TWO_FACTOR — 2FA is enabled on this account. Disable it temporarily to use the bot.",
      });
    }
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) });
  }
}
