"use client";

import React, { useEffect, useState } from "react";

type IgConfig = {
  id: number;
  username: string;
  isActive: boolean;
  isPaused: boolean;
  target: string;
  likesPerDayMin: number;
  likesPerDayMax: number;
  likesPerTick: number;
  runHourET: number;
  runWindowHours: number;
  hasCredentials: boolean;
  hasSession: boolean;
  updatedAt: string;
};

type IgRun = {
  id: number;
  startedAt: string;
  liked: number;
  skipped: number;
  note: string;
};

type IgDailyRun = {
  likedCount: number;
} | null;

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "blue" | "amber" | "purple";
}) {
  const map: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString(undefined, {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

function etHourToDisplay(etHour: number): string {
  const suffix = etHour >= 12 ? "PM" : "AM";
  const h = etHour % 12 || 12;
  return `${h}:00 ${suffix} ET`;
}

export default function InstagramPage() {
  const [config, setConfig] = useState<IgConfig | null>(null);
  const [runs, setRuns] = useState<IgRun[]>([]);
  const [dailyRun, setDailyRun] = useState<IgDailyRun>(null);
  const [totalLikes, setTotalLikes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [target, setTarget] = useState("timeline");
  const [minLikes, setMinLikes] = useState(20);
  const [maxLikes, setMaxLikes] = useState(40);
  const [likesPerTick, setLikesPerTick] = useState(2);
  const [runHourET, setRunHourET] = useState(10);
  const [runWindowHours, setRunWindowHours] = useState(3);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram");
      const data = await res.json();
      setConfig(data.config);
      setRuns(data.runs);
      setDailyRun(data.dailyRun);
      setTotalLikes(data.totalLikes);
      setUsername(data.config.username);
      setTarget(data.config.target);
      setMinLikes(data.config.likesPerDayMin);
      setMaxLikes(data.config.likesPerDayMax);
      setLikesPerTick(data.config.likesPerTick);
      setRunHourET(data.config.runHourET);
      setRunWindowHours(data.config.runWindowHours);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        username, target,
        likesPerDayMin: minLikes, likesPerDayMax: maxLikes,
        likesPerTick, runHourET, runWindowHours,
      };
      if (password) body.igPassword = password;

      const res = await fetch("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      const cfg = await res.json();
      setConfig((prev) => ({ ...prev!, ...cfg }));
      setPassword("");
      setMsg({ ok: true, text: password ? "Settings + credentials saved." : "Settings saved." });
    } catch {
      setMsg({ ok: false, text: "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(action: "toggle-active" | "toggle-paused", value: boolean) {
    const res = await fetch("/api/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    });
    const cfg = await res.json();
    setConfig((prev) => ({ ...prev!, ...cfg }));
  }

  async function disconnect() {
    if (!confirm("Clear saved session? The bot will need to log in again on next tick.")) return;
    const res = await fetch("/api/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    const cfg = await res.json();
    setConfig((prev) => ({ ...prev!, ...cfg, hasSession: false }));
    setMsg({ ok: true, text: "Session cleared." });
  }

  if (loading) return <div className="p-8 text-slate-500 text-sm">Loading…</div>;

  const likedToday = dailyRun?.likedCount ?? 0;
  const dailyLimit = config?.likesPerDayMax ?? 40;
  const progressPct = Math.min(100, Math.round((likedToday / dailyLimit) * 100));

  // estimate ticks per day: (windowHours * 60 / 5) * likesPerTick
  const ticksPerWindow = ((config?.runWindowHours ?? 3) * 60) / 5;
  const estimatedPerDay = Math.round(ticksPerWindow * (config?.likesPerTick ?? 2));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Instagram Bot</h1>
          <p className="text-sm text-slate-500 mt-0.5">Auto-like posts on a schedule — fully serverless on Vercel</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {config?.hasSession ? <Pill tone="green">Connected</Pill> : <Pill tone="neutral">Not connected</Pill>}
          {config?.isActive ? <Pill tone="blue">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}
          {config?.isPaused && <Pill tone="amber">Paused</Pill>}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Likes" value={totalLikes.toLocaleString()} tone="purple" />
        <StatCard label="Total Sessions" value={runs.length.toLocaleString()} tone="blue" />
        <StatCard label="Liked Today" value={`${likedToday} / ${dailyLimit}`} tone="green" />
        <StatCard label="Est. / Day" value={`~${estimatedPerDay}`} tone="amber" />
      </div>

      {/* Today's progress bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>Today&apos;s progress</span>
          <span>{likedToday} / {dailyLimit} likes</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400">
          Cron runs every 5 min ·{" "}
          {config?.isActive && !config?.isPaused
            ? `window ${etHourToDisplay(config.runHourET)} – ${etHourToDisplay((config.runHourET + config.runWindowHours) % 24)}`
            : "bot is inactive"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: config */}
        <div className="lg:col-span-2 space-y-4">

          {/* Controls */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-800">Controls</h2>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-700">Active</p>
                <p className="text-xs text-slate-400">Cron will run ticks in window</p>
              </div>
              <Toggle on={!!config?.isActive} onChange={(v) => toggle("toggle-active", v)} color="emerald" />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-700">Paused</p>
                <p className="text-xs text-slate-400">Keep active but skip liking</p>
              </div>
              <Toggle on={!!config?.isPaused} onChange={(v) => toggle("toggle-paused", v)} color="amber" />
            </div>
          </div>

          {/* Settings form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Settings</h2>

            {msg && (
              <div className={`rounded-xl border px-3 py-2 text-xs font-medium ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                {msg.text}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Instagram Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="yourusername"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Password {config?.hasCredentials && <span className="text-emerald-600 font-normal">(saved — leave blank to keep)</span>}
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={config?.hasCredentials ? "••••••••" : "Enter password"}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Like posts from</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300">
                <option value="timeline">Home timeline (recommended)</option>
                <option value="followers">Followers</option>
                <option value="following">Following</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Min likes / day</label>
                <input type="number" min={1} max={200} value={minLikes} onChange={(e) => setMinLikes(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Max likes / day</label>
                <input type="number" min={1} max={300} value={maxLikes} onChange={(e) => setMaxLikes(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Likes per tick <span className="text-slate-400 font-normal">(every 5 min)</span></label>
              <input type="number" min={1} max={5} value={likesPerTick} onChange={(e) => setLikesPerTick(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Window start <span className="text-slate-400 font-normal">(Eastern Time)</span></label>
                <select value={runHourET} onChange={(e) => setRunHourET(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{etHourToDisplay(i)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Window length</label>
                <select value={runWindowHours} onChange={(e) => setRunWindowHours(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-300">
                  {[1, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h}h</option>)}
                </select>
              </div>
            </div>

            <button onClick={save} disabled={saving}
              className="w-full bg-slate-900 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition">
              {saving ? "Saving…" : "Save Settings"}
            </button>

            {config?.hasSession && (
              <button onClick={disconnect}
                className="w-full border border-red-200 text-red-600 rounded-xl px-4 py-2 text-xs font-medium hover:bg-red-50 transition">
                Clear saved session
              </button>
            )}
          </div>

          {/* Info box */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-800 space-y-1.5">
            <p className="font-semibold">How it works</p>
            <p>Vercel cron fires every 5 min. Each tick likes up to <strong>{config?.likesPerTick ?? 2} posts</strong> during your window, stopping when the daily limit is hit.</p>
            <p>Timeline mode likes posts from your home feed — the most natural pattern.</p>
            <p className="text-sky-600">First tick after saving credentials will log in and save your session automatically.</p>
          </div>
        </div>

        {/* Right: history */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800">Tick History</h2>
              <button onClick={load} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition">
                Refresh
              </button>
            </div>

            {runs.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No ticks yet. Activate the bot and wait for the next cron fire.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left font-semibold text-slate-500 pb-2 pr-3">Time</th>
                      <th className="text-right font-semibold text-slate-500 pb-2 px-2">Liked</th>
                      <th className="text-right font-semibold text-slate-500 pb-2 px-2">Skipped</th>
                      <th className="text-left font-semibold text-slate-500 pb-2 pl-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 pr-3 text-slate-600">{fmt(r.startedAt)}</td>
                        <td className="py-2.5 px-2 text-right font-semibold text-emerald-700">{r.liked || "—"}</td>
                        <td className="py-2.5 px-2 text-right text-slate-400">{r.skipped || "—"}</td>
                        <td className="py-2.5 pl-2 text-slate-400 truncate max-w-[180px]">{r.note || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {runs.length > 0 && <WeeklySummary runs={runs} />}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, color }: { on: boolean; onChange: (v: boolean) => void; color: "emerald" | "amber" }) {
  const bg = on ? (color === "emerald" ? "bg-emerald-500" : "bg-amber-400") : "bg-slate-300";
  return (
    <button onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bg}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "neutral" | "green" | "blue" | "purple" | "amber" }) {
  const accent: Record<string, string> = {
    neutral: "text-slate-900", green: "text-emerald-700",
    blue: "text-sky-700", purple: "text-purple-700", amber: "text-amber-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent[tone]}`}>{value}</p>
    </div>
  );
}

function WeeklySummary({ runs }: { runs: IgRun[] }) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = runs.filter((r) => new Date(r.startedAt) >= cutoff);
  const weekLikes = recent.reduce((s, r) => s + r.liked, 0);

  // Group by day
  const byDay: Record<string, number> = {};
  for (const r of recent) {
    const day = r.startedAt.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + r.liked;
  }
  const days = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  const maxVal = Math.max(...days.map((d) => d[1]), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">Last 7 Days</h2>
        <span className="text-xs text-slate-400">{weekLikes} total likes</span>
      </div>
      {days.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">No activity yet.</p>
      ) : (
        <div className="flex items-end gap-1.5 h-16">
          {days.map(([day, count]) => (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-purple-400"
                style={{ height: `${Math.round((count / maxVal) * 52)}px` }}
                title={`${day}: ${count} likes`}
              />
              <span className="text-[10px] text-slate-400">{day.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
