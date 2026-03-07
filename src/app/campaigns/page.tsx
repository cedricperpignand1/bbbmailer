"use client";

import React, { useEffect, useMemo, useState } from "react";

type CategoryRow = {
  id: number;
  name: string;
  phaseSize: number;
  _count?: { contacts: number };
};

type TemplateRow = {
  id: number;
  name: string;
  subject: string;
};

type MassCampaignRow = {
  id: number;
  name: string;
  active: boolean;
  categoryId: number;
  templateId: number | null;
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

const INLINE_ID = 0;
const MASS_SENDER = "projects@mkbuildersbidbook.com";

export default function MassCampaignsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [massCampaign, setMassCampaign] = useState<MassCampaignRow>(null);
  const [dailyRuns, setDailyRuns] = useState<DailyRunRow[]>([]);
  const [todayRun, setTodayRun] = useState<DailyRunRow | null>(null);

  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok?: boolean;
    error?: string;
    projectUsed?: string;
    messageId?: string;
  } | null>(null);

  const [name, setName] = useState("Mass Campaign");
  const [active, setActive] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(INLINE_ID);
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
        fetch("/api/mass-campaigns", { cache: "no-store" }),
        fetch("/api/mass-gmail/status", { cache: "no-store" }),
      ]);

      const data = await dataRes.json();
      const gmail = await gmailRes.json().catch(() => ({ connected: false }));

      setGmailConnected(Boolean(gmail?.connected));
      setCategories(data.categories || []);
      setTemplates(data.templates || []);
      setDailyRuns(data.dailyRuns || []);
      setTodayRun(data.todayRun ?? null);

      const mc: MassCampaignRow = data.massCampaign || null;
      setMassCampaign(mc);

      if (mc) {
        setName(mc.name || "Mass Campaign");
        setActive(Boolean(mc.active));
        setCategoryId(mc.categoryId ?? null);
        setSelectedTemplateId(mc.templateId ?? INLINE_ID);
        setTemplateSubject(mc.templateSubject || "");
        setTemplateBody(mc.templateBody || "");
        setAddressesText(mc.addressesText || "");
        setMaxPerDay(mc.maxPerDay ?? 45);
        setSendHourET(mc.sendHourET ?? 11);
        setSendMinuteET(mc.sendMinuteET ?? 0);
      } else {
        setCategoryId(data.categories?.[0]?.id ?? null);
        setName("Mass Campaign");
        setActive(false);
        setSelectedTemplateId(INLINE_ID);
        setTemplateSubject("");
        setTemplateBody("");
        setAddressesText("");
        setMaxPerDay(45);
        setSendHourET(11);
        setSendMinuteET(0);
      }
    } catch {
      setError("Failed to load mass campaign data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("gmail") === "connected") {
      setOkMsg("Gmail connected successfully!");
      window.history.replaceState({}, "", "/campaigns");
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

    const usingInline = selectedTemplateId === INLINE_ID;

    const payload = {
      id: massCampaign?.id,
      name: name.trim() || "Mass Campaign",
      active: Boolean(active),
      categoryId: catId,
      templateId: usingInline ? null : selectedTemplateId,
      templateSubject: usingInline ? templateSubject.trim() : "",
      templateBody: usingInline ? templateBody : "",
      addressesText: normalized,
      maxPerDay: clampInt(Number(maxPerDay), 1, 500),
      sendHourET: clampInt(Number(sendHourET), 0, 23),
      sendMinuteET: clampInt(Number(sendMinuteET), 0, 59),
    };

    try {
      const res = await fetch("/api/mass-campaigns/upsert", {
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

  async function resetSendHistory() {
    if (!massCampaign) return;
    if (!confirm("This will clear all send history so every contact can be emailed again. Continue?")) return;
    setResetting(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/mass-campaigns/${massCampaign.id}/reset`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Reset failed");
      setOkMsg(`Reset complete — ${data.deletedSends} send records cleared.`);
      await loadAll();
    } catch {
      setError("Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function toggleActive() {
    if (!massCampaign) return;
    const newActive = !massCampaign.active;
    try {
      const res = await fetch(`/api/mass-campaigns/${massCampaign.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Toggle failed");
      setActive(newActive);
      setMassCampaign((prev) => (prev ? { ...prev, active: newActive } : prev));
      setOkMsg(newActive ? "Campaign resumed." : "Campaign paused.");
    } catch {
      setError("Toggle failed");
    }
  }

  async function sendTest() {
    if (!massCampaign) return setError("Save the campaign first.");
    const emailTrimmed = testEmail.trim();
    if (!emailTrimmed) return setTestResult({ error: "Enter an email address." });

    setTestSending(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/mass-campaigns/${massCampaign.id}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTrimmed }),
      });
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

  const selectedTemplate = useMemo(
    () =>
      selectedTemplateId !== INLINE_ID
        ? templates.find((t) => t.id === selectedTemplateId) ?? null
        : null,
    [templates, selectedTemplateId]
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
            Mass Campaigns
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Sends automatically at your chosen time, Mon–Fri via Gmail ({MASS_SENDER}).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            onClick={loadAll}
            disabled={loading}
          >
            Refresh
          </button>

          {massCampaign && (
            <>
              <button
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                onClick={resetSendHistory}
                disabled={loading || saving || resetting}
                title="Clear send history so all contacts can be emailed again"
              >
                {resetting ? "Resetting…" : "Reset List"}
              </button>
              <button
                className={`rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                  massCampaign.active
                    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
                onClick={toggleActive}
                disabled={loading || saving}
              >
                {massCampaign.active ? "Pause" : "Resume"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Gmail Status Banner */}
      {gmailConnected === false && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Gmail not connected.</span> Connect{" "}
            {MASS_SENDER} to enable sending.
          </div>
          <a
            href="/api/mass-gmail/connect"
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Connect Gmail
          </a>
        </div>
      )}

      {gmailConnected === true && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-3 px-4">
          <div className="text-sm text-emerald-800">
            <span className="font-semibold">Gmail connected</span> — {MASS_SENDER}
          </div>
          <a
            href="/api/mass-gmail/connect"
            className="text-xs text-emerald-700 underline hover:text-emerald-900"
          >
            Re-connect
          </a>
        </div>
      )}

      {/* Today's Status card */}
      {massCampaign && (
        <div className={`mt-4 flex items-center justify-between rounded-2xl border px-4 py-3 ${
          !massCampaign.active
            ? "border-slate-200 bg-slate-50 text-slate-500"
            : todayRun
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          <div className="flex items-center gap-3">
            {!massCampaign.active ? (
              <span className="text-sm font-semibold">Campaign paused — no sends scheduled</span>
            ) : todayRun ? (
              <>
                <span className="text-sm font-semibold">Today: sent {todayRun.sentCount} email{todayRun.sentCount !== 1 ? "s" : ""}</span>
                <span className="text-xs opacity-70">· {new Date(todayRun.ranAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="text-sm font-semibold">
                  Pending — will send at {String(massCampaign.sendHourET).padStart(2, "0")}:{String(massCampaign.sendMinuteET).padStart(2, "0")} ET (cron retries every 5 min)
                </span>
              </>
            )}
          </div>
          <button onClick={loadAll} disabled={loading} className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-30">
            Refresh
          </button>
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

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Settings */}
        <section className="lg:col-span-5 space-y-4">
          {/* Campaign Settings */}
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
                  placeholder="Mass Campaign"
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
                  <div className="text-xs font-semibold text-slate-700">Max/day</div>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={maxPerDay}
                    onChange={(e) => setMaxPerDay(Number(e.target.value))}
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700">Hour ET</div>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={sendHourET}
                    onChange={(e) => setSendHourET(Number(e.target.value))}
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700">Minute</div>
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
                  Each contact receives 1 email total (sequential). Max {maxPerDay}/day.
                </div>
              </div>

              <button
                className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={save}
                disabled={saving || loading}
              >
                {saving ? "Saving..." : "Save Campaign"}
              </button>
            </div>
          </div>

          {/* Template Picker */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Template</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose a template you created on the{" "}
              <a href="/templates" className="text-sky-600 underline">
                Templates page
              </a>
              , or write a custom one below. Use{" "}
              <code className="rounded bg-slate-100 px-1">{"{{firstName}}"}</code>{" "}
              and{" "}
              <code className="rounded bg-slate-100 px-1">{"{{project}}"}</code>.
            </p>

            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-700">Select template</div>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
              >
                <option value={INLINE_ID}>— Custom (write below) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.subject}
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                <div className="font-semibold">{selectedTemplate.name}</div>
                <div className="mt-0.5 text-xs text-sky-600">
                  Subject: {selectedTemplate.subject}
                </div>
                <div className="mt-1 text-xs text-sky-600">
                  HTML body will be sent as-is with{" "}
                  <code className="rounded bg-sky-100 px-1">{"{{firstName}}"}</code> and{" "}
                  <code className="rounded bg-sky-100 px-1">{"{{project}}"}</code> replaced.
                </div>
              </div>
            )}

            {selectedTemplateId === INLINE_ID && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Subject</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    placeholder="Subcontractors needed for {{project}}"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700">Body (plain text)</div>
                  <textarea
                    className="mt-1 h-36 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    placeholder={`Hi {{firstName}},\n\nWe have a project at {{project}} and need subs. Reply if interested.\n\nThanks`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Property Addresses */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Property Addresses</h2>
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
            <h2 className="text-lg font-semibold text-slate-900">Test Email</h2>
            <p className="mt-1 text-xs text-slate-500">
              Send a single test using the current campaign settings. Does not
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
                disabled={testSending || !massCampaign}
                title={!massCampaign ? "Save the campaign first" : "Send a test email"}
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
                      Project used: <span className="font-medium">{testResult.projectUsed}</span>
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
                  <h2 className="text-lg font-semibold text-slate-900">Daily run history</h2>
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
                • A cron job fires every 5 min Mon–Fri and sends at your configured time — no action needed from you.
              </div>
              <div>
                • Each contact receives exactly 1 email total (sequential, never repeated).
              </div>
              <div>
                • Use <span className="font-semibold">Send Test</span> to preview the email without affecting the contact list.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
