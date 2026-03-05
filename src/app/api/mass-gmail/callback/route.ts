import { NextResponse } from "next/server";
import { exchangeCodeAndStoreMass } from "@/lib/mass-gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code param" }, { status: 400 });
  }

  try {
    await exchangeCodeAndStoreMass(code);
    return NextResponse.redirect(new URL("/campaigns", url.origin));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
