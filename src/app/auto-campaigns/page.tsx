"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CategoryRow = {
  id: number;
  name: string;
  phaseSize: number;
  _count?: { contacts: number };
};

type AutoCampaignRow = {
  id: number;
  name: string;
  active: boolean;
  categoryId: number;
  templateSubject: string;
  templateBody: string;
  addressesText: string;
  maxPerDay: number;
  sendHourET: number;
  sendMinuteET: number;
  createdAt: string;
  updatedAt: string;
} | null;

type DailyRunRow = {
  id: number;
  campaignId: number;
  dateET: string;
  ranAt: string;
  sentCount: number;
  failedCount: number;
};

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "blue" | "amber";
}) {
  const map: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function formatDateTime(x: string) {
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeAddresses(text: string) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function AutoCampaignsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [autoCampaign, setAutoCampaign] = useState<AutoCampaignRow>(null);
  const [dailyRuns, setDailyRuns] = useState<DailyRunRow[]>([]);

  // Gmail connection status
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  // Run Today
  const [running, setRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<any>(null);
  const runAbortRef = useRef<AbortController | null>(null);

  // Test Email
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok?: boolean;
    error?: string;
    projectUsed?: string;
    messageId?: string;
  } | null>(null);

  // Form state
  const [name, setName] = useState("Monthly Project Invites");
  const [active, setActive] = useState(true);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [addressesText, setAddressesText] = useState("");
  const [maxPerDay, setMaxPerDay] = useState(45);
  const [sendHourET, setSendHourET] = useState(11);
  const [sendMinuteET, setSendMinuteET] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    setOkMsg(null);

    try {
      const [dataRes, gmailRes] = await Promise.all([
        fetch("/api/auto-campaigns", { cache: "no-store" }),
        fetch("/api/gmail/status", { cache: "no-store" }),
      ]);

      const data = await dataRes.json();
      const gmail = await gmailRes.json().catch(() => ({ connected: false }));

      setGmailConnected(Boolean(gmail?.connected));
      setCategories(data.categories || []);
      setDailyRuns(data.dailyRuns || []);

      const ac: AutoCampaignRow = data.autoCampaign || null;
      setAutoCampaign(ac);

      if (ac) {
        setName(ac.name || "Monthly Project Invites");
        setActive(Boolean(ac.active));
        setCategoryId(ac.categoryId ?? null);
        setTemplateSubject(ac.templateSubject || "");
        setTemplateBody(ac.templateBody || "");
        setAddressesText(ac.addressesText || "");
        setMaxPerDay(ac.maxPerDay ?? 45);
        setSendHourET(ac.sendHourET ?? 11);
        setSendMinuteET(ac.sendMinuteET ?? 0);
      } else {
        setCategoryId(data.categories?.[0]?.id ?? null);
        setName("Monthly Project Invites");
        setActive(true);
        setTemplateSubject("");
        setTemplateBody("");
        setAddressesText("");
        setMaxPerDay(45);
        setSendHourET(11);
        setSendMinuteET(0);
      }
    } catch {
      setError("Failed to load auto campaign data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // If redirected back from Gmail OAuth with ?gmail=connected
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("gmail") === "connected") {
      setOkMsg("Gmail connected successfully!");
      window.history.replaceState({}, "", "/auto-campaigns");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);

    const catId = Number(categoryId);
    if (!Number.isFinite(catId) || catId <= 0) {
      setSaving(false);
      return setError("Select a category (contact list)");
    }

    const normalized = normalizeAddresses(addressesText);
    if (!normalized) {
      setSaving(false);
      return setError("Paste at least 1 address (one per line)");
    }

    const payload = {
      id: autoCampaign?.id,
      name: name.trim() || "Monthly Project Invites",
      active: Boolean(active),
      categoryId: catId,
      templateSubject: templateSubject.trim(),
      templateBody: templateBody,
      addressesText: normalized,
      maxPerDay: clampInt(Number(maxPerDay), 1, 500),
      sendHourET: clampInt(Number(sendHourET), 0, 23),
      sendMinuteET: clampInt(Number(sendMinuteET), 0, 59),
    };

    try {
      const res = await fetch("/api/auto-campaigns/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Save failed");

      setOkMsg("Saved.");
      await loadAll();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!autoCampaign) return;
    const newActive = !autoCampaign.active;
    try {
      const res = await fetch(
        `/api/auto-campaigns/${autoCampaign.id}/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: newActive }),
        }
      );
      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Toggle failed");
      setActive(newActive);
      setAutoCampaign((prev) => (prev ? { ...prev, active: newActive } : prev));
      setOkMsg(newActive ? "Campaign resumed." : "Campaign paused.");
    } catch {
      setError("Toggle failed");
    }
  }

  async function runToday() {
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;

    setRunning(true);
    setError(null);
    setOkMsg(null);
    setLastRunResult(null);

    try {
      const res = await fetch("/api/auto-campaigns/run-due?force=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Run failed");

      setLastRunResult(data);
      if (data?.skipped) {
        setOkMsg(`Skipped: ${data.reason || ""}`);
      } else {
        const total = (data.results || []).reduce(
          (s: number, r: any) => s + (r.sent || 0),
          0
        );
        setOkMsg(`Run completed. Sent ${total} email(s).`);
      }

      await loadAll();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setOkMsg("Canceled.");
        return;
      }
      setError("Run failed");
    } finally {
      setRunning(false);
      runAbortRef.current = null;
    }
  }

  async function sendTest() {
    if (!autoCampaign) return setError("Save the campaign first.");
    const emailTrimmed = testEmail.trim();
    if (!emailTrimmed) return setTestResult({ error: "Enter an email address." });

    setTestSending(true);
    setTestResult(null);

    try {
      const res = await fetch(
        `/api/auto-campaigns/${autoCampaign.id}/test-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: emailTrimmed }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ error: data?.error || "Test send failed" });
      } else {
        setTestResult({
          ok: true,
          projectUsed: data.projectUsed,
          messageId: data.messageId,
        });
      }
    } catch {
      setTestResult({ error: "Test send failed — network error" });
    } finally {
      setTestSending(false);
    }
  }

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || null,
    [categories, categoryId]
  );

  const addressCount = useMemo(() => {
    const lines = normalizeAddresses(addressesText).split("\n").filter(Boolean);
    return lines[0] ? lines.length : 0;
  }, [addressesText]);

  const totalContacts = selectedCategory?._count?.contacts ?? 0;

  return (
    <main className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Auto Campaigns
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Sends up to 45 emails/day at 11:00 AM ET, Mon–Fri via Gmail.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            onClick={loadAll}
            disabled={loading || running}
          >
            Refresh
          </button>

          {autoCampaign && (
            <button
              className={`rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                autoCampaign.active
                  ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
              onClick={toggleActive}
              disabled={loading || saving || running}
            >
              {autoCampaign.active ? "Pause" : "Resume"}
            </button>
          )}

          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            onClick={runToday}
            disabled={loading || saving || running}
            title="Force-run now (bypasses time/day check)"
          >
            {running ? "Running..." : "Run Now"}
          </button>
        </div>
      </div>

      {/* Gmail Status Banner */}
      {gmailConnected === false && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Gmail not connected.</span> Connect
            your Gmail account to enable sending.
          </div>
          <a
            href="/api/gmail/connect"
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Connect Gmail
          </a>
        </div>
      )}

      {gmailConnected === true && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-3 px-4">
          <div className="text-sm text-emerald-800">
            <span className="font-semibold">Gmail connected</span> —
            buildersbidbook@gmail.com
          </div>
          <a
            href="/api/gmail/connect"
            className="text-xs text-emerald-700 underline hover:text-emerald-900"
          >
            Re-connect
          </a>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Something went wrong</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {okMsg && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="font-semibold">OK</div>
          <div className="mt-1">{okMsg}</div>
        </div>
      )}

      {lastRunResult && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Last run result
            </div>
            <Pill tone="blue">run</Pill>
          </div>
          <pre className="mt-3 max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
            {JSON.stringify(lastRunResult, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Settings */}
        <section className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Campaign Settings
              </h2>
              <Pill tone={active ? "green" : "neutral"}>
                {active ? "active" : "paused"}
              </Pill>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-700">Name</div>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Monthly Project Invites"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="active"
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <label htmlFor="active" className="text-sm text-slate-700">
                  Active (allow scheduled sending)
                </label>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700">
                  Contact list (Category)
                </div>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={categoryId ?? ""}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                >
                  {categories.length === 0 ? (
                    <option value="">No categories</option>
                  ) : (
                    categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c._count?.contacts ?? 0} contacts)
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    Max/day
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={maxPerDay}
                    onChange={(e) => setMaxPerDay(Number(e.target.value))}
                    title="Max emails to send per day (default 45)"
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    Hour ET
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={sendHourET}
                    onChange={(e) => setSendHourET(Number(e.target.value))}
                    title="Hour to send (24h, ET). Cron checks 11:00–11:05 ET."
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    Minute
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={sendMinuteET}
                    onChange={(e) => setSendMinuteET(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div className="flex flex-wrap gap-2">
                  <Pill tone="blue">{totalContacts} contacts in list</Pill>
                  <Pill tone="amber">{addressCount} addresses</Pill>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Sends sequentially through the list — each contact receives 1
                  email total. Max {maxPerDay}/day.
                </div>
              </div>

              <button
                className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={save}
                disabled={saving || loading || running}
              >
                {saving ? "Saving..." : "Save Campaign"}
              </button>
            </div>
          </div>

          {/* Template */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Email Template
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Plain text. Use{" "}
              <code className="rounded bg-slate-100 px-1">
                {"{{firstName}}"}
              </code>{" "}
              and{" "}
              <code className="rounded bg-slate-100 px-1">{"{{project}}"}</code>
              .
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-700">
                  Subject
                </div>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  placeholder="Subcontractors needed for {{project}}"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700">Body</div>
                <textarea
                  className="mt-1 h-40 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  placeholder={`Hi {{firstName}},\n\nWe have a project at {{project}} and are looking for subcontractors. Reply if interested.\n\nThanks`}
                />
              </div>
            </div>
          </div>

          {/* Property Addresses */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Property Addresses
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              One per line. A random address is used as{" "}
              <code className="rounded bg-slate-100 px-1">{"{{project}}"}</code>{" "}
              per email.
            </p>

            <textarea
              className="mt-3 h-40 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              value={addressesText}
              onChange={(e) => setAddressesText(e.target.value)}
              placeholder={`123 Main St Miami, FL 33101\n456 Ocean Dr Miami Beach, FL 33139\n...`}
            />
          </div>

          {/* Test Email */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Test Email
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Send a single test using current campaign settings. Does not
              affect the contact list or daily limit.
            </p>

            <div className="mt-3 flex gap-2">
              <input
                type="email"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                onClick={sendTest}
                disabled={testSending || !autoCampaign}
                title={
                  !autoCampaign
                    ? "Save the campaign first"
                    : "Send a test email"
                }
              >
                {testSending ? "Sending…" : "Send Test"}
              </button>
            </div>

            {testResult && (
              <div
                className={`mt-3 rounded-xl border p-3 text-sm ${
                  testResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {testResult.ok ? (
                  <>
                    <div className="font-semibold">Sent!</div>
                    <div className="mt-1 text-xs">
                      Project used:{" "}
                      <span className="font-medium">{testResult.projectUsed}</span>
                    </div>
                    {testResult.messageId && (
                      <div className="mt-0.5 text-xs text-emerald-600">
                        Message ID: {testResult.messageId}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="font-semibold">Failed</div>
                    <div className="mt-1">{testResult.error}</div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Run History */}
        <section className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Daily run history
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Gmail sends — one run per campaign per day.
                  </p>
                </div>
                <Pill tone="blue">Gmail</Pill>
              </div>
            </div>

            {dailyRuns.length === 0 ? (
              <div className="p-5 text-sm text-slate-600">No runs yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px]">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-5 py-3">Date (ET)</th>
                      <th className="px-5 py-3">Sent</th>
                      <th className="px-5 py-3">Failed</th>
                      <th className="px-5 py-3">Ran at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyRuns.map((r) => (
                      <tr key={r.id} className="text-sm">
                        <td className="px-5 py-4 font-medium">{r.dateET}</td>
                        <td className="px-5 py-4">
                          <Pill tone="green">{r.sentCount}</Pill>
                        </td>
                        <td className="px-5 py-4">
                          {r.failedCount > 0 ? (
                            <Pill tone="red">{r.failedCount}</Pill>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-500">
                          {formatDateTime(r.ranAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">How it works</div>
            <div className="mt-1 space-y-1 text-xs">
              <div>
                • Cron fires every 5 min Mon–Fri; run-due checks for the
                11:00–11:05 AM ET window.
              </div>
              <div>
                • Contacts are processed sequentially — each contact is emailed
                exactly once.
              </div>
              <div>
                • Use{" "}
                <span className="font-semibold">Run Now</span> to force-run
                immediately (bypasses time/day check).
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
