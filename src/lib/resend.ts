import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM =
  process.env.RESEND_FROM_EMAIL || "Angry Estimators <noreply@angryestimators.com>";

const REPLY_TO = process.env.RESEND_REPLY_TO || undefined;

export async function sendViaResend(opts: {
  to: string;
  subject: string;
  body: string;
  contentType?: "text/plain" | "text/html";
}): Promise<{ messageId: string | null }> {
  const isHtml = opts.contentType === "text/html";

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    replyTo: REPLY_TO,
    ...(isHtml ? { html: opts.body } : { text: opts.body }),
  });

  if (error) {
    throw new Error(`Resend error: ${(error as any).message ?? JSON.stringify(error)}`);
  }

  return { messageId: data?.id ?? null };
}
