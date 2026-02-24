"use client";

import { useEffect, useState } from "react";

type Category = { id: number; name: string; phoneCount: number };

type AutoSmsCampaign = {
  id: number;
  name: string;
  active: boolean;
  categoryId: number | null;
  sendHourET: number;
  sendMinuteET: number;
  fromNumber: string;
  messageTemplate: string;
  addressesText: string;
  stopAfterDays: number;
};

type Run = {
  id: number;
  monthKey: string;
  weekdayKey: number;
  ranAt: string;
  sentCount: number;
  error: string | null;
};

type Log = {
  id: number;
  toPhone: string;
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
};

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AutoSmsPage() {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [auto, setAuto] = useState<AutoSmsCampaign | null>(null);
  const [stats, setStats] = useState({ phoneCount: 0, addressCount: 0 });
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  // Phone list section
  const [phonesText, setPhonesText] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);

  // Address section — local edit buffer
  const [addressesText, setAddressesText] = useState("");
  const [addressesDirty, setAddressesDirty] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/auto-sms/state", { cache: "no-store" });
      const j = await r.json();
      setCategories(j.categories || []);
      setAuto(j.auto);
      setStats(j.stats || { phoneCount: 0, addressCount: 0 });
      setRuns(j.recentRuns || []);
      setLogs(j.recentLogs || []);
      if (j.auto && !addressesDirty) {
        setAddressesText(j.auto.addressesText || "");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upsert(patch: Partial<AutoSmsCampaign>) {
    setLoading(true);
    try {
      const r = await fetch("/api/auto-sms/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...auto, ...patch }),
      });
      const j = await r.json();
      if (!j.ok) alert(j.error || "Save failed");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive() {
    if (!auto) {
      // create with defaults
      await upsert({});
      return;
    }
    await upsert({ active: !auto.active });
  }

  async function saveAddresses() {
    await upsert({ addressesText });
    setAddressesDirty(false);
  }

  async function saveSettings() {
    if (!auto) return;
    await upsert(auto);
  }

  async function createList() {
    const name = newListName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const r = await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (j.error) { alert(j.error); return; }
      setNewListName("");
      setShowNewList(false);
      await refresh();
      // auto-select the new list
      if (j.category?.id) await upsert({ categoryId: j.category.id });
    } finally {
      setLoading(false);
    }
  }

  async function importPhones() {
    if (!auto?.categoryId) {
      alert("Select a phone list first.");
      return;
    }
    if (!phonesText.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/auto-sms/import-phones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryId: auto.categoryId, phonesText }),
      });
      const j = await r.json();
      if (!j.ok) { alert(j.error || "Import failed"); return; }
      setPhonesText("");
      await refresh();
      alert(`Added ${j.inserted} new numbers (${j.totalParsed} parsed, ${j.normalizedUnique} unique)`);
    } finally {
      setLoading(false);
    }
  }

  async function runNow() {
    setLoading(true);
    try {
      const r = await fetch("/api/auto-sms/run-today?force=1", { method: "POST" });
      const j = await r.json();
      if (!j.ok) alert(j.error || "Run failed");
      else alert(`Sent ${j.sent ?? 0} messages. Address used: ${j.addressUsed ?? "–"}`);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  const selectedCategory = categories.find((c) => c.id === auto?.categoryId);
  const perDay = selectedCategory ? Math.ceil(selectedCategory.phoneCount / 5) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-5 py-8">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Auto SMS</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Sends Mon–Fri at 11 am ET · contacts split into 5 daily buckets · random address each run
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              onClick={runNow}
              disabled={loading}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
            >
              Run Now
            </button>
            <button
              onClick={toggleActive}
              disabled={loading}
              className={`rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-50 ${
                auto?.active
                  ? "bg-rose-500 hover:bg-rose-400 text-white"
                  : "bg-emerald-500 hover:bg-emerald-400 text-white"
              }`}
            >
              {!auto ? "Create Campaign" : auto.active ? "Pause Campaign" : "Start Campaign"}
            </button>
          </div>
        </div>

        {/* Status strip */}
        {auto && (
          <div className="mt-4 flex flex-wrap gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              auto.active
                ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25"
                : "bg-slate-700/40 text-slate-300 ring-slate-600"
            }`}>
              {auto.active ? "Active" : "Paused"}
            </span>
            {selectedCategory && (
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {selectedCategory.phoneCount} contacts · ~{perDay}/day
              </span>
            )}
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
              {stats.addressCount} addresses
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
              Sends at {String(auto.sendHourET).padStart(2, "0")}:{String(auto.sendMinuteET).padStart(2, "0")} ET
            </span>
          </div>
        )}

        {!auto ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">No campaign yet. Click "Create Campaign" to get started.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-5">

              {/* Phone Lists */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Phone Lists</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Select a saved list or create a new one, then paste numbers to add.
                </p>

                {/* Select + New List */}
                <div className="mt-3 flex gap-2">
                  <select
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={auto.categoryId ?? ""}
                    onChange={(e) =>
                      upsert({ categoryId: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">— select a list —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phoneCount} numbers)
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewList((v) => !v)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
                  >
                    + New List
                  </button>
                </div>

                {/* Inline new list creation */}
                {showNewList && (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      placeholder="List name (e.g. Buyers Q1)"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createList()}
                    />
                    <button
                      onClick={createList}
                      disabled={loading || !newListName.trim()}
                      className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                )}

                {/* Paste phones */}
                <div className="mt-4">
                  <label className="text-xs text-slate-400">
                    Paste phone numbers (one per line — US 10-digit or E.164 +1...)
                  </label>
                  <textarea
                    className="mt-1 h-32 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono"
                    value={phonesText}
                    onChange={(e) => setPhonesText(e.target.value)}
                    placeholder={"+13055551212\n305-555-1213\n(786) 555-1214"}
                  />
                  <button
                    onClick={importPhones}
                    disabled={loading || !phonesText.trim() || !auto.categoryId}
                    className="mt-2 w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white disabled:opacity-40"
                  >
                    Add to "{selectedCategory?.name ?? "selected list"}"
                  </button>
                </div>
              </div>

              {/* Settings */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Settings</h2>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs text-slate-400">Campaign name</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={auto.name}
                      onChange={(e) => setAuto({ ...auto, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400">Send hour ET (0–23)</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        min={0}
                        max={23}
                        value={auto.sendHourET}
                        onChange={(e) => setAuto({ ...auto, sendHourET: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Minute</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        min={0}
                        max={59}
                        value={auto.sendMinuteET}
                        onChange={(e) => setAuto({ ...auto, sendMinuteET: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Telnyx from number (E.164)</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono"
                      placeholder="+13055551212"
                      value={auto.fromNumber}
                      onChange={(e) => setAuto({ ...auto, fromNumber: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">
                      Message template — use <span className="font-mono">{"{{address}}"}</span>
                    </label>
                    <textarea
                      className="mt-1 h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={auto.messageTemplate}
                      onChange={(e) => setAuto({ ...auto, messageTemplate: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Auto-stop after (days)</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      type="number"
                      value={auto.stopAfterDays}
                      onChange={(e) => setAuto({ ...auto, stopAfterDays: Number(e.target.value) })}
                    />
                  </div>

                  <button
                    onClick={saveSettings}
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white disabled:opacity-40"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-5">

              {/* Project Addresses */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Project Addresses</h2>
                  <span className="text-xs text-slate-400">{stats.addressCount} saved</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  One per line. A random address is picked for each daily send.
                </p>
                <textarea
                  className="mt-3 h-48 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  placeholder={"123 Main St Miami, FL 33101\n456 Ocean Dr Miami Beach, FL 33139"}
                  value={addressesText}
                  onChange={(e) => {
                    setAddressesText(e.target.value);
                    setAddressesDirty(true);
                  }}
                />
                <button
                  onClick={saveAddresses}
                  disabled={loading || !addressesDirty}
                  className="mt-2 w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white disabled:opacity-40"
                >
                  Save Addresses
                </button>
              </div>

              {/* Recent runs */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Recent Runs</h2>
                {runs.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No runs yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {runs.map((r) => (
                      <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {r.monthKey} · {WEEKDAY[r.weekdayKey] ?? r.weekdayKey}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(r.ranAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          Sent: <span className="font-semibold text-slate-200">{r.sentCount}</span>
                          {r.error && <span className="ml-2 text-amber-400">{r.error}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent sends */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-base font-semibold">Recent Sends</h2>
                {logs.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No sends yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {logs.map((l) => (
                      <div key={l.id} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono">{l.toPhone}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              l.status === "sent"
                                ? "bg-emerald-400/15 text-emerald-300"
                                : l.status === "failed"
                                ? "bg-rose-400/15 text-rose-300"
                                : "bg-slate-700/40 text-slate-300"
                            }`}
                          >
                            {l.status}
                          </span>
                        </div>
                        {l.body && (
                          <p className="mt-1 text-xs text-slate-400 line-clamp-1">{l.body}</p>
                        )}
                        {l.error && (
                          <p className="mt-0.5 text-xs text-rose-400">{l.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
