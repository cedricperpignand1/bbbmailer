"use client";

import React, { useEffect, useMemo, useState } from "react";

type Category = { id: number; name: string };

type AutoSmsCampaign = {
  id: number;
  name: string;
  active: boolean;
  categoryId: number | null;
  dayOfMonth: number;
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
  status: string;
  error: string | null;
  createdAt: string;
};

export default function AutoSmsPage() {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [auto, setAuto] = useState<AutoSmsCampaign | null>(null);
  const [stats, setStats] = useState<{ phoneCount: number; addressCount: number }>({
    phoneCount: 0,
    addressCount: 0,
  });
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [phonesText, setPhonesText] = useState("");

  const weekdayLabel = useMemo(
    () => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    []
  );

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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    if (!auto) return;
    setLoading(true);
    try {
      const r = await fetch("/api/auto-sms/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(auto),
      });
      const j = await r.json();
      if (!j.ok) alert(j.error || "Save failed");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function runToday() {
    setLoading(true);
    try {
      const r = await fetch("/api/auto-sms/run-today?force=1", { method: "POST" });
      const j = await r.json();
      if (!j.ok) alert(j.error || "Run failed");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function importPhones() {
    if (!auto?.categoryId) {
      alert("Pick a Contact list (Category) first.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/auto-sms/import-phones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryId: auto.categoryId, phonesText }),
      });
      const j = await r.json();
      if (!j.ok) alert(j.error || "Import failed");
      setPhonesText("");
      await refresh();
      alert(`Imported: ${j.inserted} (parsed ${j.totalParsed}, unique ${j.normalizedUnique})`);
    } finally {
      setLoading(false);
    }
  }

  // If no auto row exists yet, render a quick-create state by saving defaults
  const canRender = Boolean(auto);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Auto SMS</h1>
            <p className="mt-1 text-sm text-slate-300">
              Monthly scheduled texts (phones split Mon–Fri and reused weekly).
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800"
              disabled={loading}
            >
              Refresh
            </button>
            <button
              onClick={runToday}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              disabled={loading}
            >
              Run Today
            </button>
          </div>
        </div>

        {!canRender ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-slate-200">
              No Auto SMS record yet. Click below to create it with defaults.
            </p>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const r = await fetch("/api/auto-sms/upsert", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  const j = await r.json();
                  if (!j.ok) alert(j.error || "Create failed");
                  await refresh();
                } finally {
                  setLoading(false);
                }
              }}
              className="mt-4 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              disabled={loading}
            >
              Create Auto SMS
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Left: Settings */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Auto SMS Settings</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    auto?.active
                      ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25"
                      : "bg-slate-700/40 text-slate-300 ring-1 ring-slate-600"
                  }`}
                >
                  {auto?.active ? "active" : "inactive"}
                </span>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm text-slate-300">Name</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={auto!.name}
                    onChange={(e) => setAuto({ ...auto!, name: e.target.value })}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={auto!.active}
                    onChange={(e) => setAuto({ ...auto!, active: e.target.checked })}
                  />
                  Active (allow scheduling)
                </label>

                <div>
                  <label className="text-sm text-slate-300">Contact list (Category)</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={auto!.categoryId ?? ""}
                    onChange={(e) =>
                      setAuto({
                        ...auto!,
                        categoryId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">No categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm text-slate-300">Day of month</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      type="number"
                      value={auto!.dayOfMonth}
                      onChange={(e) => setAuto({ ...auto!, dayOfMonth: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-300">Hour (ET)</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      type="number"
                      value={auto!.sendHourET}
                      onChange={(e) => setAuto({ ...auto!, sendHourET: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-300">Minute</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      type="number"
                      value={auto!.sendMinuteET}
                      onChange={(e) => setAuto({ ...auto!, sendMinuteET: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-300">Twilio From Number (E.164)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="+13055551212"
                    value={auto!.fromNumber}
                    onChange={(e) => setAuto({ ...auto!, fromNumber: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300">
                    Message template (supports <span className="font-mono">{"{{address}}"}</span>)

                  </label>
                  <textarea
                    className="mt-1 h-28 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={auto!.messageTemplate}
                    onChange={(e) => setAuto({ ...auto!, messageTemplate: e.target.value })}
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm font-semibold">Weekday batching</div>
                  <div className="mt-1 text-xs text-slate-300">
                    Phones are deterministically split by <span className="font-mono">phoneContact.id % 5</span>{" "}
                    into Mon–Fri and reused every week.
                  </div>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                      {stats.phoneCount} phones in list
                    </span>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                      {stats.addressCount} addresses
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-300">Property addresses (one per line)</label>
                  <textarea
                    className="mt-1 h-40 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder={"123 Main St Miami, FL 33101\n456 Ocean Dr Miami Beach, FL 33139"}
                    value={auto!.addressesText}
                    onChange={(e) => setAuto({ ...auto!, addressesText: e.target.value })}
                  />
                  <div className="mt-2 text-xs text-slate-400">
                    We rotate addresses per run. Your message template uses <span className="font-mono">{"{{address}}"}</span>.

                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-slate-300">Stop after days</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      type="number"
                      value={auto!.stopAfterDays}
                      onChange={(e) => setAuto({ ...auto!, stopAfterDays: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={save}
                      className="w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
                      disabled={loading}
                    >
                      Save Auto SMS
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Runs + Import phones + recent logs */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Recent auto runs</h2>
                </div>

                {runs.length === 0 ? (
                  <div className="mt-4 text-sm text-slate-300">No runs yet.</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {runs.map((r) => (
                      <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <div className="flex items-center justify-between text-sm">
                          <div className="font-semibold">
                            {r.monthKey} • {weekdayLabel[r.weekdayKey] ?? r.weekdayKey}
                          </div>
                          <div className="text-slate-300">{new Date(r.ranAt).toLocaleString()}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-300">
                          Sent: <span className="font-semibold text-slate-100">{r.sentCount}</span>
                          {r.error ? <span className="ml-2 text-amber-300">({r.error})</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-200">
                  <div className="font-semibold">Tip</div>
                  <div className="mt-1 text-slate-300">
                    “Run Today” queues & sends the weekday bucket. Schedule runs happen on your day-of-month at the ET time.
                    Auto-stops after your Stop After Days window.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Import phone numbers</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Paste one number per line. Best is E.164 (+1...). We’ll normalize common US formats.
                </p>

                <textarea
                  className="mt-3 h-40 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={phonesText}
                  onChange={(e) => setPhonesText(e.target.value)}
                  placeholder={"+13055551212\n305-555-1213\n(786) 555-1214"}
                />

                <button
                  onClick={importPhones}
                  className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
                  disabled={loading}
                >
                  Import phones into selected Category
                </button>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Recent sends</h2>
                {logs.length === 0 ? (
                  <div className="mt-4 text-sm text-slate-300">No sends yet.</div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {logs.map((l) => (
                      <div key={l.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <div className="flex items-center justify-between text-sm">
                          <div className="font-semibold">{l.toPhone}</div>
                          <div className="text-slate-300">{new Date(l.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="mt-1 text-xs">
                          <span
                            className={`rounded-full px-2 py-0.5 ${
                              l.status === "sent"
                                ? "bg-emerald-400/15 text-emerald-300"
                                : l.status === "failed"
                                ? "bg-rose-400/15 text-rose-300"
                                : "bg-slate-700/40 text-slate-300"
                            }`}
                          >
                            {l.status}
                          </span>
                          {l.error ? <span className="ml-2 text-rose-300">{l.error}</span> : null}
                        </div>
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
