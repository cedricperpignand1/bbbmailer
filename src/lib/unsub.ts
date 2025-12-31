import crypto from "crypto";

export function makeUnsubToken(contactId: number) {
  const secret = process.env.UNSUB_SECRET || "";
  if (!secret) throw new Error("Missing UNSUB_SECRET");

  const payload = String(contactId);
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyUnsubToken(token: string): number | null {
  const secret = process.env.UNSUB_SECRET || "";
  if (!secret) return null;

  const [idStr, sig] = token.split(".");
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (!sig) return null;

  const expected = crypto.createHmac("sha256", secret).update(String(id)).digest("hex");
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok ? id : null;
}
