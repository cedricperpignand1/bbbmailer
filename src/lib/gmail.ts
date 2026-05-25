import { google } from "googleapis";
import { prisma } from "./prisma";

const SENDER_EMAIL =
  process.env.GMAIL_SENDER_EMAIL || "buildersbidbook@gmail.com";

function createOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGmailAuthUrl(redirectUri?: string): string {
  const client = createOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    prompt: "consent",
  });
}

export async function exchangeCodeAndStore(
  code: string,
  senderEmail?: string,
  redirectUri?: string
): Promise<void> {
  const email = senderEmail || SENDER_EMAIL;
  const client = createOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Ensure access_type=offline and prompt=consent, " +
        "and that you revoked previous access before re-authorizing."
    );
  }
  await prisma.gmailAccount.upsert({
    where: { email },
    update: { refreshToken: tokens.refresh_token },
    create: { email, refreshToken: tokens.refresh_token },
  });
}

export async function getGmailStatus(senderEmail?: string): Promise<{
  connected: boolean;
  email: string;
}> {
  const email = senderEmail || SENDER_EMAIL;
  const account = await prisma.gmailAccount.findUnique({
    where: { email },
  });
  return { connected: Boolean(account?.refreshToken), email };
}

export async function sendViaGmail(opts: {
  to: string;
  subject: string;
  body: string;
  /** Defaults to "text/html" when body looks like HTML, otherwise "text/plain" */
  contentType?: "text/plain" | "text/html";
  /** Override the sender account — defaults to GMAIL_SENDER_EMAIL env var */
  senderEmail?: string;
}): Promise<{
  messageId: string | null | undefined;
  threadId: string | null | undefined;
}> {
  const email = opts.senderEmail || SENDER_EMAIL;

  const account = await prisma.gmailAccount.findUnique({
    where: { email },
  });

  if (!account?.refreshToken) {
    throw new Error(
      `Gmail not connected for ${email}. Visit the connect page to authorize.`
    );
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: account.refreshToken });

  const gmail = google.gmail({ version: "v1", auth: client });

  const ct = opts.contentType ?? "text/html";

  // RFC 2047: encode subject as UTF-8 Base64 so non-ASCII chars (em dash, etc.) render correctly
  const encodedSubject = `=?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`;

  const messageParts = [
    `From: ${email}`,
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
