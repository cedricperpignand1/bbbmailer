"use client";

import { useState } from "react";
import type { Target } from "./TargetsPanel";

type Props = {
  targets: Target[];
  onRefresh: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
};

type Mode = "single" | "bulk";

export default function ImportForm({ targets, onRefresh, onToast }: Props) {
  const [mode, setMode] = useState<Mode>("single");

  // Single mode
  const [username, setUsername] = useState("");
  const [audienceType, setAudienceType] = useState<"FOLLOWER" | "FOLLOWING">("FOLLOWER");
  const [postId, setPostId] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [caption, setCaption] = useState("");

  // Bulk mode
  const [bulkText, setBulkText] = useState("");

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  async function importSingle() {
    if (!username.trim() || !postId.trim() || !postUrl.trim()) {
      onToast("Username, Post ID, and Post URL are required", "error");
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/auto-instagram/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          audienceType,
          postId: postId.trim(),
          postUrl: postUrl.trim(),
          thumbnailUrl: thumbnailUrl.trim() || undefined,
          caption: caption.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult({ created: data.created, skipped: data.skipped, errors: data.errors });
      if (data.created > 0) {
        setPostId("");
        setPostUrl("");
        setThumbnailUrl("");
        setCaption("");
        onRefresh();
        onToast(`Imported 1 post`, "success");
      } else {
        onToast("Post already exists (skipped)", "error");
      }
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  async function importBulk() {
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      onToast("No rows to import", "error");
      return;
    }

    // Expected format per line: username | audienceType | postId | postUrl | thumbnailUrl? | caption?
    const posts = lines.map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return {
        username: parts[0] || "",
        audienceType: parts[1] === "FOLLOWING" ? "FOLLOWING" : "FOLLOWER",
        postId: parts[2] || "",
        postUrl: parts[3] || "",
        thumbnailUrl: parts[4] || undefined,
        caption: parts[5] || undefined,
      };
    });

    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/auto-instagram/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult({ created: data.created, skipped: data.skipped, errors: data.errors });
      if (data.created > 0) {
        setBulkText("");
        onRefresh();
        onToast(`Imported ${data.created} posts, skipped ${data.skipped}`, "success");
      } else {
        onToast(`All posts already exist (${data.skipped} skipped)`, "error");
      }
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-2">
        {(["single", "bulk"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setResult(null); }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === m
                ? "bg-slate-900 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m === "single" ? "Single Post" : "Bulk Paste"}
          </button>
        ))}
      </div>

      {mode === "single" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Import Single Post</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Instagram Username</label>
              <input
                type="text"
                placeholder="@username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Audience Type</label>
              <select
                value={audienceType}
                onChange={(e) => setAudienceType(e.target.value as "FOLLOWER" | "FOLLOWING")}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="FOLLOWER">Follower</option>
                <option value="FOLLOWING">Following</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Post ID (shortcode)</label>
              <input
                type="text"
                placeholder="e.g. CxYz1234abcd"
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Post URL</label>
              <input
                type="url"
                placeholder="https://instagram.com/p/..."
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Thumbnail URL (optional)</label>
              <input
                type="url"
                placeholder="https://..."
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Caption (optional)</label>
              <input
                type="text"
                placeholder="Post caption…"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>
          <button
            onClick={importSingle}
            disabled={importing}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-slate-800 transition"
          >
            {importing ? "Importing…" : "Import Post"}
          </button>
        </div>
      )}

      {mode === "bulk" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Bulk Import</h3>
            <p className="text-xs text-slate-500 mt-1">
              One row per line. Format:{" "}
              <code className="bg-slate-100 px-1 rounded text-xs">
                username | FOLLOWER | postId | postUrl | thumbnailUrl? | caption?
              </code>
            </p>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={10}
            placeholder={
              "johndoe | FOLLOWER | CxYz1234abcd | https://instagram.com/p/CxYz1234abcd\njanesmith | FOLLOWING | AbCd5678efgh | https://instagram.com/p/AbCd5678efgh"
            }
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 resize-y"
          />
          <button
            onClick={importBulk}
            disabled={importing || !bulkText.trim()}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-slate-800 transition"
          >
            {importing ? "Importing…" : "Import All"}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-semibold text-emerald-700">✓ {result.created} imported</span>
            {result.skipped > 0 && (
              <span className="text-slate-500">{result.skipped} skipped (already exist)</span>
            )}
            {result.errors.length > 0 && (
              <span className="text-red-600">{result.errors.length} errors</span>
            )}
          </div>
          {result.errors.length > 0 && (
            <ul className="text-xs text-red-600 space-y-0.5">
              {result.errors.map((err, i) => (
                <li key={i}>• {err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Existing targets quick reference */}
      {targets.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500 mb-2">Existing targets ({targets.length})</p>
          <div className="flex flex-wrap gap-2">
            {targets.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600"
              >
                @{t.username}
                <span className={`font-semibold ${t.audienceType === "FOLLOWER" ? "text-sky-600" : "text-violet-600"}`}>
                  {t.audienceType === "FOLLOWER" ? "F" : "G"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
