"use client";

import { useState, useEffect } from "react";

type LogEntry = {
  id: number;
  taskId: number | null;
  action: string;
  details: string | null;
  createdAt: string;
  task: {
    status: string;
    target: { username: string } | null;
    post: { postId: string; postUrl: string } | null;
    plan: { date: string } | null;
  } | null;
};

function actionLabel(action: string): { label: string; color: string } {
  if (action.includes("COMPLETED"))
    return { label: "Liked", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (action.includes("ALREADY_LIKED"))
    return { label: "Already Liked", color: "text-purple-700 bg-purple-50 border-purple-200" };
  if (action.includes("SKIPPED"))
    return { label: "Skipped", color: "text-slate-600 bg-slate-50 border-slate-200" };
  if (action.includes("PENDING"))
    return { label: "Reset", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (action.includes("PLAN_GENERATED"))
    return { label: "Plan Generated", color: "text-sky-700 bg-sky-50 border-sky-200" };
  return { label: action, color: "text-slate-600 bg-slate-50 border-slate-200" };
}

export default function HistoryTable() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/auto-instagram/history")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setLogs(d.logs);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {logs.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-400">
          No history yet. Actions will appear here as you work through tasks.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Plan Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Username
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Post ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const { label, color } = actionLabel(log.action);
                const username = log.task?.target?.username;
                const postId = log.task?.post?.postId;
                const postUrl = log.task?.post?.postUrl;
                const planDate = log.task?.plan?.date;
                const ts = new Date(log.createdAt);

                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap font-mono">
                      {ts.toLocaleDateString()} {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs font-mono">
                      {planDate || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {username ? `@${username}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {postId && postUrl ? (
                        <a
                          href={postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-sky-600 hover:underline"
                        >
                          {postId}
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">
                      {log.details || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
