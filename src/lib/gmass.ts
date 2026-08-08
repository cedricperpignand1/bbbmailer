import { prisma } from "./prisma";
import type { GmassAccount } from "@prisma/client";

const GMASS_API_BASE = "https://api.gmass.co/api";
const ACCOUNT_KEYS = ["gmass1", "gmass2"] as const;

export type SendOpts = {
  to: string;
  subject: string;
  body: string;
  contentType?: "text/plain" | "text/html";
};

export type SendResult = {
  messageId: string | null;
};

/** Ensures the gmass1/gmass2 rows exist, then returns both. */
export async function getGmassAccounts(): Promise<GmassAccount[]> {
  await Promise.all(
    ACCOUNT_KEYS.map((key) =>
      prisma.gmassAccount.upsert({
        where: { key },
        update: {},
        create: { key },
      })
    )
  );
  return prisma.gmassAccount.findMany({ orderBy: { key: "asc" } });
}

/** Returns the effective daily limit for a GMass account based on its warmup schedule. */
export function getAccountDailyLimit(account: {
  maxPerDay: number;
  warmupEnabled: boolean;
  warmupStartDate: Date | null;
  warmupSchedule: string;
}): { limit: number; warmupDay: number } {
  if (!account.warmupEnabled || !account.warmupStartDate) {
    return { limit: account.maxPerDay, warmupDay: 0 };
  }

  const schedule = account.warmupSchedule
    .split(",")
    .map(Number)
    .filter((n) => n > 0);

  const msSinceStart = Date.now() - account.warmupStartDate.getTime();
  const warmupDay = Math.floor(msSinceStart / (1000 * 60 * 60 * 24)) + 1;
  const limit =
    warmupDay <= schedule.length ? schedule[warmupDay - 1] : account.maxPerDay;

  return { limit, warmupDay };
}

export async function sendViaGmassAccount(
  account: Pick<GmassAccount, "apiKey" | "fromEmail" | "fromName">,
  opts: SendOpts
): Promise<SendResult> {
  if (!account.apiKey) {
    throw new Error("GMass account has no API key configured.");
  }
  if (!account.fromEmail) {
    throw new Error("GMass account has no from-email configured.");
  }

  const res = await fetch(`${GMASS_API_BASE}/transactional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-apikey": account.apiKey,
    },
    body: JSON.stringify({
      fromEmail: account.fromEmail,
      fromName: account.fromName || undefined,
      to: opts.to,
      subject: opts.subject,
      message: opts.body,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GMass send failed (${res.status}): ${text.slice(0, 500)}`);
  }

  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(text);
    messageId = parsed?.messageId ?? parsed?.id ?? null;
  } catch {
    // non-JSON response body — ignore, just no messageId to record
  }

  return { messageId };
}
