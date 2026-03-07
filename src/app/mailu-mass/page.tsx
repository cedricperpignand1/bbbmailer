"use client";

import React, { useEffect, useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoryRow = {
  id: number;
  name: string;
  _count?: { contacts: number };
};

type TemplateRow = {
  id: number;
  name: string;
  subject: string;
};

type MailuCampaignRow = {
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
  warmupEnabled: boolean;
  warmupStartDate: string | null;
  warmupSchedule: string;
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
  bouncedCount: number;
  warmupDay: number;
  dailyLimit: number;
};

type StatsRow = {
  totalContacts: number;
  remaining: number;
  totalSent: number;
  totalFailed: number;
  totalBounced: number;
  totalAttempted: number;
  suppressionCount: number;
  sentToday: number;
};

type SmtpStatus = { configured: boolean; fromEmail: string };

// ── Small reusable components ─────────────────────────────────────────────────

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "blue" | "amber" | "purple" | "teal";
}) {
  const map: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    teal: "border-teal-200 bg-teal-50 text-teal-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function StatBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "green" | "red" | "blue" | "amber" | "purple" | "teal";
}) {
  const bg: Record<string, string> = {
    neutral: "bg-slate-50 text-slate-900",
    green: "bg-emerald-50 text-emerald-900",
    red: "bg-red-50 text-red-900",
    blue: "bg-sky-50 text-sky-900",
    amber: "bg-amber-50 text-amber-900",
    purple: "bg-purple-50 text-purple-900",
    teal: "bg-teal-50 text-teal-900",
  };
  return (
    <div className={`rounded-xl p-3 ${bg[tone]}`}>
      <div className="text-xs font-medium opacity-60">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
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

// ── Constants ─────────────────────────────────────────────────────────────────

const INLINE_ID = 0;
const DEFAULT_SCHEDULE = [20, 30, 45, 60, 80, 100, 125, 150, 180, 210, 240, 275];
const DEFAULT_SCHEDULE_STR = DEFAULT_SCHEDULE.join(", ");

function parseScheduleStr(raw: string): number[] {
  return String(raw || "")
    .split(/[\n,]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function scheduleToDisplay(csv: string): string {
  // Convert "20,30,45" → each number on its own line for the textarea
  return parseScheduleStr(csv).join("\n");
}

function displayToScheduleCsv(raw: string): string {
  return parseScheduleStr(raw).join(",");
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MailuMassPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [campaign, setCampaign] = useState<MailuCampaignRow>(null);
  const [dailyRuns, setDailyRuns] = useState<DailyRunRow[]>([]);
  const [todayRun, setTodayRun] = useState<DailyRunRow | null>(null);
  const [stats, setStats] = useState<StatsRow>({
    totalContacts: 0,
    remaining: 0,
    totalSent: 0,
    totalFailed: 0,
    totalBounced: 0,
    totalAttempted: 0,
    suppressionCount: 0,
    sentToday: 0,
  });
  const [smtp, setSmtp] = useState<SmtpStatus>({ configured: false, fromEmail: "" });

  // Test email
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok?: boolean;
    error?: string;
    projectUsed?: string;
    messageId?: string;
  } | null>(null);

  // Form state
  const [name, setName] = useState("Mailu Campaign");
  const [active, setActive] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(INLINE_ID);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [addressesText, setAddressesText] = useState("");
  const [maxPerDay, setMaxPerDay] = useState(275);
  const [sendHourET, setSendHourET] = useState(9);
  const [sendMinuteET, setSendMinuteET] = useState(0);
  const [warmupEnabled, setWarmupEnabled] = useState(true);
  // Displayed in textarea as one-per-line; saved as CSV
  const [warmupScheduleDisplay, setWarmupScheduleDisplay] = useState(
    DEFAULT_SCHEDULE.join("\n")
  );

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/mailu-campaigns", { cache: "no-store" });
      const data = await res.json();

      setCategories(data.categories || []);
      setTemplates(data.templates || []);
      setDailyRuns(data.dailyRuns || []);
      setTodayRun(data.todayRun ?? null);
      setStats(data.stats ?? {});
      setSmtp(data.smtp ?? { configured: false, fromEmail: "" });

      const c: MailuCampaignRow = data.campaign || null;
      setCampaign(c);

      if (c) {
        setName(c.name || "Mailu Campaign");
        setActive(Boolean(c.active));
        setCategoryId(c.categoryId ?? null);
        setSelectedTemplateId(c.templateId ?? INLINE_ID);
        setTemplateSubject(c.templateSubject || "");
        setTemplateBody(c.templateBody || "");
        setAddressesText(c.addressesText || "");
        setMaxPerDay(c.maxPerDay ?? 275);
        setSendHourET(c.sendHourET ?? 9);
        setSendMinuteET(c.sendMinuteET ?? 0);
        setWarmupEnabled(c.warmupEnabled !== false);
        setWarmupScheduleDisplay(
          c.warmupSchedule ? scheduleToDisplay(c.warmupSchedule) : DEFAULT_SCHEDULE.join("\n")
        );
      } else {
        setCategoryId(data.categories?.[0]?.id ?? null);
      }
    } catch {
      setError("Failed to load campaign data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Warmup computed values ───────────────────────────────────────────────────

  const scheduleNums = useMemo(
    () => parseScheduleStr(warmupScheduleDisplay),
    [warmupScheduleDisplay]
  );

  const warmupDay = useMemo(() => {
    if (!campaign?.warmupEnabled || !campaign?.warmupStartDate) return 0;
    const daysSince = Math.floor(
      (Date.now() - new Date(campaign.warmupStartDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSince + 1;
  }, [campaign]);

  const storedScheduleNums = useMemo(() => {
    if (!campaign?.warmupSchedule) return DEFAULT_SCHEDULE;
    return parseScheduleStr(campaign.warmupSchedule);
  }, [campaign]);

  const todayLimit = useMemo(() => {
    if (!campaign?.warmupEnabled || warmupDay === 0) return campaign?.maxPerDay ?? 275;
    if (warmupDay <= storedScheduleNums.length) return storedScheduleNums[warmupDay - 1];
    return campaign?.maxPerDay ?? 275;
  }, [campaign, warmupDay, storedScheduleNums]);

  const campaignStatus = useMemo(() => {
    if (!campaign) return "none";
    if (!campaign.active) return "paused";
    if (stats.remaining === 0 && stats.totalAttempted > 0) return "completed";
    if (campaign.warmupEnabled && campaign.warmupStartDate && warmupDay <= storedScheduleNums.length)
      return "warming-up";
    return "active";
  }, [campaign, warmupDay, storedScheduleNums, stats]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);

    const catId = Number(categoryId);
    if (!catId) {
      setSaving(false);
      return setError("Select a contact list (category)");
    }

    const normalized = normalizeAddresses(addressesText);
    if (!normalized) {
      setSaving(false);
      return setError("Paste at least 1 property address (one per line)");
    }

    const scheduleCsv = displayToScheduleCsv(warmupScheduleDisplay);
    if (warmupEnabled && parseScheduleStr(scheduleCsv).length === 0) {
      setSaving(false);
      return setError("Warmup schedule must have at least one number");
    }

    const payload = {
      id: campaign?.id,
      name: name.trim() || "Mailu Campaign",
      active: Boolean(active),
      categoryId: catId,
      templateId: selectedTemplateId === INLINE_ID ? null : selectedTemplateId,
      templateSubject: selectedTemplateId === INLINE_ID ? templateSubject.trim() : "",
      templateBody: selectedTemplateId === INLINE_ID ? templateBody : "",
      addressesText: normalized,
      maxPerDay: clampInt(Number(maxPerDay), 1, 1000),
      sendHourET: clampInt(Number(sendHourET), 0, 23),
      sendMinuteET: clampInt(Number(sendMinuteET), 0, 59),
      warmupEnabled,
      warmupSchedule: scheduleCsv || DEFAULT_SCHEDULE_STR,
    };

    try {
      const res = await fetch("/api/mailu-campaigns/upsert", {
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
    if (!campaign) return;
    const newActive = !campaign.active;
    try {
      const res = await fetch(`/api/mailu-campaigns/${campaign.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Toggle failed");
      setActive(newActive);
      setCampaign((prev) => (prev ? { ...prev, active: newActive } : prev));
      setOkMsg(newActive ? "Campaign started." : "Campaign paused.");
      await loadAll();
    } catch {
      setError("Toggle failed");
    }
  }

  async function resetSendHistory() {
    if (!campaign) return;
    if (
      !confirm(
        "This will clear all send history and suppression records so the list can be re-sent. Continue?"
      )
    )
      return;
    setResetting(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/mailu-campaigns/${campaign.id}/reset`, { method: "POST" });
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

  async function sendTest() {
    if (!campaign) return setError("Save the campaign first.");
    const emailTrimmed = testEmail.trim();
    if (!emailTrimmed) return setTestResult({ error: "Enter an email address." });

    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/mailu-campaigns/${campaign.id}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTrimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ error: data?.error || "Test send failed" });
      } else {
        setTestResult({ ok: true, projectUsed: data.projectUsed, messageId: data.messageId });
      }
    } catch {
      setTestResult({ error: "Test send failed — network error" });
    } finally {
      setTestSending(false);
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────

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

  // Cumulative warmup schedule for preview table
  const warmupPreviewRows = useMemo(() => {
    let cum = 0;
    return scheduleNums.map((n, i) => {
      cum += n;
      return { day: i + 1, emails: n, cumulative: cum };
    });
  }, [scheduleNums]);

  // Status badge config
  const statusBadge = useMemo(() => {
    switch (campaignStatus) {
      case "paused":
        return { label: "Paused", tone: "neutral" as const };
      case "warming-up":
        return { label: `Warming Up — Day ${warmupDay}`, tone: "amber" as const };
      case "active":
        return { label: "Active", tone: "green" as const };
      case "completed":
        return { label: "Completed", tone: "teal" as const };
      default:
        return { label: "Not configured", tone: "neutral" as const };
    }
  }, [campaignStatus, warmupDay]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-6xl">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mailu Mass</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sends automatically at your chosen time, Mon–Fri via Mailu SMTP
            {smtp.fromEmail ? ` (${smtp.fromEmail})` : ""}.
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

          {campaign && (
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
                  campaign.active
                    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
                onClick={toggleActive}
                disabled={loading || saving}
              >
                {campaign.active ? "Pause" : "Start / Resume"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── SMTP Status Banner ── */}
      {!smtp.configured && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-800">Mailu SMTP not configured</div>
          <div className="mt-1 text-xs text-amber-700">
            Set these environment variables in Vercel and redeploy:
            <code className="ml-1 rounded bg-amber-100 px-1">MAILU_SMTP_HOST</code>{" "}
            <code className="rounded bg-amber-100 px-1">MAILU_SMTP_USER</code>{" "}
            <code className="rounded bg-amber-100 px-1">MAILU_SMTP_PASS</code>{" "}
            <code className="rounded bg-amber-100 px-1">MAILU_FROM_EMAIL</code>
          </div>
        </div>
      )}

      {smtp.configured && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-sm text-emerald-800">
            <span className="font-semibold">Mailu SMTP connected</span> — {smtp.fromEmail}
          </div>
          <Pill tone="green">SMTP</Pill>
        </div>
      )}

      {/* ── Status bar ── */}
      {campaign && (
        <div
          className={`mt-4 flex items-center justify-between rounded-2xl border px-4 py-3 ${
            !campaign.active
              ? "border-slate-200 bg-slate-50 text-slate-500"
              : campaignStatus === "completed"
              ? "border-teal-200 bg-teal-50 text-teal-800"
              : campaignStatus === "warming-up"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : todayRun
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <div className="flex items-center gap-3">
            {!campaign.active ? (
              <span className="text-sm font-semibold">Campaign paused — no sends scheduled</span>
            ) : campaignStatus === "completed" ? (
              <span className="text-sm font-semibold">
                Completed — all eligible contacts have been sent to
              </span>
            ) : todayRun ? (
              <>
                <span className="text-sm font-semibold">
                  Today: sent {stats.sentToday} / {todayLimit} emails
                  {campaign.warmupEnabled && warmupDay > 0
                    ? ` (warm-up day ${warmupDay})`
                    : ""}
                </span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm font-semibold">
                  Pending — will start at{" "}
                  {String(campaign.sendHourET).padStart(2, "0")}:{String(campaign.sendMinuteET).padStart(2, "0")}{" "}
                  ET (cron runs every 5 min)
                </span>
              </>
            )}
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-30"
          >
            Refresh
          </button>
        </div>
      )}

      {/* ── Error / OK ── */}
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
        {/* ══ Left column ══════════════════════════════════════════════════════ */}
        <section className="lg:col-span-5 space-y-4">

          {/* ── Campaign Settings ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Campaign Settings</h2>
              <Pill tone={statusBadge.tone}>{statusBadge.label}</Pill>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-700">Name</div>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mailu Campaign"
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
                <div className="text-xs font-semibold text-slate-700">Contact list (Category)</div>
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
                  <div className="text-xs font-semibold text-slate-700">Max/day (target)</div>
                  <input
                    type="number"
                    min={1}
                    max={1000}
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

              {/* Stats summary */}
              {campaign && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <StatBox label="Total Contacts" value={stats.totalContacts.toLocaleString()} tone="blue" />
                  <StatBox label="Remaining Eligible" value={stats.remaining.toLocaleString()} tone="teal" />
                  <StatBox label="Total Sent" value={stats.totalSent.toLocaleString()} tone="green" />
                  <StatBox label="Failed / Bounced" value={`${stats.totalFailed} / ${stats.totalBounced}`} tone={stats.totalBounced > 0 ? "red" : "neutral"} />
                  <StatBox label="Sent Today" value={`${stats.sentToday} / ${todayLimit}`} tone="amber" />
                  <StatBox label="Suppressed Emails" value={stats.suppressionCount.toLocaleString()} tone={stats.suppressionCount > 0 ? "red" : "neutral"} />
                </div>
              )}

              <button
                className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={save}
                disabled={saving || loading}
              >
                {saving ? "Saving..." : "Save Campaign"}
              </button>
            </div>
          </div>

          {/* ── Warm-up Settings ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Warm-up Settings</h2>
            <p className="mt-1 text-xs text-slate-500">
              Gradually ramps up daily sends to protect your domain reputation. Disabled = always use the target max/day.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <input
                id="warmup"
                type="checkbox"
                checked={warmupEnabled}
                onChange={(e) => setWarmupEnabled(e.target.checked)}
              />
              <label htmlFor="warmup" className="text-sm text-slate-700">
                Enable warm-up schedule
              </label>
            </div>

            {warmupEnabled && (
              <>
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-700">
                    Daily limits — one number per day (one per line or comma-separated)
                  </div>
                  <textarea
                    className="mt-1 h-40 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={warmupScheduleDisplay}
                    onChange={(e) => setWarmupScheduleDisplay(e.target.value)}
                    placeholder={DEFAULT_SCHEDULE.join("\n")}
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    {scheduleNums.length} days of warm-up configured. After day {scheduleNums.length}, uses max/day ({maxPerDay}/day).
                  </div>
                </div>

                {/* Warm-up plan preview */}
                {warmupPreviewRows.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
                    <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      Warm-up Plan Preview
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left text-slate-500">
                          <tr>
                            <th className="px-3 py-1.5">Day</th>
                            <th className="px-3 py-1.5">Emails</th>
                            <th className="px-3 py-1.5">Cumulative</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {warmupPreviewRows.map((r) => (
                            <tr
                              key={r.day}
                              className={
                                campaign?.warmupEnabled && warmupDay === r.day
                                  ? "bg-amber-50 font-semibold"
                                  : campaign?.warmupEnabled && warmupDay > r.day
                                  ? "text-slate-400"
                                  : ""
                              }
                            >
                              <td className="px-3 py-1.5">
                                {r.day}
                                {campaign?.warmupEnabled && warmupDay === r.day && (
                                  <span className="ml-1 text-amber-600">← today</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5">{r.emails}</td>
                              <td className="px-3 py-1.5 text-slate-400">
                                {r.cumulative.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 text-slate-500">
                            <td className="px-3 py-1.5">Day {warmupPreviewRows.length + 1}+</td>
                            <td className="px-3 py-1.5">{maxPerDay}/day</td>
                            <td className="px-3 py-1.5 text-slate-400">ongoing</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {!warmupEnabled && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Warm-up disabled — will send up to <span className="font-semibold">{maxPerDay}/day</span> from day 1.
              </div>
            )}
          </div>

          {/* ── Template ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Template</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose a saved template or write a custom one below. Use{" "}
              <code className="rounded bg-slate-100 px-1">{"{{firstName}}"}</code> and{" "}
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
                <div className="mt-0.5 text-xs text-sky-600">Subject: {selectedTemplate.subject}</div>
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

          {/* ── Property Addresses ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Property Addresses</h2>
            <p className="mt-1 text-xs text-slate-500">
              One per line. A random address is picked as{" "}
              <code className="rounded bg-slate-100 px-1">{"{{project}}"}</code> for each email.
            </p>
            <div className="mt-1 text-xs text-slate-400">{addressCount} address{addressCount !== 1 ? "es" : ""} entered</div>

            <textarea
              className="mt-3 h-40 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              value={addressesText}
              onChange={(e) => setAddressesText(e.target.value)}
              placeholder={`123 Main St Miami, FL 33101\n456 Ocean Dr Miami Beach, FL 33139\n...`}
            />
          </div>

          {/* ── Test Email ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Test Email</h2>
            <p className="mt-1 text-xs text-slate-500">
              Sends a single test via Mailu SMTP. Does not affect the contact list or daily limit.
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
                disabled={testSending || !campaign || !smtp.configured}
                title={
                  !smtp.configured
                    ? "Configure SMTP first"
                    : !campaign
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
                      Project used: <span className="font-medium">{testResult.projectUsed}</span>
                    </div>
                    {testResult.messageId && (
                      <div className="mt-0.5 text-xs text-emerald-600">
                        Message-ID: {testResult.messageId}
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

        {/* ══ Right column ═════════════════════════════════════════════════════ */}
        <section className="lg:col-span-7 space-y-4">
          {/* ── Daily run history ── */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Daily run history</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Each row shows one day's accumulated sends (multiple 20-email batches).
                  </p>
                </div>
                <Pill tone="purple">Mailu SMTP</Pill>
              </div>
            </div>

            {dailyRuns.length === 0 ? (
              <div className="p-5 text-sm text-slate-600">No runs yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Date (ET)</th>
                      <th className="px-4 py-3">Sent</th>
                      <th className="px-4 py-3">Failed</th>
                      <th className="px-4 py-3">Bounced</th>
                      <th className="px-4 py-3">Limit</th>
                      <th className="px-4 py-3">WU Day</th>
                      <th className="px-4 py-3">Ran at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyRuns.map((r) => (
                      <tr key={r.id} className="text-sm">
                        <td className="px-4 py-3 font-medium">{r.dateET}</td>
                        <td className="px-4 py-3">
                          <Pill tone="green">{r.sentCount}</Pill>
                        </td>
                        <td className="px-4 py-3">
                          {r.failedCount > 0 ? (
                            <Pill tone="amber">{r.failedCount}</Pill>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.bouncedCount > 0 ? (
                            <Pill tone="red">{r.bouncedCount}</Pill>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{r.dailyLimit}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {r.warmupDay > 0 ? (
                            <Pill tone="amber">Day {r.warmupDay}</Pill>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDateTime(r.ranAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── How it works ── */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">How it works</div>
            <div className="mt-1 space-y-1 text-xs">
              <div>
                • A cron job fires every 5 min Mon–Fri and sends up to 20 emails per run at your configured time.
              </div>
              <div>
                • Sends are spaced 5–10 seconds apart to avoid machine-like patterns.
              </div>
              <div>
                • Each contact receives exactly 1 email total. Hard bounces are automatically suppressed.
              </div>
              <div>
                • Warm-up gradually increases the daily limit from 20 → {maxPerDay}/day over {scheduleNums.length} days.
              </div>
              <div>
                • Use <span className="font-semibold">Reset List</span> to clear send history and restart the campaign from scratch.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
