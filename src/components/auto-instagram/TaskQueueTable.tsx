"use client";

import { useState, useMemo } from "react";

export type TaskStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "ALREADY_LIKED";

export type Task = {
  id: number;
  planId: number;
  targetId: number;
  postIgId: number;
  scheduledAt: string | null;
  status: TaskStatus;
  notes: string | null;
  target: { username: string; audienceType: "FOLLOWER" | "FOLLOWING" };
  post: {
    postId: string;
    postUrl: string;
    thumbnailUrl: string | null;
    caption: string | null;
  };
};

type Props = {
  tasks: Task[];
  onStatusChange: (taskId: number, status: TaskStatus) => Promise<void>;
  onToast: (msg: string, type: "success" | "error") => void;
};

type Filter =
  | "all"
  | "pending"
  | "completed"
  | "skipped"
  | "already_liked"
  | "followers"
  | "following";

const STATUS_META: Record<
  TaskStatus,
  { label: string; border: string; bg: string; text: string }
> = {
  PENDING: {
    label: "Pending",
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
  },
  COMPLETED: {
    label: "Completed",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  SKIPPED: {
    label: "Skipped",
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-500",
  },
  ALREADY_LIKED: {
    label: "Already Liked",
    border: "border-purple-200",
    bg: "bg-purple-50",
    text: "text-purple-700",
  },
};

function StatusPill({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.border} ${m.bg} ${m.text}`}
    >
      {m.label}
    </span>
  );
}

function AudiencePill({ type }: { type: "FOLLOWER" | "FOLLOWING" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        type === "FOLLOWER"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-violet-200 bg-violet-50 text-violet-700"
      }`}
    >
      {type === "FOLLOWER" ? "Follower" : "Following"}
    </span>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TaskQueueTable({ tasks, onStatusChange, onToast }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let list = tasks;

    if (filter === "pending") list = list.filter((t) => t.status === "PENDING");
    else if (filter === "completed") list = list.filter((t) => t.status === "COMPLETED");
    else if (filter === "skipped") list = list.filter((t) => t.status === "SKIPPED");
    else if (filter === "already_liked") list = list.filter((t) => t.status === "ALREADY_LIKED");
    else if (filter === "followers")
      list = list.filter((t) => t.target.audienceType === "FOLLOWER");
    else if (filter === "following")
      list = list.filter((t) => t.target.audienceType === "FOLLOWING");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.target.username.toLowerCase().includes(q) ||
          t.post.postId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, filter, search]);

  async function act(taskId: number, status: TaskStatus) {
    setLoadingId(taskId);
    try {
      await onStatusChange(taskId, status);
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setLoadingId(null);
    }
  }

  const filterButtons: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${tasks.length})` },
    { key: "pending", label: `Pending (${tasks.filter((t) => t.status === "PENDING").length})` },
    { key: "completed", label: `Done (${tasks.filter((t) => t.status === "COMPLETED").length})` },
    { key: "skipped", label: `Skipped (${tasks.filter((t) => t.status === "SKIPPED").length})` },
    {
      key: "already_liked",
      label: `Liked (${tasks.filter((t) => t.status === "ALREADY_LIKED").length})`,
    },
    {
      key: "followers",
      label: `Followers (${tasks.filter((t) => t.target.audienceType === "FOLLOWER").length})`,
    },
    {
      key: "following",
      label: `Following (${tasks.filter((t) => t.target.audienceType === "FOLLOWING").length})`,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Filters + search row */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="flex flex-wrap gap-1">
          {filterButtons.map((b) => (
            <button
              key={b.key}
              onClick={() => setFilter(b.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === b.key
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search username or post ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 w-full md:w-64"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-slate-400 text-sm">No tasks match your filters.</div>
            {tasks.length === 0 && (
              <div className="text-slate-400 text-xs mt-2">
                Generate a daily plan to populate the queue.
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Audience
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Post ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((task) => {
                  const isLoading = loadingId === task.id;
                  const isDone =
                    task.status === "COMPLETED" || task.status === "ALREADY_LIKED";
                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-slate-50 transition ${isDone ? "opacity-60" : ""}`}
                    >
                      {/* Scheduled time */}
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                        {formatTime(task.scheduledAt)}
                      </td>

                      {/* Username */}
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        @{task.target.username}
                      </td>

                      {/* Audience */}
                      <td className="px-4 py-3">
                        <AudiencePill type={task.target.audienceType} />
                      </td>

                      {/* Post ID + thumbnail */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {task.post.thumbnailUrl && (
                            <img
                              src={task.post.thumbnailUrl}
                              alt=""
                              className="h-8 w-8 rounded-lg object-cover border border-slate-200 flex-shrink-0"
                            />
                          )}
                          <span className="font-mono text-xs text-slate-600 max-w-[120px] truncate">
                            {task.post.postId}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusPill status={task.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          {/* Open Post */}
                          <a
                            href={task.post.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition whitespace-nowrap"
                          >
                            Open
                          </a>

                          {/* Mark Liked / Complete */}
                          {task.status !== "COMPLETED" && task.status !== "ALREADY_LIKED" && (
                            <button
                              onClick={() => act(task.id, "COMPLETED")}
                              disabled={isLoading}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50 whitespace-nowrap"
                            >
                              ✓ Liked
                            </button>
                          )}

                          {/* Already Liked */}
                          {task.status === "PENDING" && (
                            <button
                              onClick={() => act(task.id, "ALREADY_LIKED")}
                              disabled={isLoading}
                              className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 transition disabled:opacity-50 whitespace-nowrap"
                            >
                              Already
                            </button>
                          )}

                          {/* Skip */}
                          {task.status === "PENDING" && (
                            <button
                              onClick={() => act(task.id, "SKIPPED")}
                              disabled={isLoading}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 transition disabled:opacity-50"
                            >
                              Skip
                            </button>
                          )}

                          {/* Reset */}
                          {task.status !== "PENDING" && task.status !== "COMPLETED" && task.status !== "ALREADY_LIKED" && (
                            <button
                              onClick={() => act(task.id, "PENDING")}
                              disabled={isLoading}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
