import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const API_KEY = process.env.BILLION_VERIFY_API_KEY!;

// Built-in list — emails whose domain contains any of these are NOT construction contacts
const BUILTIN_KEYWORDS = [
  // System / no-reply
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "unsubscribe", "postmaster", "mailer-daemon", "bounce@", "abuse@",
  // Finance / Mortgage
  "mortgage", "mortgages", "lending", "lender", "loaner", "refinanc",
  "bankofamerica", "wellsfargo", "jpmorgan", "chasebank", "citibank",
  "creditunion", "credit-union",
  // Insurance
  "insurance", "insure", "insurer", "allstate", "statefarm",
  // Medical / Dental / Health
  "dental", "dentist", "dentistry", "orthodont",
  "medical", "medicine", "hospital", "clinic", "healthcare",
  "pharmacy", "pharma", "drugstore", "walgreens", "cvs",
  "doctor", "physician", "pediatric", "surgery", "urgent-care",
  // Legal
  "lawyer", "attorney", "lawfirm", "lawoffice", "legalaid",
  // Restaurant / Food
  "restaurant", "eatery", "bistro", "pizzeria", "sushi",
  "catering", "foodservice", "diner",
  // Hotel / Hospitality
  "hotel", "motel", "resort", "lodging", "airbnb",
  // Beauty / Salon
  "salon", "barbershop", "beauty", "cosmetology", "nailspa",
  // Religious
  "church", "temple", "mosque", "synagogue", "parish", "ministry",
  // Education
  "preschool", "daycare", "childcare",
  // Casino / Gambling
  "casino", "gambling", "sportsbetting",
  // Marketing / Media agencies (not contractors)
  "adagency", "mediagroup", "digitalmarketing",
];

function isBuiltinFiltered(email: string): boolean {
  const lower = email.toLowerCase();
  return BUILTIN_KEYWORDS.some((kw) => lower.includes(kw));
}

function isCustomFiltered(email: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const lower = email.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

async function verifyEmail(email: string): Promise<{ invalid: boolean; reason: string }> {
  try {
    const res = await fetch("https://api.billionverify.com/v1/verify/single", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "BV-API-KEY": API_KEY,
      },
      body: JSON.stringify({ email, check_smtp: true }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { invalid: false, reason: `api_error:${res.status}` };

    const json = await res.json();
    const status: string = json?.data?.status ?? json?.status ?? "";
    if (status === "invalid" || status === "disposable") {
      return { invalid: true, reason: status };
    }
    return { invalid: false, reason: status || "ok" };
  } catch {
    return { invalid: false, reason: "timeout" };
  }
}

export async function POST(req: Request) {
  if (!API_KEY) return NextResponse.json({ error: "BILLION_VERIFY_API_KEY not set" }, { status: 500 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const categoryId = Number(body.categoryId);
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

  const lastId = Number(body.lastId ?? 0);

  // Load user-added custom keywords
  const kwRows = await prisma.filterKeyword.findMany({ select: { keyword: true } });
  const customKeywords = kwRows.map((r) => r.keyword);

  const contacts = await prisma.contact.findMany({
    where: { categoryId, status: "active", emailVerifiedAt: null, id: { gt: lastId } },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    select: { id: true, email: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ processed: 0, removed: 0, filtered: 0, nextLastId: null, done: true });
  }

  const now = new Date();

  // Step 1: keyword pre-filter (free — no API credits used)
  const keywordFiltered = contacts.filter(
    (c) => isBuiltinFiltered(c.email) || isCustomFiltered(c.email, customKeywords)
  );
  const toVerify = contacts.filter(
    (c) => !isBuiltinFiltered(c.email) && !isCustomFiltered(c.email, customKeywords)
  );

  if (keywordFiltered.length > 0) {
    await prisma.contact.updateMany({
      where: { id: { in: keywordFiltered.map((c) => c.id) } },
      data: { status: "bounced", emailVerifiedAt: now },
    });
  }

  // Step 2: BillionVerify on remaining contacts
  const results = await Promise.all(
    toVerify.map((c) => verifyEmail(c.email).then((r) => ({ ...c, ...r })))
  );

  const invalid = results.filter((r) => r.invalid);
  const validIds = results.filter((r) => !r.invalid).map((r) => r.id);

  if (invalid.length > 0) {
    await prisma.contact.updateMany({
      where: { id: { in: invalid.map((r) => r.id) } },
      data: { status: "bounced", emailVerifiedAt: now },
    });
  }

  if (validIds.length > 0) {
    await prisma.contact.updateMany({
      where: { id: { in: validIds } },
      data: { emailVerifiedAt: now },
    });
  }

  const nextLastId = contacts[contacts.length - 1].id;
  const done = contacts.length < BATCH_SIZE;

  return NextResponse.json({
    processed: contacts.length,
    removed: invalid.length + keywordFiltered.length,
    filtered: keywordFiltered.length,
    nextLastId: done ? null : nextLastId,
    done,
  });
}
