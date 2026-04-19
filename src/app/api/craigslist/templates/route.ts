import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TITLES = [
  "Construction project at {{address}} — looking for subs",
  "Active job site near {{address}} — {{city}} area",
  "New build at {{address}} — need skilled trades",
  "Hiring contractors for project at {{address}}",
  "Construction work available — {{address}} — {{city}}",
];

const DEFAULT_BODIES = [
  `We have an active construction project at {{address}} in the {{city}} area and are looking for experienced subcontractors to join our team.

Work includes framing, plumbing rough-in, electrical, drywall, and finishing. Reliable crews with references preferred.

If you're a licensed contractor or trade professional looking for steady work, we'd love to connect.

You can find more details by searching the address on {{link}}.

Respond to this post with your trade specialty and availability. Serious inquiries only.`,

  `New construction underway at {{address}}, {{city}}.

We're looking for dependable subcontractors across all trades — roofing, HVAC, flooring, tile, painting, and more. Project is currently in progress and additional scopes are opening up.

For more project details and related opportunities, check out {{link}}.

Contact us with your specialty and availability. Local crews strongly preferred.`,

  `Construction opportunity available in {{city}}.

Project located at {{address}}. Seeking qualified subs for various scopes of work. Strong safety record and proof of insurance required.

This and similar projects are tracked at {{link}} — a great resource for active permit work in your area.

Send a message with your trade, license number, and schedule availability.`,
];

export async function GET() {
  const templates = await prisma.craigslistTemplate.findMany({
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { action, type, content } = body as Record<string, unknown>;

  if (action === "seed-defaults") {
    // Only seed if no templates exist
    const existing = await prisma.craigslistTemplate.count();
    if (existing === 0) {
      await prisma.craigslistTemplate.createMany({
        data: [
          ...DEFAULT_TITLES.map((content) => ({ type: "title", content })),
          ...DEFAULT_BODIES.map((content) => ({ type: "body", content })),
        ],
      });
    }
    const all = await prisma.craigslistTemplate.findMany({
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ templates: all });
  }

  if (!type || !content) {
    return NextResponse.json({ error: "type and content required" }, { status: 400 });
  }
  if (type !== "title" && type !== "body") {
    return NextResponse.json({ error: "type must be title or body" }, { status: 400 });
  }

  const tpl = await prisma.craigslistTemplate.create({
    data: { type: String(type), content: String(content) },
  });
  return NextResponse.json(tpl);
}
