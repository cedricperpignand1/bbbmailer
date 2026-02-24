import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Categories with phone count so the UI can show "347 numbers"
  const rawCategories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { phoneContacts: true } },
    },
  });

  const categories = rawCategories.map((c) => ({
    id: c.id,
    name: c.name,
    phoneCount: c._count.phoneContacts,
  }));

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
        take: 30,
        select: {
          id: true,
          toPhone: true,
          body: true,
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
