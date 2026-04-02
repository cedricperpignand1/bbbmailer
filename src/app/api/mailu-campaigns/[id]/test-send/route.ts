import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaMail, getSmtpDebugInfo, verifySmtpConnection } from "@/lib/mailu-smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseAddresses(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const steps: string[] = [];

  try {
    // Step 1 — params
    steps.push("step1: parsing params");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: "Invalid id", steps }, { status: 400 });
    steps.push(`step1: id=${id}`);

    // Step 2 — body
    steps.push("step2: parsing request body");
    const body = await req.json().catch(() => null);
    const to = String(body?.to || "").trim();
    const firstName = String(body?.firstName || "there").trim();
    steps.push(`step2: to="${to}" firstName="${firstName}"`);

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Valid email required", steps }, { status: 400 });
    }

    // Step 3 — env vars
    steps.push("step3: checking SMTP env vars");
    const smtpInfo = getSmtpDebugInfo();
    steps.push(`step3: ${JSON.stringify(smtpInfo)}`);

    // Step 4 — DB lookup
    steps.push("step4: loading campaign from DB");
    const campaign = await prisma.mailuCampaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found", steps }, { status: 404 });
    steps.push(`step4: campaign="${campaign.name}" templateId=${campaign.templateId ?? "null"}`);

    // Step 5 — template resolution
    steps.push("step5: resolving template");
    let tmplSubject = campaign.templateSubject;
    let tmplBody = campaign.templateBody;
    let contentType: "text/plain" | "text/html" = "text/plain";

    if (campaign.templateId) {
      const dbTemplate = await prisma.template.findUnique({ where: { id: campaign.templateId } });
      if (!dbTemplate)
        return NextResponse.json({ error: "Template not found", steps }, { status: 400 });
      tmplSubject = dbTemplate.subject;
      tmplBody = dbTemplate.html;
      contentType = "text/html";
      steps.push(`step5: using DB template id=${campaign.templateId}`);
    } else {
      steps.push("step5: using inline template");
    }

    if (!tmplSubject && !tmplBody) {
      return NextResponse.json({ error: "No template configured", steps }, { status: 400 });
    }
    steps.push(`step5: subject="${tmplSubject}" bodyLength=${tmplBody?.length ?? 0}`);

    // Step 6 — addresses
    steps.push("step6: parsing addresses");
    const addresses = parseAddresses(campaign.addressesText);
    if (addresses.length === 0) {
      return NextResponse.json({ error: "No addresses configured", steps }, { status: 400 });
    }
    steps.push(`step6: ${addresses.length} address(es)`);

    // Step 7 — render
    steps.push("step7: rendering template");
    const project = pickRandom(addresses);
    const vars = { firstName, project, address: project };
    const subject = renderTemplate(tmplSubject!, vars);
    const bodyText = renderTemplate(tmplBody!, vars);
    steps.push(`step7: rendered subject="${subject}"`);

    // Step 8 — SMTP verify
    steps.push("step8: verifying SMTP connection");
    try {
      await verifySmtpConnection();
      steps.push("step8: SMTP verify OK");
    } catch (verifyErr: unknown) {
      const msg = String((verifyErr as { message?: string })?.message ?? verifyErr);
      steps.push(`step8: SMTP verify FAILED — ${msg}`);
      return NextResponse.json({ error: `SMTP connection failed: ${msg}`, steps }, { status: 500 });
    }

    // Step 9 — send
    steps.push("step9: calling sendViaMail");
    const result = await sendViaMail({ to, subject, body: bodyText, contentType });
    steps.push(`step9: sent messageId=${result.messageId}`);

    return NextResponse.json({ ok: true, messageId: result.messageId, subject, projectUsed: project, to, steps });

  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? e ?? "Unexpected error");
    steps.push(`FATAL: ${msg}`);
    console.error("[test-send] fatal error:", e);
    return NextResponse.json({ error: msg, steps }, { status: 500 });
  }
}
