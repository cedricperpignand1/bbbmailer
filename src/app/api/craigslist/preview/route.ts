import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Link variation system — randomized each generation
const LINK_VARIANTS = [
  "BuildersBidBook.com",
  "www.buildersbidbook.com",
  "Visit BuildersBidBook.com",
  "Search Builders Bid Book on Google",
  "Look up the address on Builders Bid Book",
];

// Natural sentence wrappers for when {{link}} is not explicitly in template
const LINK_SENTENCES = [
  (l: string) => `You can find more details by searching the address on ${l}.`,
  (l: string) => `For more project info and similar opportunities, check out ${l}.`,
  (l: string) => `Additional project details are listed at ${l}.`,
  (l: string) => `This project is tracked on ${l}.`,
  (l: string) => `Contractors can find related opportunities at ${l}.`,
  (l: string) => `More active projects in your area can be found at ${l}.`,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export async function POST() {
  // Load settings
  const settings = await prisma.craigslistSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return NextResponse.json({ error: "Settings not configured. Please save your settings first." }, { status: 400 });
  }

  // Pick a random pending address
  const pending = await prisma.craigslistAddress.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (!pending.length) {
    return NextResponse.json({ error: "No pending addresses. Load addresses or reset used ones." }, { status: 400 });
  }
  const address = pick(pending);

  // Load templates
  const titles = await prisma.craigslistTemplate.findMany({ where: { type: "title" } });
  const bodies = await prisma.craigslistTemplate.findMany({ where: { type: "body" } });

  if (!titles.length) {
    return NextResponse.json({ error: "No title templates found. Go to Templates tab and add some." }, { status: 400 });
  }
  if (!bodies.length) {
    return NextResponse.json({ error: "No body templates found. Go to Templates tab and add some." }, { status: 400 });
  }

  const titleTpl = pick(titles);
  const bodyTpl = pick(bodies);

  // Pick randomized link variant
  const linkVariant = pick(LINK_VARIANTS);

  // Apply variable substitution
  const vars: Record<string, string> = {
    address: address.address,
    city: settings.city || "your area",
    link: linkVariant,
  };

  let generatedTitle = applyTemplate(titleTpl.content, vars);
  let generatedBody = applyTemplate(bodyTpl.content, vars);

  // If {{link}} was NOT in the body template, append it naturally
  if (!bodyTpl.content.includes("{{link}}")) {
    const sentence = pick(LINK_SENTENCES)(linkVariant);
    generatedBody = `${generatedBody.trimEnd()}\n\n${sentence}`;
  }

  // Log as "previewed" (do NOT mark address as used)
  await prisma.craigslistPostLog.create({
    data: {
      address: address.address,
      generatedTitle,
      generatedBody,
      city: settings.city || "",
      category: settings.category,
      status: "previewed",
    },
  });

  return NextResponse.json({
    addressId: address.id,
    address: address.address,
    title: generatedTitle,
    body: generatedBody,
    city: settings.city || "",
    category: settings.category,
    titleTemplateId: titleTpl.id,
    bodyTemplateId: bodyTpl.id,
  });
}
