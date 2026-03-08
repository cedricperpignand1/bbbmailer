import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const categoryId = Number(searchParams.get("categoryId"));
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

  const contacts = await prisma.contact.findMany({
    where: { categoryId, status: "active" },
    orderBy: { id: "asc" },
    select: { email: true, firstName: true },
  });

  const rows = ["email,firstName", ...contacts.map((c) => `${c.email},${c.firstName ?? ""}`)];
  const csv = rows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts-${categoryId}.csv"`,
    },
  });
}
