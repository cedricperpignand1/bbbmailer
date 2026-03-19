"use client";

import { useState, useEffect, useCallback } from "react";
import SummaryCards from "./SummaryCards";
import SettingsPanel from "./SettingsPanel";
import TargetsPanel from "./TargetsPanel";
import type { Target } from "./TargetsPanel";
import ImportForm from "./ImportForm";
import TaskQueueTable from "./TaskQueueTable";
import type { Task, TaskStatus } from "./TaskQueueTable";
import HistoryTable from "./HistoryTable";

// ── Types ────────────────────────────────────────────────────────────────────

type Settings = {
  id?: number;
  dailyGoal: number;
  startTime: string;
  endTime: string;
  includeFollowers: boolean;
  includeFollowing: boolean;
};

type Plan = {
  id: number;
  date: string;
  dailyGoal: number;
  startTime: string;
  endTime: string;
  totalGenerated: number;
  totalCompleted: number;
  totalSkipped: number;
  totalAlreadyLiked: number;
  tasks: Task[];
};

type PageData = {
  settings: Settings | null;
  todaysPlan: Plan | null;
  targets: Target[];
  postCount: number;
};

type Toast = { id: number; msg: string; type: "success" | "error" };
type Tab = "queue" | "targets" | "import" | "settings" | "history";

// ── Toast system ─────────────────────────────────────────────────────────────

let toastCounter = 0;

// ── Main component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const toast = useCallback((msg: string, type: "success" | "error") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-instagram");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Load failed");
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function generatePlan(force = false) {
    setGenerating(true);
    setGenerateMsg(null);
    try {
      const res = await fetch("/api/auto-instagram/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Generation failed");
      setGenerateMsg(d.message);
      toast(d.message, "success");
      await refresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Generation failed", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleStatusChange(taskId: number, status: TaskStatus) {
    const res = await fetch(`/api/auto-instagram/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Update failed");

    // Optimistically update local state
    setData((prev) => {
      if (!prev || !prev.todaysPlan) return prev;
      const updatedTasks = prev.todaysPlan.tasks.map((t) =>
        t.id === taskId ? { ...t, status } : t
      );
      // Recompute totals
      const totalGenerated = updatedTasks.length;
      const totalCompleted = updatedTasks.filter((t) => t.status === "COMPLETED").length;
      const totalSkipped = updatedTasks.filter((t) => t.status === "SKIPPED").length;
      const totalAlreadyLiked = updatedTasks.filter((t) => t.status === "ALREADY_LIKED").length;
      return {
        ...prev,
        todaysPlan: {
          ...prev.todaysPlan!,
          tasks: updatedTasks,
          totalGenerated,
          totalCompleted,
          totalSkipped,
          totalAlreadyLiked,
        },
      };
    });
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "queue", label: "Today's Queue" },
    { key: "targets", label: "Targets" },
    { key: "import", label: "Import Posts" },
    { key: "history", label: "History" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Error: {error}
      </div>
    );
  }

  const plan = data?.todaysPlan ?? null;
  const settings = data?.settings ?? null;
  const targets = data?.targets ?? [];
  const postCount = data?.postCount ?? 0;

  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  return (
    <div className="space-y-5">
      {/* Toast stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg pointer-events-auto ${
              t.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Auto Instagram</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {today} · {postCount} posts in library · {targets.length} targets
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            ⚙ Settings
          </button>
          {plan ? (
            <button
              onClick={() => generatePlan(true)}
              disabled={generating}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition disabled:opacity-50"
            >
              {generating ? "Regenerating…" : "↺ Regenerate Plan"}
            </button>
          ) : (
            <button
              onClick={() => generatePlan(false)}
              disabled={generating}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
            >
              {generating ? "Generating…" : "⚡ Generate Today's Plan"}
            </button>
          )}
        </div>
      </div>

      {/* Settings panel (collapsible) */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSaved={(s) => {
            setData((prev) => prev ? { ...prev, settings: s } : prev);
            setShowSettings(false);
          }}
          onToast={toast}
        />
      )}

      {/* Summary cards */}
      <SummaryCards plan={plan} />

      {/* Generate message */}
      {generateMsg && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-700">
          {generateMsg}
        </div>
      )}

      {/* No plan state */}
      {!plan && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center space-y-3">
          <div className="text-slate-500 font-medium">No plan for today yet</div>
          <div className="text-xs text-slate-400">
            Make sure you have active targets and imported posts, then click "Generate Today's Plan".
          </div>
          {postCount === 0 && (
            <div className="text-xs text-amber-600 font-medium">
              ⚠ No posts in library yet. Go to Import Posts tab first.
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              tab === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {t.key === "queue" && plan && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                {plan.tasks.filter((t) => t.status === "PENDING").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {tab === "queue" && (
          <div>
            {plan ? (
              <TaskQueueTable
                tasks={plan.tasks}
                onStatusChange={handleStatusChange}
                onToast={toast}
              />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                Generate a plan above to see the task queue.
              </div>
            )}
          </div>
        )}

        {tab === "targets" && (
          <TargetsPanel
            targets={targets}
            onRefresh={refresh}
            onToast={toast}
          />
        )}

        {tab === "import" && (
          <ImportForm
            targets={targets}
            onRefresh={refresh}
            onToast={toast}
          />
        )}

        {tab === "history" && <HistoryTable />}
      </div>
    </div>
  );
}
