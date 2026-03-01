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

function renderTemplate(template: string, vars: Record<string, string>): string {
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
  const firstNameOverride = body?.firstName ? String(body.firstName).trim() : null;

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const campaign = await prisma.autoCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Resolve template: DB template takes priority over inline fields
  let tmplSubject = campaign.templateSubject;
  let tmplBody = campaign.templateBody;
  let contentType: "text/plain" | "text/html" = "text/plain";

  if (campaign.templateId) {
    const dbTemplate = await prisma.template.findUnique({
      where: { id: campaign.templateId },
    });
    if (!dbTemplate) {
      return NextResponse.json(
        { error: `Template #${campaign.templateId} not found. Re-select a template and save.` },
        { status: 400 }
      );
    }
    tmplSubject = dbTemplate.subject;
    tmplBody = dbTemplate.html;
    contentType = "text/html";
  }

  if (!tmplSubject && !tmplBody) {
    return NextResponse.json(
      { error: "Campaign has no template. Select a template (or add inline Subject/Body) and save." },
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

  const vars = { firstName, project, address: project };
  const subject = renderTemplate(tmplSubject, vars);
  const emailBody = renderTemplate(tmplBody, vars);

  const result = await sendViaGmail({ to, subject, body: emailBody, contentType });

  return NextResponse.json({
    ok: true,
    to,
    projectUsed: project,
    subject,
    messageId: result.messageId,
  });
}
