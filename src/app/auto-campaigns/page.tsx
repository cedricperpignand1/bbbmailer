"use client";

import React, { useEffect, useMemo, useState } from "react";

type CategoryRow = {
  id: number;
  name: string;
  phaseSize: number;
  _count?: { contacts: number };
};

type TemplateRow =
  | {
      id: number;
      name: string;
      subject: string;
    }
  | null;

type AutoCampaignRow =
  | {
      id: number;
      name: string;
      active: boolean;
      categoryId: number;
      templateId: number;
      addressesText: string;
      dayOfMonth: number;
      sendHourET: number;
      sendMinuteET: number;
      createdAt: string;
      updatedAt: string;
    }
  | null;

type AutoRunRow = {
  id: number;
  monthKey: string;
  weekdayKey: string;
  ranAt: string;
  queuedCount: number;
  campaignId?: number | null;
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

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeAddresses(text: string) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.join("\n");
}

export default function AutoCampaignsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [template, setTemplate] = useState<TemplateRow>(null);
  const [autoCampaign, setAutoCampaign] = useState<AutoCampaignRow>(null);
  const [runs, setRuns] = useState<AutoRunRow[]>([]);

  // NEW: run-today UI
  const [running, setRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<any>(null);

  // form state
  const [name, setName] = useState("Monthly Project Invites");
  const [active, setActive] = useState(true);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [addressesText, setAddressesText] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [sendHourET, setSendHourET] = useState(9);
  const [sendMinuteET, setSendMinuteET] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/auto-campaigns", { cache: "no-store" });
      const data = await res.json();

      setCategories(data.categories || []);
      setTemplate(data.template || null);
      setAutoCampaign(data.autoCampaign || null);
      setRuns(data.runs || []);

      // hydrate form from saved autoCampaign if it exists
      const ac: AutoCampaignRow = data.autoCampaign || null;
      if (ac) {
        setName(ac.name || "Monthly Project Invites");
        setActive(Boolean(ac.active));
        setCategoryId(ac.categoryId ?? null);
        setAddressesText(ac.addressesText || "");
        setDayOfMonth(ac.dayOfMonth ?? 1);
        setSendHourET(ac.sendHourET ?? 9);
        setSendMinuteET(ac.sendMinuteET ?? 0);
      } else {
        // defaults
        const firstCat = data.categories?.[0]?.id ?? null;
        setCategoryId(firstCat);
        setName("Monthly Project Invites");
        setActive(true);
        setAddressesText("");
        setDayOfMonth(1);
        setSendHourET(9);
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
      addressesText: normalized,
      dayOfMonth: clampInt(Number(dayOfMonth), 1, 28),
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

  // NEW: run-today action (queues weekday bucket)
  async function runToday() {
    setRunning(true);
    setError(null);
    setOkMsg(null);
    setLastRunResult(null);

    try {
      const res = await fetch("/api/auto-campaigns/run-today?force=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Run failed");

      setLastRunResult(data);

      if (data?.skipped) {
        setOkMsg(`Skipped: ${data.reason || "no reason"}`);
      } else {
        setOkMsg(
          data?.campaignId
            ? `Queued ${data.queued} emails (Campaign #${data.campaignId}).`
            : `Run completed (queued ${data.queued || 0}).`
        );
      }

      await loadAll();
    } catch {
      setError("Run failed");
    } finally {
      setRunning(false);
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
            Monthly scheduled project invites (contacts split Mon–Fri and reused weekly).
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

          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            onClick={runToday}
            disabled={loading || saving || running}
            title="Queues today's weekday bucket into a new Campaign"
          >
            {running ? "Running..." : "Run Today"}
          </button>
        </div>
      </div>

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
            <div className="text-sm font-semibold text-slate-900">Last run result</div>
            <Pill tone="blue">run</Pill>
          </div>
          <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
            {JSON.stringify(lastRunResult, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Builder */}
        <section className="lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Auto Campaign Settings
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  One template:{" "}
                  <span className="font-semibold text-slate-900">
                    {template?.name || "Missing template"}
                  </span>
                </p>
              </div>
              <Pill tone={active ? "green" : "neutral"}>{active ? "active" : "paused"}</Pill>
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
                  Active (allow scheduling)
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
                        {c.name} ({c._count?.contacts ?? 0})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Day of month</div>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700">Hour (ET)</div>
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">Weekday batching</div>
                <div className="mt-1">
                  Contacts are deterministically split by <code>contactId % 5</code> into
                  Mon–Fri, and reused every week.
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill tone="blue">{totalContacts} contacts in list</Pill>
                  <Pill tone="amber">{addressCount} addresses</Pill>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700">
                  Property addresses (one per line)
                </div>

                <textarea
                  className="mt-1 h-40 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={addressesText}
                  onChange={(e) => setAddressesText(e.target.value)}
                  placeholder={`123 Main St Miami, FL 33101\n456 Ocean Dr Miami Beach, FL 33139\n...`}
                />

                <div className="mt-1 text-xs text-slate-500">
                  We’ll rotate addresses as we queue emails. Your email template uses{" "}
                  <code>{"{{address}}"}</code>.
                </div>
              </div>

              <button
                className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={save}
                disabled={saving || loading || running}
              >
                {saving ? "Saving..." : "Save Auto Campaign"}
              </button>
            </div>
          </div>
        </section>

        {/* Runs */}
        <section className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Recent auto runs</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    History of weekday runs (to prevent duplicates).
                  </p>
                </div>
                <Pill tone="neutral">Runs</Pill>
              </div>
            </div>

            {runs.length === 0 ? (
              <div className="p-5 text-sm text-slate-600">No runs yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-5 py-3">Month</th>
                      <th className="px-5 py-3">Weekday</th>
                      <th className="px-5 py-3">Queued</th>
                      <th className="px-5 py-3">Ran</th>
                      <th className="px-5 py-3">Campaign</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((r) => (
                      <tr key={r.id} className="text-sm">
                        <td className="px-5 py-4">{r.monthKey}</td>
                        <td className="px-5 py-4">
                          <Pill tone="blue">{r.weekdayKey}</Pill>
                        </td>
                        <td className="px-5 py-4">{r.queuedCount}</td>
                        <td className="px-5 py-4 text-slate-700">
                          {formatDateTime(r.ranAt)}
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          {r.campaignId ? `#${r.campaignId}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Tip</div>
            <div className="mt-1">
              Run Today only queues the weekday bucket. You still control sending from the
              Campaigns tab (Send 50 / Send 500) unless we wire auto-send next.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
