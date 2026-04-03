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

type GmailAccountRow = {
  id: number;
  email: string;
  label: string;
  connected: boolean;
  usedForMass: boolean;
  maxPerDay: number;
  warmupEnabled: boolean;
  warmupStartDate: string | null;
  warmupSchedule: string;
  effectiveLimit: number;
  warmupDay: number;
  warmupComplete: boolean;
  todaySent: number;
  todayFailed: number;
  lifetimeSent: number;
  lifetimeFailed: number;
};

type MassCampaignRow = {
  id: number;
  name: string;
  active: boolean;
  categoryId: number | null;
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

type StatsRow = {
  totalContacts: number;
  remaining: number;
  totalSent: number;
  totalFailed: number;
  totalAttempted: number;
  todaySent: number;
};

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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {help && <p className="mb-1.5 text-xs text-slate-500">{help}</p>}
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none ${props.className ?? ""}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none ${props.className ?? ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none ${props.className ?? ""}`}
    />
  );
}

function Btn({
  children,
  variant = "primary",
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  };
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${styles[variant]} ${props.className ?? ""}`}
    >
      {loading && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

function formatDateTime(x: string) {
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
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

function parseWarmupSchedule(csv: string): number[] {
  return csv.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
}

const INLINE_ID = 0;

// ── Warmup Settings Modal ─────────────────────────────────────────────────────

function WarmupModal({
  account,
  onClose,
  onSave,
}: {
  account: GmailAccountRow;
  onClose: () => void;
  onSave: (patch: object) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(account.warmupEnabled);
  const [maxPerDay, setMaxPerDay] = useState(String(account.maxPerDay));
  const [schedule, setSchedule] = useState(account.warmupSchedule);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const scheduleNums = useMemo(() => parseWarmupSchedule(schedule), [schedule]);

  const warmupDays = scheduleNums.length;
  const currentDay = account.warmupEnabled && account.warmupStartDate
    ? Math.floor((Date.now() - new Date(account.warmupStartDate).getTime()) / 86400000) + 1
    : 0;

  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      await onSave({
        warmupEnabled: enabled,
        warmupSchedule: schedule,
        maxPerDay: clampInt(Number(maxPerDay), 1, 2000),
      });
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setErr("");
    try {
      await onSave({ resetWarmup: true, warmupSchedule: schedule, maxPerDay: clampInt(Number(maxPerDay), 1, 2000) });
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Warm-up Settings — {account.label || account.email}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          Gradually ramps up daily sends to protect this account&apos;s domain reputation.
          Disabled = always use the max/day.
        </p>

        {err && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
        )}

        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
            />
            <span className="text-sm font-medium text-slate-700">Enable warm-up schedule</span>
          </label>

          <Field
            label="Max/day (target after warm-up)"
            help="The daily send limit used after warm-up completes."
          >
            <Input
              type="number"
              min={1}
              max={2000}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(e.target.value)}
            />
          </Field>

          <Field
            label="Daily limits — one number per day (one per line or comma-separated)"
          >
            <Textarea
              rows={8}
              value={schedule.split(",").join("\n")}
              onChange={(e) =>
                setSchedule(
                  e.target.value
                    .split(/[\n,]+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .join(",")
                )
              }
            />
            <p className="mt-1 text-xs text-slate-500">
              {warmupDays} days of warm-up configured. After day {warmupDays}, uses max/day ({clampInt(Number(maxPerDay), 1, 2000)}/day).
            </p>
          </Field>

          {/* Warm-up Plan Preview */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700">Warm-up Plan Preview</p>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Day</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Emails</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleNums.map((n, i) => {
                    const isToday = i + 1 === currentDay;
                    const cumul = scheduleNums.slice(0, i + 1).reduce((a, b) => a + b, 0);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-slate-100 ${isToday ? "bg-amber-50" : ""}`}
                      >
                        <td className="px-3 py-1.5 font-medium text-slate-800">
                          {i + 1}{isToday ? " — today" : ""}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700">{n}</td>
                        <td className="px-3 py-1.5 text-slate-500">{cumul}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Btn variant="ghost" onClick={handleReset} loading={saving}>
            Reset warm-up to today
          </Btn>
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>Save</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MassCampaignsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccountRow[]>([]);
  const [campaign, setCampaign] = useState<MassCampaignRow>(null);
  const [dailyRuns, setDailyRuns] = useState<DailyRunRow[]>([]);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [toast, setToast] = useState("");
  const [warmupModalAccount, setWarmupModalAccount] = useState<GmailAccountRow | null>(null);

  // Campaign form state
  const [name, setName] = useState("Mass Campaign");
  const [active, setActive] = useState(false);
  const [categoryId, setCategoryId] = useState(0);
  const [templateId, setTemplateId] = useState(INLINE_ID);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [addressesText, setAddressesText] = useState("");
  const [maxPerDay, setMaxPerDay] = useState(275);
  const [sendHourET, setSendHourET] = useState(11);
  const [sendMinuteET, setSendMinuteET] = useState(0);

  // Test send
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);

  // URL param: ?connected=email
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (connected) {
      showToast(`Connected: ${connected}`);
      window.history.replaceState({}, "", "/mass-campaigns");
    }
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/mass-campaigns");
      const data = await res.json();
      setCategories(data.categories ?? []);
      setTemplates(data.templates ?? []);
      setGmailAccounts(data.gmailAccounts ?? []);
      setDailyRuns(data.dailyRuns ?? []);
      setStats(data.stats ?? null);

      const c = data.massCampaign;
      if (c) {
        setCampaign(c);
        setName(c.name);
        setActive(c.active);
        setCategoryId(c.categoryId ?? 0);
        setTemplateId(c.templateId ?? INLINE_ID);
        setTemplateSubject(c.templateSubject ?? "");
        setTemplateBody(c.templateBody ?? "");
        setAddressesText(c.addressesText ?? "");
        setMaxPerDay(c.maxPerDay ?? 275);
        setSendHourET(c.sendHourET ?? 11);
        setSendMinuteET(c.sendMinuteET ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function saveCampaign() {
    setSaving(true);
    try {
      const payload = {
        name: name.trim() || "Mass Campaign",
        active,
        categoryId: categoryId || null,
        templateId: templateId === INLINE_ID ? null : templateId,
        templateSubject,
        templateBody,
        addressesText: normalizeAddresses(addressesText),
        maxPerDay: clampInt(maxPerDay, 1, 2000),
        sendHourET: clampInt(sendHourET, 0, 23),
        sendMinuteET: clampInt(sendMinuteET, 0, 59),
      };
      const res = await fetch("/api/mass-campaigns/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      showToast("Campaign saved");
      await loadData();
    } catch (e: any) {
      showToast("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!campaign) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/mass-campaigns/${campaign.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !campaign.active }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Toggle failed");
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function resetCampaign() {
    if (!campaign) return;
    if (!confirm("Reset all send history for this campaign? This cannot be undone.")) return;
    setResetting(true);
    try {
      await fetch(`/api/mass-campaigns/${campaign.id}/reset`, { method: "POST" });
      showToast("Campaign reset");
      await loadData();
    } finally {
      setResetting(false);
    }
  }

  async function sendTestEmail() {
    if (!testTo || !campaign) return;
    setTestSending(true);
    try {
      const res = await fetch(`/api/mass-campaigns/${campaign.id}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      showToast("Test email sent to " + testTo);
    } catch (e: any) {
      showToast("Error: " + e.message);
    } finally {
      setTestSending(false);
    }
  }

  async function patchAccount(id: number, patch: object) {
    const res = await fetch(`/api/gmail/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Update failed");
    }
    await loadData();
  }

  async function disconnectAccount(id: number, email: string) {
    if (!confirm(`Disconnect ${email}? This clears the token and removes it from sending.`)) return;
    await patchAccount(id, { usedForMass: false });
    await fetch(`/api/gmail/accounts/${id}`, { method: "DELETE" });
    showToast(`Disconnected ${email}`);
    await loadData();
  }

  // Template body helper
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId]
  );

  // Accounts in pool vs not
  const activeAccounts = gmailAccounts.filter((a) => a.usedForMass && a.connected);
  const inactiveAccounts = gmailAccounts.filter((a) => !a.usedForMass || !a.connected);

  // Total today's sends
  const totalTodaySent = activeAccounts.reduce((s, a) => s + a.todaySent, 0);
  const totalEffectiveLimit = activeAccounts.reduce((s, a) => s + a.effectiveLimit, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-lg">
          {toast}
        </div>
      )}

      {/* Warmup modal */}
      {warmupModalAccount && (
        <WarmupModal
          account={warmupModalAccount}
          onClose={() => setWarmupModalAccount(null)}
          onSave={async (patch) => {
            await patchAccount(warmupModalAccount.id, patch);
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mass Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">
            Multiple Gmail accounts, shared contact list, no duplicate sends.
          </p>
        </div>
        {loading && (
          <svg className="h-5 w-5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total contacts", val: stats.totalContacts.toLocaleString() },
            { label: "Remaining", val: stats.remaining.toLocaleString() },
            { label: "Lifetime sent", val: stats.totalSent.toLocaleString() },
            { label: `Sent today (${activeAccounts.length} accounts)`, val: `${totalTodaySent} / ${totalEffectiveLimit}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sending Accounts ──────────────────────────────────────────────── */}
      <Section title="Sending Accounts">
        <p className="mb-4 text-xs text-slate-500">
          Each connected account sends independently. All share the same contact list.
          Contacts never receive more than one email per campaign (across all accounts).
        </p>

        {/* Active accounts in pool */}
        {activeAccounts.length > 0 && (
          <div className="mb-4 space-y-3">
            {activeAccounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                onWarmup={() => setWarmupModalAccount(acc)}
                onToggle={() => patchAccount(acc.id, { usedForMass: !acc.usedForMass })}
                onDisconnect={() => disconnectAccount(acc.id, acc.email)}
                onLabelChange={(label) => patchAccount(acc.id, { label })}
              />
            ))}
          </div>
        )}

        {/* Connected but not in pool */}
        {inactiveAccounts.filter((a) => a.connected).map((acc) => (
          <div key={acc.id} className="mb-2 flex items-center justify-between rounded-xl border border-dashed border-slate-200 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">{acc.label || acc.email}</span>
              <span className="ml-2 text-xs text-slate-400">{acc.label ? acc.email : ""}</span>
              <Pill tone="neutral">Not in pool</Pill>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={() => patchAccount(acc.id, { usedForMass: true }).then(() => showToast(`${acc.email} added to pool`)).catch((e) => showToast("Error: " + e.message))}>
                Add to pool
              </Btn>
              <Btn variant="ghost" onClick={() => disconnectAccount(acc.id, acc.email).catch((e) => showToast("Error: " + e.message))}>
                Remove
              </Btn>
            </div>
          </div>
        ))}

        {activeAccounts.length === 0 && (
          <div className="mb-4 rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
            No active sending accounts yet. Connect a Gmail account below.
          </div>
        )}

        <div className="flex items-center gap-3">
          <a
            href="/api/mass-gmail/connect"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
          >
            + Connect Gmail Account
          </a>
          <span className="text-xs text-slate-400">
            You&apos;ll be redirected to Google to authorize. Email is auto-detected.
          </span>
        </div>
      </Section>

      {/* ── Campaign Settings ─────────────────────────────────────────────── */}
      <Section title="Campaign Settings">
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Campaign name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Contact list (category)">
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
              >
                <option value={0}>— select a list —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c._count?.contacts ?? 0} contacts)
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Default max/day per account" help="Each account sends up to this many emails per day (overridden by warmup).">
              <Input
                type="number"
                min={1}
                max={2000}
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(clampInt(Number(e.target.value), 1, 2000))}
              />
            </Field>
            <Field label="Send hour (ET)">
              <Input
                type="number"
                min={0}
                max={23}
                value={sendHourET}
                onChange={(e) => setSendHourET(clampInt(Number(e.target.value), 0, 23))}
              />
            </Field>
            <Field label="Send minute (ET)">
              <Input
                type="number"
                min={0}
                max={59}
                value={sendMinuteET}
                onChange={(e) => setSendMinuteET(clampInt(Number(e.target.value), 0, 59))}
              />
            </Field>
          </div>

          {/* Template */}
          <Field label="Template">
            <Select
              value={templateId}
              onChange={(e) => setTemplateId(Number(e.target.value))}
              className="mb-3"
            >
              <option value={INLINE_ID}>— write inline —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>

          {templateId === INLINE_ID && (
            <>
              <Field label="Subject" help="Supports {{firstName}} and {{project}}">
                <Input value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} placeholder="Subject line…" />
              </Field>
              <Field label="Body (plain text)" help="Supports {{firstName}} and {{project}}">
                <Textarea
                  rows={8}
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  placeholder="Hi {{firstName}}, …"
                />
              </Field>
            </>
          )}

          <Field label="Property addresses" help="One per line — picked randomly as {{project}}">
            <Textarea
              rows={5}
              value={addressesText}
              onChange={(e) => setAddressesText(e.target.value)}
              placeholder="123 Main St&#10;456 Oak Ave"
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Btn onClick={saveCampaign} loading={saving}>Save campaign</Btn>
          {campaign && (
            <>
              <Btn
                variant={campaign.active ? "secondary" : "secondary"}
                onClick={toggleActive}
                loading={saving}
              >
                {campaign.active ? "Pause" : "Activate"}
              </Btn>
              <Btn variant="danger" onClick={resetCampaign} loading={resetting}>
                Reset history
              </Btn>
            </>
          )}
          {campaign && (
            <div className="ml-auto flex items-center gap-2">
              <Pill tone={campaign.active ? "green" : "neutral"}>
                {campaign.active ? "Active" : "Paused"}
              </Pill>
            </div>
          )}
        </div>
      </Section>

      {/* ── Test Send ─────────────────────────────────────────────────────── */}
      {campaign && (
        <Section title="Test Send">
          <p className="mb-3 text-xs text-slate-500">
            Sends one email via the first active account. No DB records written.
          </p>
          <div className="flex gap-3">
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              className="max-w-xs"
            />
            <Btn onClick={sendTestEmail} loading={testSending} disabled={!testTo}>
              Send test
            </Btn>
          </div>
        </Section>
      )}

      {/* ── Daily Run History ─────────────────────────────────────────────── */}
      {dailyRuns.length > 0 && (
        <Section title="Daily Run History">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Sent</th>
                  <th className="pb-2 pr-4">Failed</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyRuns.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">{r.dateET}</td>
                    <td className="py-2 pr-4">
                      <Pill tone={r.sentCount > 0 ? "green" : "neutral"}>{r.sentCount}</Pill>
                    </td>
                    <td className="py-2 pr-4">
                      {r.failedCount > 0 ? (
                        <Pill tone="red">{r.failedCount}</Pill>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{formatDateTime(r.ranAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Account Card ──────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onWarmup,
  onToggle,
  onDisconnect,
  onLabelChange,
}: {
  account: GmailAccountRow;
  onWarmup: () => void;
  onToggle: () => void;
  onDisconnect: () => void;
  onLabelChange: (label: string) => void;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(account.label);

  const scheduleLen = account.warmupSchedule.split(",").filter(Boolean).length;
  const warmupProgress = account.warmupEnabled
    ? Math.min(account.warmupDay / scheduleLen, 1)
    : 1;
  const warmupPct = Math.round(warmupProgress * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Left: email + label */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            {editingLabel ? (
              <input
                autoFocus
                className="rounded border border-slate-300 px-2 py-0.5 text-sm font-medium text-slate-900 focus:outline-none"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => {
                  setEditingLabel(false);
                  if (labelDraft !== account.label) onLabelChange(labelDraft);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditingLabel(false);
                    if (labelDraft !== account.label) onLabelChange(labelDraft);
                  }
                  if (e.key === "Escape") {
                    setLabelDraft(account.label);
                    setEditingLabel(false);
                  }
                }}
              />
            ) : (
              <button
                className="text-sm font-semibold text-slate-900 hover:underline"
                onClick={() => setEditingLabel(true)}
                title="Click to edit label"
              >
                {account.label || account.email}
              </button>
            )}
            {account.label && (
              <span className="truncate text-xs text-slate-400">{account.email}</span>
            )}
          </div>

          {/* Warm-up status */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {account.warmupEnabled ? (
              account.warmupComplete ? (
                <Pill tone="green">Warm-up complete</Pill>
              ) : (
                <Pill tone="amber">Warm-up day {account.warmupDay} / {scheduleLen}</Pill>
              )
            ) : (
              <Pill tone="neutral">No warm-up</Pill>
            )}
            <span className="text-xs text-slate-500">
              Effective today: <strong>{account.effectiveLimit}</strong>/day
            </span>
          </div>

          {/* Today's progress bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Today: {account.todaySent} / {account.effectiveLimit}</span>
              {account.warmupEnabled && !account.warmupComplete && (
                <span className="text-xs text-amber-600">
                  Warm-up {warmupPct}%
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-200">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    account.effectiveLimit > 0
                      ? Math.round((account.todaySent / account.effectiveLimit) * 100)
                      : 0
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-1 text-xs text-slate-400">
            Lifetime: {(account.lifetimeSent ?? 0).toLocaleString()} sent
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={onWarmup}>
            Warm-up settings
          </Btn>
          <Btn variant="ghost" onClick={onDisconnect}>
            Disconnect
          </Btn>
        </div>
      </div>
    </div>
  );
}
