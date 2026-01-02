import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // We keep MVP simple: 1 AutoSmsCampaign row (like your email auto page)
  const auto = await prisma.autoSmsCampaign.findFirst({
    orderBy: { id: "asc" },
  });

  const selectedCategoryId = auto?.categoryId ?? null;

  const phoneCount = selectedCategoryId
    ? await prisma.phoneContact.count({
        where: { categoryId: selectedCategoryId, status: "active" },
      })
    : 0;

  const addressCount = (auto?.addressesText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean).length;

  const recentRuns = auto
    ? await prisma.autoSmsRun.findMany({
        where: { autoSmsCampaignId: auto.id },
        orderBy: { ranAt: "desc" },
        take: 20,
      })
    : [];

  const recentLogs = auto
    ? await prisma.smsSendLog.findMany({
        where: { autoSmsCampaignId: auto.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          toPhone: true,
          status: true,
          error: true,
          createdAt: true,
        },
      })
    : [];

  return NextResponse.json({
    categories,
    auto: auto ?? null,
    stats: { phoneCount, addressCount },
    recentRuns,
    recentLogs,
  });
}
