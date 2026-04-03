import { google } from "googleapis";
import { prisma } from "./prisma";

// OAuth client ID/secret for mass campaigns — falls back to the same app creds
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
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    prompt: "consent",
  });
}

/**
 * Exchange the OAuth code, auto-detect the sender email via Gmail profile,
 * then upsert into GmailAccount.
 * Returns the email address that was stored.
 */
export async function exchangeCodeAndDetectEmail(
  code: string,
  redirectUri: string
): Promise<string> {
  const client = createOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Ensure access_type=offline and prompt=consent, " +
        "and that you revoked previous access before re-authorizing."
    );
  }

  // Detect the actual email address from Gmail profile
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;

  if (!email) {
    throw new Error("Could not determine email address from Gmail profile.");
  }

  await prisma.gmailAccount.upsert({
    where: { email },
    update: { refreshToken: tokens.refresh_token },
    create: { email, refreshToken: tokens.refresh_token },
  });

  return email;
}

/** @deprecated Use exchangeCodeAndDetectEmail instead */
export async function exchangeCodeAndStoreMass(
  code: string,
  redirectUri: string
): Promise<void> {
  await exchangeCodeAndDetectEmail(code, redirectUri);
}

export async function getMassGmailStatus(): Promise<{
  connected: boolean;
  email: string;
}> {
  const senderEmail =
    process.env.MASS_GMAIL_SENDER_EMAIL || "projects@mkbuildersbidbook.com";
  const account = await prisma.gmailAccount.findUnique({
    where: { email: senderEmail },
  });
  return { connected: Boolean(account?.refreshToken), email: senderEmail };
}

export type SendOpts = {
  to: string;
  subject: string;
  body: string;
  contentType?: "text/plain" | "text/html";
};

export type SendResult = {
  messageId: string | null | undefined;
  threadId: string | null | undefined;
};

/**
 * Send a message using a specific GmailAccount row (by id).
 */
export async function sendViaGmailAccountById(
  accountId: number,
  opts: SendOpts
): Promise<SendResult> {
  const account = await prisma.gmailAccount.findUnique({ where: { id: accountId } });

  if (!account?.refreshToken) {
    throw new Error(
      `Gmail not connected for account #${accountId}. Visit /mass-campaigns to reconnect.`
    );
  }

  return _sendWithAccount(account.email, account.refreshToken, opts);
}

/**
 * Legacy: send via the hardcoded MASS_GMAIL_SENDER_EMAIL env var account.
 */
export async function sendViaMassGmail(opts: SendOpts): Promise<SendResult> {
  const senderEmail =
    process.env.MASS_GMAIL_SENDER_EMAIL || "projects@mkbuildersbidbook.com";

  const account = await prisma.gmailAccount.findUnique({
    where: { email: senderEmail },
  });

  if (!account?.refreshToken) {
    throw new Error(
      `Gmail not connected for ${senderEmail}. Visit /api/mass-gmail/connect to authorize.`
    );
  }

  return _sendWithAccount(senderEmail, account.refreshToken, opts);
}

/**
 * Send via a specific GmailAccount by id.
 */
export async function sendViaMassGmailById(accountId: number, opts: SendOpts): Promise<SendResult> {
  const account = await prisma.gmailAccount.findUnique({ where: { id: accountId } });
  if (!account?.refreshToken) {
    throw new Error(`Gmail account #${accountId} not connected.`);
  }
  return _sendWithAccount(account.email, account.refreshToken, opts);
}

async function _sendWithAccount(
  fromEmail: string,
  refreshToken: string,
  opts: SendOpts
): Promise<SendResult> {
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth: client });
  const ct = opts.contentType ?? "text/html";

  const encodedSubject = `=?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`;

  const messageParts = [
    `From: ${fromEmail}`,
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
