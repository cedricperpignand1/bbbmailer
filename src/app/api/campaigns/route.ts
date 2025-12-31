import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      template: true,
      logs: {
        select: { status: true },
      },
    },
    take: 50,
  });

  const withCounts = campaigns.map((c) => {
    const counts = { queued: 0, sent: 0, failed: 0 };
    for (const l of c.logs) {
      if (l.status === "queued") counts.queued++;
      else if (l.status === "sent") counts.sent++;
      else if (l.status === "failed") counts.failed++;
    }
    return {
      id: c.id,
      status: c.status,
      createdAt: c.createdAt,
      phaseNumber: c.phaseNumber,
      categoryName: c.category.name,
      templateName: c.template.name,
      subject: c.template.subject,
      counts,
    };
  });

  return NextResponse.json({ campaigns: withCounts });
}
