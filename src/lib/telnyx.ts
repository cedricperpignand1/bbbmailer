export function defaultFromNumber() {
  return process.env.TELNYX_FROM_NUMBER || "";
}

export async function sendSms(to: string, from: string, text: string) {
  const apiKey = process.env.TELNYX_API_KEY || "";
  if (!apiKey) throw new Error("Missing TELNYX_API_KEY");

  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, text }),
  });

  const data = await res.json();

  if (!res.ok) {
    const detail =
      data?.errors?.[0]?.detail ||
      data?.error?.message ||
      `Telnyx error ${res.status}`;
    throw new Error(detail);
  }

  return { id: data.data?.id as string };
}
