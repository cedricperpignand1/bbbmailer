import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaMassGmail } from "@/lib/mass-gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseAddresses(text: string): string[] {
  return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const to = String(body?.to || "").trim();
  const firstName = String(body?.firstName || "there").trim();

  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const campaign = await prisma.massCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  let tmplSubject = campaign.templateSubject;
  let tmplBody = campaign.templateBody;
  let contentType: "text/plain" | "text/html" = "text/plain";

  if (campaign.templateId) {
    const dbTemplate = await prisma.template.findUnique({ where: { id: campaign.templateId } });
    if (!dbTemplate) return NextResponse.json({ error: "Template not found" }, { status: 400 });
    tmplSubject = dbTemplate.subject;
    tmplBody = dbTemplate.html;
    contentType = "text/html";
  }

  if (!tmplSubject && !tmplBody) {
    return NextResponse.json({ error: "No template configured" }, { status: 400 });
  }

  const addresses = parseAddresses(campaign.addressesText);
  if (addresses.length === 0) {
    return NextResponse.json({ error: "No addresses configured" }, { status: 400 });
  }

  const project = pickRandom(addresses);
  const vars = { firstName, project, address: project };
  const subject = renderTemplate(tmplSubject, vars);
  const bodyText = renderTemplate(tmplBody, vars);

  try {
    const result = await sendViaMassGmail({ to, subject, body: bodyText, contentType });
    return NextResponse.json({ ok: true, messageId: result.messageId, subject, projectUsed: project, to });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e || "Gmail send failed") }, { status: 500 });
  }
}
