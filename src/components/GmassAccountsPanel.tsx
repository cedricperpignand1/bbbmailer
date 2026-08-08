"use client";

import React, { useEffect, useMemo, useState } from "react";

type GmassAccountRow = {
  id: number;
  key: "gmass1" | "gmass2";
  label: string;
  apiKeyMasked: string;
  connected: boolean;
  fromEmail: string;
  fromName: string;
  active: boolean;
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
};

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const map: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseWarmupSchedule(csv: string): number[] {
  return csv.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
}

// ── Warm-up modal ────────────────────────────────────────────────────────────

function WarmupModal({
  account,
  onClose,
  onSave,
}: {
  account: GmassAccountRow;
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
      await onSave({ warmupEnabled: enabled, warmupSchedule: schedule, maxPerDay: clampInt(Number(maxPerDay), 1, 2000) });
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
            Warm-up Settings — {account.label || account.key}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          Gradually ramps up daily sends to protect this account&apos;s reputation. Disabled = always use max/day.
        </p>

        {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
            <span className="text-sm font-medium text-slate-700">Enable warm-up schedule</span>
          </label>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Max/day (target after warm-up)</label>
            <input
              type="number"
              min={1}
              max={2000}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Daily limits — one per day (one per line or comma-separated)</label>
            <textarea
              rows={8}
              value={schedule.split(",").join("\n")}
              onChange={(e) =>
                setSchedule(e.target.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(","))
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              {warmupDays} days configured. After day {warmupDays}, uses max/day ({clampInt(Number(maxPerDay), 1, 2000)}/day).
            </p>
          </div>

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
                      <tr key={i} className={`border-b border-slate-100 ${isToday ? "bg-amber-50" : ""}`}>
                        <td className="px-3 py-1.5 font-medium text-slate-800">{i + 1}{isToday ? " — today" : ""}</td>
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
          <button onClick={handleReset} disabled={saving} className="text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50">
            Reset warm-up to today
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Account card ─────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onSave,
  onWarmup,
  showToast,
}: {
  account: GmassAccountRow;
  onSave: (key: string, patch: object) => Promise<void>;
  onWarmup: () => void;
  showToast: (msg: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState(account.fromEmail);
  const [fromName, setFromName] = useState(account.fromName);
  const [label, setLabel] = useState(account.label);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFromEmail(account.fromEmail);
    setFromName(account.fromName);
    setLabel(account.label);
  }, [account.fromEmail, account.fromName, account.label]);

  const scheduleLen = account.warmupSchedule.split(",").filter(Boolean).length;
  const pct = account.effectiveLimit > 0 ? Math.min(100, Math.round((account.todaySent / account.effectiveLimit) * 100)) : 0;

  async function handleSave() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { fromEmail, fromName, label };
      if (apiKey.trim()) patch.apiKey = apiKey.trim();
      await onSave(account.key, patch);
      setApiKey("");
      showToast(`${account.label || account.key} saved`);
    } catch (e: any) {
      showToast("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${account.connected ? "bg-emerald-500" : "bg-slate-300"}`} />
        <span className="text-sm font-semibold text-slate-900">{account.key}</span>
        {account.connected ? <Pill tone="green">Connected</Pill> : <Pill tone="amber">Not connected</Pill>}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Label</label>
          <input
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={account.key}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">GMass API key</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={account.apiKeyMasked || "paste API key"}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">From email</label>
          <input
            type="email"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">From name</label>
          <input
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Builders Bid Book"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {account.warmupEnabled ? (
          account.warmupComplete ? (
            <Pill tone="green">Warm-up complete</Pill>
          ) : (
            <Pill tone="amber">Warm-up day {account.warmupDay} / {scheduleLen}</Pill>
          )
        ) : (
          <Pill tone="neutral">No warm-up</Pill>
        )}
        <span className="text-xs text-slate-500">Effective today: <strong>{account.effectiveLimit}</strong>/day</span>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Today: {account.todaySent} / {account.effectiveLimit}</span>
          {account.todayFailed > 0 && <span className="text-red-600">{account.todayFailed} failed</span>}
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-1 text-xs text-slate-400">Lifetime: {account.lifetimeSent.toLocaleString()} sent</div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onWarmup}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          Warm-up settings
        </button>
      </div>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function GmassAccountsPanel() {
  const [accounts, setAccounts] = useState<GmassAccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [warmupAccount, setWarmupAccount] = useState<GmassAccountRow | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/gmass/accounts", { cache: "no-store" });
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patchAccount(key: string, patch: object) {
    const res = await fetch(`/api/gmass/accounts/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Update failed");
    }
    await load();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-lg">
          {toast}
        </div>
      )}
      {warmupAccount && (
        <WarmupModal
          account={warmupAccount}
          onClose={() => setWarmupAccount(null)}
          onSave={(patch) => patchAccount(warmupAccount.key, patch)}
        />
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">GMass Sending Accounts</h2>
        {loading && (
          <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Sends round-robin across both accounts. Paste each account&apos;s GMass API key (Dashboard → Settings → API Keys) and the Gmail address/name it sends as.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {accounts.map((a) => (
          <AccountCard
            key={a.key}
            account={a}
            onSave={patchAccount}
            onWarmup={() => setWarmupAccount(a)}
            showToast={showToast}
          />
        ))}
      </div>
    </div>
  );
}
