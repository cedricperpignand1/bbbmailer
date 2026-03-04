import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms, defaultFromNumber } from "@/lib/telnyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHONE_RE = /^\+?[1-9]\d{6,14}$/;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && PHONE_RE.test(raw)) return raw;
  return null;
}

function parseAddresses(text: string): string[] {
  return String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const toRaw = String(body?.to || "").trim();
  const to = normalizePhone(toRaw);

  if (!to) {
    return NextResponse.json(
      { error: "Invalid phone number. Use US 10-digit or E.164 (+1...)" },
      { status: 400 }
    );
  }

  const auto = await prisma.autoSmsCampaign.findFirst({ orderBy: { id: "asc" } });
  if (!auto) {
    return NextResponse.json({ error: "No SMS campaign found. Create one first." }, { status: 404 });
  }

  const addresses = parseAddresses(auto.addressesText || "");
  if (addresses.length === 0) {
    return NextResponse.json(
      { error: "Campaign has no addresses. Add addresses and save." },
      { status: 400 }
    );
  }

  const fromPhone = (auto.fromNumber || defaultFromNumber() || "").trim();
  if (!fromPhone) {
    return NextResponse.json(
      { error: "No Telnyx from number configured. Set it in Settings." },
      { status: 400 }
    );
  }

  if (!auto.messageTemplate) {
    return NextResponse.json(
      { error: "Campaign has no message template." },
      { status: 400 }
    );
  }

  const address = addresses[Math.floor(Math.random() * addresses.length)];
  const messageBody = renderTemplate(auto.messageTemplate, { address });

  try {
    const result = await sendSms(to, fromPhone, messageBody);
    return NextResponse.json({
      ok: true,
      to,
      addressUsed: address,
      body: messageBody,
      messageId: result.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e ?? "Send failed") },
      { status: 500 }
    );
  }
}
