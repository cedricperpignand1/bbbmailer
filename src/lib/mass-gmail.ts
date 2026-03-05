import { google } from "googleapis";
import { prisma } from "./prisma";

const SENDER_EMAIL =
  process.env.MASS_GMAIL_SENDER_EMAIL || "projects@mkbuildersbidbook.com";

function createOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.MASS_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.MASS_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.MASS_GOOGLE_REDIRECT_URI
  );
}

export function getMassGmailAuthUrl(redirectUri: string): string {
  const client = createOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
    prompt: "consent",
  });
}

export async function exchangeCodeAndStoreMass(code: string, redirectUri: string): Promise<void> {
  const client = createOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Ensure access_type=offline and prompt=consent, " +
        "and that you revoked previous access before re-authorizing."
    );
  }
  await prisma.gmailAccount.upsert({
    where: { email: SENDER_EMAIL },
    update: { refreshToken: tokens.refresh_token },
    create: { email: SENDER_EMAIL, refreshToken: tokens.refresh_token },
  });
}

export async function getMassGmailStatus(): Promise<{
  connected: boolean;
  email: string;
}> {
  const account = await prisma.gmailAccount.findUnique({
    where: { email: SENDER_EMAIL },
  });
  return { connected: Boolean(account?.refreshToken), email: SENDER_EMAIL };
}

export async function sendViaMassGmail(opts: {
  to: string;
  subject: string;
  body: string;
  contentType?: "text/plain" | "text/html";
}): Promise<{
  messageId: string | null | undefined;
  threadId: string | null | undefined;
}> {
  const account = await prisma.gmailAccount.findUnique({
    where: { email: SENDER_EMAIL },
  });

  if (!account?.refreshToken) {
    throw new Error(
      `Gmail not connected for ${SENDER_EMAIL}. Visit /api/mass-gmail/connect to authorize.`
    );
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: account.refreshToken });

  const gmail = google.gmail({ version: "v1", auth: client });

  const ct = opts.contentType ?? "text/html";

  const encodedSubject = `=?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`;

  const messageParts = [
    `From: ${SENDER_EMAIL}`,
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${ct}; charset=UTF-8`,
    ``,
    opts.body,
  ];

  const raw = Buffer.from(messageParts.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return { messageId: res.data.id, threadId: res.data.threadId };
}
