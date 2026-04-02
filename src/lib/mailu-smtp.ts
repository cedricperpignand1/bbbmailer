import nodemailer from "nodemailer";

const HOST = process.env.MAILU_SMTP_HOST || "";
const PORT = Number(process.env.MAILU_SMTP_PORT || "587");
const SECURE = process.env.MAILU_SMTP_SECURE === "true";
const USER = process.env.MAILU_SMTP_USER || "";
const PASS = process.env.MAILU_SMTP_PASS || "";
export const FROM_EMAIL = process.env.MAILU_FROM_EMAIL || "";
const FROM_NAME = process.env.MAILU_FROM_NAME || "";

export function isMailuConfigured(): boolean {
  return Boolean(HOST && USER && PASS && FROM_EMAIL);
}

function createTransport() {
  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE,
    auth: { user: USER, pass: PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Returns true when the SMTP error is a permanent (hard) bounce.
 * Permanent = 5xx SMTP response code or well-known "user unknown" phrases.
 */
export function isHardBounce(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  const code = Number(e?.responseCode ?? 0);
  if (code >= 500 && code < 600) return true;
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  return (
    msg.includes("user unknown") ||
    msg.includes("does not exist") ||
    msg.includes("no such user") ||
    msg.includes("mailbox not found") ||
    msg.includes("invalid address") ||
    msg.includes("address rejected") ||
    msg.includes("recipient rejected") ||
    msg.includes("undeliverable")
  );
}

export function getSmtpDebugInfo(): Record<string, string> {
  return {
    MAILU_SMTP_HOST: HOST || "(missing)",
    MAILU_SMTP_PORT: String(PORT),
    MAILU_SMTP_SECURE: String(SECURE),
    MAILU_SMTP_USER: USER || "(missing)",
    MAILU_SMTP_PASS: PASS ? `(set, ${PASS.length} chars)` : "(missing)",
    MAILU_FROM_EMAIL: FROM_EMAIL || "(missing)",
    MAILU_FROM_NAME: FROM_NAME || "(not set)",
  };
}

export async function verifySmtpConnection(): Promise<void> {
  if (!isMailuConfigured()) {
    const missing = ["MAILU_SMTP_HOST", "MAILU_SMTP_USER", "MAILU_SMTP_PASS", "MAILU_FROM_EMAIL"]
      .filter((k) => !process.env[k])
      .join(", ");
    throw new Error(`Mailu SMTP not configured. Missing: ${missing}`);
  }
  const transport = createTransport();
  await transport.verify();
}

export async function sendViaMail(opts: {
  to: string;
  subject: string;
  body: string;
  contentType?: "text/plain" | "text/html";
}): Promise<{ messageId: string | null }> {
  if (!isMailuConfigured()) {
    const missing = ["MAILU_SMTP_HOST", "MAILU_SMTP_USER", "MAILU_SMTP_PASS", "MAILU_FROM_EMAIL"]
      .filter((k) => !process.env[k])
      .join(", ");
    throw new Error(`Mailu SMTP not configured. Missing env vars: ${missing}`);
  }

  const transport = createTransport();
  const from = FROM_NAME ? `"${FROM_NAME}" <${FROM_EMAIL}>` : FROM_EMAIL;
  const isHtml = (opts.contentType ?? "text/plain") === "text/html";

  const info = await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    ...(isHtml ? { html: opts.body } : { text: opts.body }),
  });

  return { messageId: info.messageId ?? null };
}
