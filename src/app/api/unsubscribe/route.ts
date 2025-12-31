import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubToken } from "@/lib/unsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  const contactId = verifyUnsubToken(token);
  if (!contactId) {
    return new NextResponse(
      `<html><body style="font-family:Arial;padding:24px;">
        <h2>Invalid unsubscribe link</h2>
        <p>This link is invalid or expired.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 400 }
    );
  }

  await prisma.contact.update({
    where: { id: contactId },
    data: { status: "unsubscribed" },
  });

  return new NextResponse(
    `<html><body style="font-family:Arial;padding:24px;">
      <h2>You’re unsubscribed</h2>
      <p>You will no longer receive emails from Builders Bid Book.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
