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

  // preLoginFlow can fail on restricted IPs — wrap it so it never blocks the login attempt
  try { await ig.simulate.preLoginFlow(); } catch { /* ignore */ }

  try {
    await ig.account.login(cfg.username.trim(), cfg.igPassword.trim());
  } catch (e) {
    // Instagram sometimes returns IgCheckpointError as a disguised bad-password or block
    if (e instanceof IgCheckpointError || e instanceof IgLoginBadPasswordError) {
      // Try to trigger the challenge flow — this works when IG is actually blocking, not wrong password
      try { await ig.challenge.auto(true); } catch { /* ignore */ }
      const state = await ig.state.serialize();
      delete (state as Record<string, unknown>).constants;
      await prisma.igBotConfig.update({
        where: { id: 1 },
        data: { igSession: JSON.stringify(state), challengePending: true },
      });
      const isCheckpoint = e instanceof IgCheckpointError;
      return NextResponse.json({
        ok: false,
        error: isCheckpoint
          ? "CHALLENGE_REQUIRED — Instagram sent a verification code to your email/phone. Enter it in the banner above."
          : "BLOCKED — Instagram blocked the login (your password is likely correct). A verification code may have been sent to your email/phone — check above. Otherwise, log into instagram.com first to unblock, then retry.",
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

  try { await ig.simulate.postLoginFlow(); } catch { /* ignore */ }

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
}
