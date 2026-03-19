"use client";

import { useState } from "react";

type Settings = {
  id?: number;
  dailyGoal: number;
  startTime: string;
  endTime: string;
  includeFollowers: boolean;
  includeFollowing: boolean;
};

type Props = {
  settings: Settings | null;
  onSaved: (s: Settings) => void;
  onToast: (msg: string, type: "success" | "error") => void;
};

export default function SettingsPanel({ settings, onSaved, onToast }: Props) {
  const [dailyGoal, setDailyGoal] = useState(String(settings?.dailyGoal ?? 50));
  const [startTime, setStartTime] = useState(settings?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(settings?.endTime ?? "17:00");
  const [includeFollowers, setIncludeFollowers] = useState(
    settings?.includeFollowers ?? true
  );
  const [includeFollowing, setIncludeFollowing] = useState(
    settings?.includeFollowing ?? true
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    const goal = Math.max(1, Math.min(500, parseInt(dailyGoal) || 50));
    setSaving(true);
    try {
      const res = await fetch("/api/auto-instagram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyGoal: goal,
          startTime,
          endTime,
          includeFollowers,
          includeFollowing,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.settings);
      onToast("Settings saved", "success");
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Engagement Settings</h2>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-slate-800 transition"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Daily goal */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Daily Goal (likes)</label>
          <input
            type="number"
            min={1}
            max={500}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Start time */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* End time */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* Audience toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setIncludeFollowers((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition ${
              includeFollowers ? "bg-slate-900" : "bg-slate-200"
            }`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                includeFollowers ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-sm text-slate-700">Include Followers</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setIncludeFollowing((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition ${
              includeFollowing ? "bg-slate-900" : "bg-slate-200"
            }`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                includeFollowing ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-sm text-slate-700">Include Following</span>
        </label>
      </div>
    </div>
  );
}
