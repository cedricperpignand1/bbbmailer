import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const name = String(body?.name || "").trim();
  const subject = String(body?.subject || "").trim();
  const html = String(body?.html || "");

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!html.trim()) return NextResponse.json({ error: "HTML is required" }, { status: 400 });

  const template = await prisma.template.create({
    data: { name, subject, html },
  });

  return NextResponse.json({ template });
}
