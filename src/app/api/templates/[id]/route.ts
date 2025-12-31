import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idFromUrl(req: Request) {
  const parts = req.url.split("/");
  const idStr = parts[parts.length - 1] || "";
  const id = Number(idStr);
  return Number.isFinite(id) ? id : NaN;
}

export async function GET(req: Request) {
  const id = idFromUrl(req);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ template });
}

export async function PUT(req: Request) {
  const id = idFromUrl(req);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);

  const name = String(body?.name || "").trim();
  const subject = String(body?.subject || "").trim();
  const html = String(body?.html || "");

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!html.trim()) return NextResponse.json({ error: "HTML is required" }, { status: 400 });

  const updated = await prisma.template.update({
    where: { id },
    data: { name, subject, html },
  });

  return NextResponse.json({ template: updated });
}

export async function DELETE(req: Request) {
  const id = idFromUrl(req);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
