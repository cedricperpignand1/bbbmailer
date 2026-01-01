import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto Campaigns Builder
 * - categories = contact lists (for MVP we reuse Category)
 * - template = the ONE fixed template used for auto invites
 */
export async function GET() {
  // categories (same as campaigns/builder)
  const categories = await prisma.category.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });

  // ONE template (adjust the "where" to match your DB)
  // Option A (recommended): match by exact name
  const template =
    (await prisma.template.findFirst({
      where: { name: "Project Invite" },
      orderBy: { createdAt: "desc" },
    })) ??
    // fallback: just take the newest template so your UI doesn't break
    (await prisma.template.findFirst({
      orderBy: { createdAt: "desc" },
    }));

  return NextResponse.json({
    categories,
    template: template
      ? { id: template.id, name: template.name, subject: template.subject }
      : null,
  });
}
