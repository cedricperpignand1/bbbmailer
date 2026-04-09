"use client";

import React, { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type GeneratedPost = {
  imageUrl: string;
  headline: string;
  angle: string;
  caption: string;
  imagePrompt: string;
};

type CopyState = "idle" | "copied";

// ─────────────────────────────────────────────────────────────────────────────
// Loading message rotation — shown while API is working
// ─────────────────────────────────────────────────────────────────────────────
const LOADING_MESSAGES = [
  "Crafting your content concept…",
  "Writing a scroll-stopping caption…",
  "Building your image creative…",
  "Generating DALL-E 3 image…",
  "Polishing your first comment…",
  "Almost there…",
];

// ─────────────────────────────────────────────────────────────────────────────
// Small utility: copy text to clipboard with temp "Copied!" state
// ─────────────────────────────────────────────────────────────────────────────
function useCopyButton(): [CopyState, (text: string) => void] {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setState("copied");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setState("idle"), 2000);
    });
  }

  return [state, copy];
}

// ─────────────────────────────────────────────────────────────────────────────
// CopyButton component
// ─────────────────────────────────────────────────────────────────────────────
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, copy] = useCopyButton();
  return (
    <button
      onClick={() => copy(text)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
    >
      {state === "copied" ? (
        <>
          <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill badge
// ─────────────────────────────────────────────────────────────────────────────
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "blue" | "amber" | "purple" | "yellow";
}) {
  const toneMap: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    yellow: "border-yellow-300 bg-yellow-50 text-yellow-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneMap[tone]}`}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shuffle icon SVG
// ─────────────────────────────────────────────────────────────────────────────
function ShuffleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function InstagramAiPage() {
  const [post, setPost] = useState<GeneratedPost | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [totalGenerated, setTotalGenerated] = useState<number | null>(null);

  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle loading messages while generating
  function startLoadingCycle() {
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    loadingIntervalRef.current = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 4000);
  }

  function stopLoadingCycle() {
    if (loadingIntervalRef.current) {
      clearInterval(loadingIntervalRef.current);
      loadingIntervalRef.current = null;
    }
  }

  // Fetch total count on mount
  useEffect(() => {
    fetch("/api/instagram-ai/stats")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setTotalGenerated(d.total); })
      .catch(() => {});
  }, []);

  async function shuffle() {
    setLoading(true);
    setError(null);
    startLoadingCycle();

    try {
      const res = await fetch("/api/instagram-ai/generate", {
        method: "POST",
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setPost({
        imageUrl: data.imageUrl,
        headline: data.headline,
        angle: data.angle,
        caption: data.caption,
        imagePrompt: data.imagePrompt ?? "",
      });

      setTotalGenerated((prev) => (prev !== null ? prev + 1 : 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      stopLoadingCycle();
      setLoading(false);
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopLoadingCycle(), []);

  return (
    <div className="space-y-6 p-1">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-sm">
              <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Instagram AI</h1>
          </div>
          <p className="text-sm text-slate-500">
            Generate scroll-stopping posts for{" "}
            <span className="font-semibold text-slate-700">@buildersbidbook</span>.
            Each shuffle creates a fresh concept with image, caption, and first comment.
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {totalGenerated !== null && (
            <Pill tone="purple">{totalGenerated} posts generated</Pill>
          )}
          <Pill tone="blue">DALL-E 3 + GPT-4o</Pill>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* ── Empty State + Shuffle Button ────────────────────────────────────── */}
      {!post && !loading && (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-8 py-16 text-center">
          {/* Decorative gradient blob */}
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-400/30 to-purple-500/30 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-purple-200">
              <ShuffleIcon className="h-7 w-7 text-white" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Ready to create</h2>
          <p className="text-sm text-slate-500 mb-8 max-w-xs">
            Click Shuffle to generate a complete Instagram post concept — image, caption, and first comment.
          </p>
          <button
            onClick={shuffle}
            className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-purple-200 transition hover:shadow-xl hover:shadow-purple-300 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md"
          >
            <ShuffleIcon className="h-5 w-5" />
            Shuffle
          </button>
          <p className="mt-4 text-xs text-slate-400">Takes ~20–35 seconds · Powered by OpenAI</p>
        </div>
      )}

      {/* ── Loading State ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
          {/* Spinner */}
          <div className="relative mb-6">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-slate-100 border-t-purple-500" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-pink-500 to-purple-600" />
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-800 mb-1 transition-all duration-500">
            {loadingMsg}
          </p>
          <p className="text-xs text-slate-400">
            GPT-4o + DALL-E 3 are building your creative…
          </p>

          {/* Fake progress bar */}
          <div className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full animate-[shimmer_2s_infinite] rounded-full bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 bg-[length:200%_100%]" />
          </div>
        </div>
      )}

      {/* ── Generated Post Preview ───────────────────────────────────────────── */}
      {post && !loading && (
        <div className="space-y-5">
          {/* Angle + headline metadata strip */}
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="purple">New post ready</Pill>
            {post.angle && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">
                <span className="text-slate-300">angle:</span>
                <span className="font-medium text-slate-700">{post.angle}</span>
              </span>
            )}
          </div>

          {/* Main preview card */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Generated Image */}
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl bg-slate-100 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.imageUrl}
                  alt={post.headline || "Generated Instagram image"}
                  className="w-full aspect-square object-cover"
                />
              </div>
              {/* Image action row */}
              <div className="flex items-center gap-2">
                <a
                  href={post.imageUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download image
                </a>
                <a
                  href={post.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Full size
                </a>
                <span className="text-xs text-emerald-600 font-medium ml-auto">Logo stamped ✓</span>
              </div>
            </div>

            {/* Right: Caption + First Comment */}
            <div className="space-y-4">
              {/* Caption */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-pink-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Caption</span>
                  </div>
                  <CopyButton text={post.caption} label="Copy caption" />
                </div>
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">
                  {post.caption}
                </pre>
              </div>

              {/* Image prompt (collapsed reference) */}
              <details className="group rounded-2xl border border-slate-100 bg-slate-50">
                <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-500 list-none flex items-center justify-between hover:text-slate-700">
                  <span>Image prompt used</span>
                  <svg className="h-3.5 w-3.5 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </summary>
                <div className="px-4 pb-3 space-y-2">
                  <p className="text-xs text-slate-500 leading-relaxed">{post.imagePrompt}</p>
                  <CopyButton text={post.imagePrompt} label="Copy prompt" />
                </div>
              </details>

              {/* Post checklist */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 space-y-1.5">
                <p className="text-xs font-bold text-emerald-800 mb-2">Ready to post checklist</p>
                {[
                  "Download image (logo already stamped on it)",
                  "Copy caption and paste into Instagram",
                  "Post the image",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-emerald-700">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-200 font-bold text-emerald-800">
                      {i + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Shuffle Again button ───────────────────────────────────────────── */}
          <div className="flex justify-center pt-2">
            <button
              onClick={shuffle}
              className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-purple-200 transition hover:shadow-xl hover:shadow-purple-300 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md"
            >
              <ShuffleIcon className="h-5 w-5" />
              Shuffle Again
            </button>
          </div>
        </div>
      )}

      {/* ── Info footer ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 flex flex-wrap gap-4 items-center text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-700">How it works:</span>{" "}
          Each shuffle generates a unique concept using GPT-4o, then creates the image with DALL-E 3.
          Previous posts are remembered so content stays fresh.
        </span>
        <span className="text-slate-300">|</span>
        <span>Images are saved locally with the BBB logo stamped in — they never expire.</span>
        <span className="text-slate-300">|</span>
        <span>No Instagram API — generate, download, and post manually.</span>
      </div>
    </div>
  );
}
