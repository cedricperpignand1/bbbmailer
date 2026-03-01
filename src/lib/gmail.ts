import { google } from "googleapis";
import { prisma } from "./prisma";

const SENDER_EMAIL =
  process.env.GMAIL_SENDER_EMAIL || "buildersbidbook@gmail.com";

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGmailAuthUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
    prompt: "consent",
  });
}

export async function exchangeCodeAndStore(code: string): Promise<void> {
  const client = createOAuthClient();
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

export async function getGmailStatus(): Promise<{
  connected: boolean;
  email: string;
}> {
  const account = await prisma.gmailAccount.findUnique({
    where: { email: SENDER_EMAIL },
  });
  return { connected: Boolean(account?.refreshToken), email: SENDER_EMAIL };
}

export async function sendViaGmail(opts: {
  to: string;
  subject: string;
  body: string;
  /** Defaults to "text/html" when body looks like HTML, otherwise "text/plain" */
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
      `Gmail not connected for ${SENDER_EMAIL}. Visit /api/gmail/connect to authorize.`
    );
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: account.refreshToken });

  const gmail = google.gmail({ version: "v1", auth: client });

  const ct = opts.contentType ?? "text/html";

  const messageParts = [
    `From: ${SENDER_EMAIL}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
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
