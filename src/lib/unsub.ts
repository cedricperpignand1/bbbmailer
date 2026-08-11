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

/** Unsubscribe footer to append to an outgoing email body — click marks the contact unsubscribed. */
export function unsubscribeFooter(contactId: number, contentType: "text/plain" | "text/html"): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const token = makeUnsubToken(contactId);
  const unsubUrl = `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;

  if (contentType === "text/html") {
    return `
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#777;line-height:1.4;">
  <div>You're receiving this because you're on our contractor list.</div>
  <div style="margin-top:8px;">
    <a href="${unsubUrl}" style="color:#555;text-decoration:underline;font-size:16px;font-weight:bold;">Unsubscribe</a>
  </div>
</div>`;
  }

  return `\n\n---\nDon't want these emails? Unsubscribe: ${unsubUrl}`;
}
