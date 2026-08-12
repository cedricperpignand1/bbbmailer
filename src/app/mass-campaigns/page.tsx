"use client";

import React, { useEffect, useMemo, useState } from "react";
import GmassAccountsPanel from "@/components/GmassAccountsPanel";

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
  gmass1SendHourET: number | null;
  gmass1SendMinuteET: number | null;
  gmass2SendHourET: number | null;
  gmass2SendMinuteET: number | null;
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

const INLINE_ID = 0;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MassCampaignsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [campaign, setCampaign] = useState<MassCampaignRow>(null);
  const [dailyRuns, setDailyRuns] = useState<DailyRunRow[]>([]);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [toast, setToast] = useState("");

  // Campaign form state
  const [name, setName] = useState("Mass Campaign");
  const [active, setActive] = useState(false);
  const [categoryId, setCategoryId] = useState(0);
  const [templateId, setTemplateId] = useState(INLINE_ID);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [addressesText, setAddressesText] = useState("");
  const [maxPerDay, setMaxPerDay] = useState(275);
  const [gmass1Hour, setGmass1Hour] = useState(11);
  const [gmass1Minute, setGmass1Minute] = useState(0);
  const [gmass2Hour, setGmass2Hour] = useState(11);
  const [gmass2Minute, setGmass2Minute] = useState(0);

  // Test send
  const [testTo, setTestTo] = useState("");
  const [testAccountKey, setTestAccountKey] = useState<"gmass1" | "gmass2">("gmass1");
  const [testSending, setTestSending] = useState(false);

  // Manual run
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

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
        setGmass1Hour(c.gmass1SendHourET ?? c.sendHourET ?? 11);
        setGmass1Minute(c.gmass1SendMinuteET ?? c.sendMinuteET ?? 0);
        setGmass2Hour(c.gmass2SendHourET ?? c.sendHourET ?? 11);
        setGmass2Minute(c.gmass2SendMinuteET ?? c.sendMinuteET ?? 0);
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
        sendHourET: clampInt(gmass1Hour, 0, 23),
        sendMinuteET: clampInt(gmass1Minute, 0, 59),
        gmass1SendHourET: clampInt(gmass1Hour, 0, 23),
        gmass1SendMinuteET: clampInt(gmass1Minute, 0, 59),
        gmass2SendHourET: clampInt(gmass2Hour, 0, 23),
        gmass2SendMinuteET: clampInt(gmass2Minute, 0, 59),
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

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/mass-campaigns/run-due?force=1", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      const campaigns = data.campaigns ?? [];
      if (campaigns.length === 0) {
        setRunResult("No active campaigns.");
      } else {
        const summary = campaigns.map((c: any) =>
          c.skipped ? `Skipped: ${c.reason}` : `Sent ${c.totalSent ?? 0} emails`
        ).join(" | ");
        setRunResult(summary);
      }
      await loadData();
    } catch (e: any) {
      setRunResult("Error: " + e.message);
    } finally {
      setRunning(false);
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
        body: JSON.stringify({ to: testTo, accountKey: testAccountKey }),
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

  // Template body helper
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mass Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">
            Two GMass accounts, shared contact list, no duplicate sends.
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
            { label: "Sent today", val: stats.todaySent.toLocaleString() },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sending Accounts ──────────────────────────────────────────────── */}
      <GmassAccountsPanel />

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

          <Field label="Default max/day per account" help="Each account sends up to this many emails per day (overridden by warmup).">
            <Input
              type="number"
              min={1}
              max={2000}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(clampInt(Number(e.target.value), 1, 2000))}
              className="max-w-xs"
            />
          </Field>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Send times (ET)</label>
            <p className="mb-2 text-xs text-slate-500">
              Each GMass account fires at its own time — set them the same to keep both accounts sending together.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-700">GMass 1</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={gmass1Hour}
                    onChange={(e) => setGmass1Hour(clampInt(Number(e.target.value), 0, 23))}
                    placeholder="Hour"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={gmass1Minute}
                    onChange={(e) => setGmass1Minute(clampInt(Number(e.target.value), 0, 59))}
                    placeholder="Minute"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-700">GMass 2</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={gmass2Hour}
                    onChange={(e) => setGmass2Hour(clampInt(Number(e.target.value), 0, 23))}
                    placeholder="Hour"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={gmass2Minute}
                    onChange={(e) => setGmass2Minute(clampInt(Number(e.target.value), 0, 59))}
                    placeholder="Minute"
                  />
                </div>
              </div>
            </div>
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
              <Btn variant="primary" onClick={runNow} loading={running}>
                {running ? "Sending…" : "Run now"}
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
          {runResult && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
              {runResult}
            </div>
          )}
        </div>
      </Section>

      {/* ── Test Send ─────────────────────────────────────────────────────── */}
      {campaign && (
        <Section title="Test Send">
          <p className="mb-3 text-xs text-slate-500">
            Sends one email via the selected account. No DB records written.
          </p>
          <div className="flex flex-wrap gap-3">
            <select
              value={testAccountKey}
              onChange={(e) => setTestAccountKey(e.target.value as "gmass1" | "gmass2")}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              <option value="gmass1">gmass1</option>
              <option value="gmass2">gmass2</option>
            </select>
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
