"use client";

import { useState } from "react";

export type Target = {
  id: number;
  username: string;
  audienceType: "FOLLOWER" | "FOLLOWING";
  isActive: boolean;
  notes: string | null;
  _count: { posts: number };
};

type Props = {
  targets: Target[];
  onRefresh: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
};

function AudiencePill({ type }: { type: "FOLLOWER" | "FOLLOWING" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        type === "FOLLOWER"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-violet-200 bg-violet-50 text-violet-700"
      }`}
    >
      {type === "FOLLOWER" ? "Follower" : "Following"}
    </span>
  );
}

export default function TargetsPanel({ targets, onRefresh, onToast }: Props) {
  const [username, setUsername] = useState("");
  const [audienceType, setAudienceType] = useState<"FOLLOWER" | "FOLLOWING">("FOLLOWER");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  async function addTarget() {
    if (!username.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/auto-instagram/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), audienceType, notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUsername("");
      setNotes("");
      onRefresh();
      onToast(`@${data.target.username} added`, "success");
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(target: Target) {
    setTogglingId(target.id);
    try {
      const res = await fetch(`/api/auto-instagram/targets/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !target.isActive }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      onRefresh();
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteTarget(id: number) {
    if (!confirm("Delete this target and all its posts?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/auto-instagram/targets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onRefresh();
      onToast("Target deleted", "success");
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Add Target Account</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="@username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTarget()}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <select
            value={audienceType}
            onChange={(e) => setAudienceType(e.target.value as "FOLLOWER" | "FOLLOWING")}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="FOLLOWER">Follower</option>
            <option value="FOLLOWING">Following</option>
          </select>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button
            onClick={addTarget}
            disabled={adding || !username.trim()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-slate-800 transition"
          >
            {adding ? "Adding…" : "Add Target"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {targets.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No targets yet. Add accounts above to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Username</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Posts</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {targets.map((t) => (
                <tr key={t.id} className={`hover:bg-slate-50 transition ${!t.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">@{t.username}</td>
                  <td className="px-4 py-3">
                    <AudiencePill type={t.audienceType} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t._count.posts}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">
                    {t.notes || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        t.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {t.isActive ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => toggleActive(t)}
                        disabled={togglingId === t.id}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
                      >
                        {t.isActive ? "Pause" : "Activate"}
                      </button>
                      <button
                        onClick={() => deleteTarget(t.id)}
                        disabled={deletingId === t.id}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
