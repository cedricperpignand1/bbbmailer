import crypto from "crypto";

const ENC_KEY_RAW =
  process.env.CRAIGSLIST_ENC_KEY || "buildersbidbook-cl-default-key!!";

// Derive a 32-byte key using scrypt
function getKey(): Buffer {
  return crypto.scryptSync(ENC_KEY_RAW, "cl-salt-v1", 32);
}

export function encryptPassword(plain: string): string {
  if (!plain) return "";
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptPassword(stored: string): string {
  if (!stored) return "";
  try {
    const [ivHex, encHex] = stored.split(":");
    if (!ivHex || !encHex) return "";
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const enc = Buffer.from(encHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
