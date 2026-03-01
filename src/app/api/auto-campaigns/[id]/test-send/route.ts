import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAddresses(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
    out = out.replace(re, v);
  }
  return out;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const to = String(body?.to || "").trim();
  const firstNameOverride = body?.firstName
    ? String(body.firstName).trim()
    : null;

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 }
    );
  }

  const campaign = await prisma.autoCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!campaign.templateSubject && !campaign.templateBody) {
    return NextResponse.json(
      {
        error:
          "Campaign has no template. Add a Subject and Body in the campaign settings and save.",
      },
      { status: 400 }
    );
  }

  const addresses = parseAddresses(campaign.addressesText);
  if (addresses.length === 0) {
    return NextResponse.json(
      { error: "Campaign has no property addresses. Add addresses and save." },
      { status: 400 }
    );
  }

  const project = pickRandom(addresses);
  const firstName = firstNameOverride || "there";

  const subject = renderTemplate(campaign.templateSubject, {
    firstName,
    project,
  });
  const bodyText = renderTemplate(campaign.templateBody, {
    firstName,
    project,
  });

  const result = await sendViaGmail({ to, subject, bodyText });

  return NextResponse.json({
    ok: true,
    to,
    projectUsed: project,
    subject,
    messageId: result.messageId,
  });
}
