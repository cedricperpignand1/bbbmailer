import twilio from "twilio";

const sid = process.env.TWILIO_ACCOUNT_SID || "";
const token = process.env.TWILIO_AUTH_TOKEN || "";

export function getTwilioClient() {
  if (!sid || !token) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  }
  return twilio(sid, token);
}

export function defaultFromNumber() {
  return process.env.TWILIO_DEFAULT_FROM || "";
}
