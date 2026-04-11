"use client";

import React, { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AutomationState = {
  id: number;
  isRunning: boolean;
  activeCampaignId: string | null;
  lastOptimizedAt: string | null;
  lastInsightsFetchAt: string | null;
  lastCreativeRefreshAt: string | null;
  lastActionTaken: string | null;
  lastActionAt: string | null;
  consecutiveErrors: number;
  error: string | null;
  updatedAt: string;
};

type MetaCampaign = {
  id: string;
  name: string;
  metaCampaignId: string | null;
  status: string;
  dailyBudgetCents: number;
  cities: string[];
  startedAt: string | null;
  stoppedAt: string | null;
  error: string | null;
  createdAt: string;
};

type MetaAdSet = {
  id: string;
  city: string;
  status: string;
  dailyBudgetCents: number;
  leads: number;
  spend: number;
  pauseReason: string | null;
  ads: {
    id: string;
    status: string;
    leads: number;
    spend: number;
    clicks: number;
    impressions: number;
    pauseReason: string | null;
    variant: { angle: string; headline: string; aiScore: number | null; aiVerdict: string | null } | null;
  }[];
};

type CreativeVariant = {
  id: string;
  angle: string;
  headline: string;
  primaryText: string;
  aiScore: number | null;
  aiVerdict: string | null;
  aiNotes: string | null;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: string;
};

type PerformanceSnapshot = {
  id: string;
  snappedAt: string;
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  cpl: number | null;
  ctr: number | null;
  topCity: string | null;
  topAngle: string | null;
};

type AiReview = {
  id: string;
  type: string;
  summary: string;
  topAngle: string | null;
  topCity: string | null;
  weaknesses: string | null;
  recommendations: string | null;
  createdAt: string;
};

type DashboardData = {
  state: AutomationState | null;
  campaign: MetaCampaign | null;
  adSets: MetaAdSet[];
  creativeVariants: CreativeVariant[];
  latestSnapshot: PerformanceSnapshot | null;
  latestAiReview: AiReview | null;
  allCampaigns: MetaCampaign[];
  configOk: boolean;
  configMissing: string[];
};

// ── Small UI components ───────────────────────────────────────────────────────

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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "neutral" | "green" | "red" | "amber" | "blue";
}) {
  const border: Record<string, string> = {
    neutral: "border-slate-200",
    green: "border-emerald-300",
    red: "border-red-300",
    amber: "border-amber-300",
    blue: "border-sky-300",
  };
  const val: Record<string, string> = {
    neutral: "text-slate-800",
    green: "text-emerald-700",
    red: "text-red-600",
    amber: "text-amber-700",
    blue: "text-sky-700",
  };
  return (
    <div className={`rounded-xl border ${border[tone]} bg-white p-4 shadow-sm`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${val[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function statusTone(
  status: string
): "green" | "red" | "amber" | "blue" | "neutral" {
  if (status === "active") return "green";
  if (status === "paused") return "amber";
  if (status === "stopped" || status === "error") return "red";
  if (status === "launching") return "blue";
  return "neutral";
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function angleLabel(angle: string): string {
  const labels: Record<string, string> = {
    "zillow-of-construction": "Zillow of Construction",
    "find-active-projects": "Find Active Projects",
    "track-before-others": "Track Before Others",
    "built-for-subs": "Built for Subcontractors",
    "project-intel": "Local Project Intel",
    "more-opportunities": "More Opportunities",
  };
  return labels[angle] ?? angle;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MetaAdsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "adsets" | "creatives" | "history">("overview");

  // Launch form state
  const [cities, setCities] = useState("");
  const [dailyBudget, setDailyBudget] = useState("20");
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState("");

  // Action states
  const [actioning, setActioning] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // Creative refresh state
  const [refreshingCreatives, setRefreshingCreatives] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/meta-ads/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch {
      setError("Failed to load Meta Ads dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Auto-refresh every 30s when a campaign is active/launching
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleLaunch(e: React.FormEvent) {
    e.preventDefault();
    const cityList = cities
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);

    if (cityList.length === 0) {
      setLaunchMsg("Enter at least one city.");
      return;
    }

    const budgetCents = Math.round(parseFloat(dailyBudget) * 100);
    if (budgetCents < 100) {
      setLaunchMsg("Minimum daily budget is $1.00");
      return;
    }

    setLaunching(true);
    setLaunchMsg("Generating creatives and launching — this can take 1–2 minutes…");

    try {
      const res = await fetch("/api/meta-ads/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cities: cityList, dailyBudgetCents: budgetCents }),
      });
      const json = (await res.json()) as { ok?: boolean; adsCreated?: number; errors?: string[]; error?: string };
      if (!res.ok || !json.ok) {
        setLaunchMsg(`Launch failed: ${json.error ?? json.errors?.join("; ") ?? "Unknown error"}`);
      } else {
        setLaunchMsg(`Campaign launched — ${json.adsCreated} ads created.`);
        await load();
      }
    } catch {
      setLaunchMsg("Launch failed. Check console for details.");
    } finally {
      setLaunching(false);
    }
  }

  async function handlePause() {
    setActioning(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/meta-ads/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      setActionMsg("Campaign paused.");
      await load();
    } catch (err) {
      setActionMsg(`Error: ${String(err)}`);
    } finally {
      setActioning(false);
    }
  }

  async function handleResume() {
    setActioning(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/meta-ads/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      setActionMsg("Campaign resumed.");
      await load();
    } catch (err) {
      setActionMsg(`Error: ${String(err)}`);
    } finally {
      setActioning(false);
    }
  }

  async function handleStop() {
    if (!confirm("Stop the campaign? This will pause all Meta ads and clear automation. You can launch a new campaign afterward.")) return;
    setActioning(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/meta-ads/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      setActionMsg("Campaign stopped.");
      await load();
    } catch (err) {
      setActionMsg(`Error: ${String(err)}`);
    } finally {
      setActioning(false);
    }
  }

  async function handleRefreshCreatives() {
    setRefreshingCreatives(true);
    try {
      const res = await fetch("/api/meta-ads/creatives/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; newVariantsGenerated?: number; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      alert(`${json.newVariantsGenerated ?? 0} new creative variants generated and scored.`);
      await load();
    } catch (err) {
      alert(`Failed: ${String(err)}`);
    } finally {
      setRefreshingCreatives(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading Meta Ads…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-red-500">
        {error || "No data"}
      </div>
    );
  }

  const { state, campaign, adSets, creativeVariants, latestSnapshot, latestAiReview } = data;

  const isActive = campaign?.status === "active";
  const isPaused = campaign?.status === "paused";
  const isLaunching = campaign?.status === "launching";
  const isStopped = !campaign || campaign.status === "stopped" || campaign.status === "error";
  const canLaunch = isStopped;
  const canPause = isActive;
  const canResume = isPaused;
  const canStop = isActive || isPaused || isLaunching;

  const totalAds = adSets.flatMap((s) => s.ads).length;
  const activeAds = adSets.flatMap((s) => s.ads).filter((a) => a.status === "active").length;
  const pausedAds = adSets.flatMap((s) => s.ads).filter((a) => a.status === "paused").length;
  const activeCreatives = creativeVariants.filter((v) => v.isActive).length;

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "adsets" as const, label: "Cities / Ad Sets", badge: adSets.length },
    { key: "creatives" as const, label: "Creatives", badge: creativeVariants.length },
    { key: "history" as const, label: "History" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meta Ads</h1>
          <p className="text-sm text-slate-500">
            Automated lead-generation ads for Builders Bid Book — subcontractor audience
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actionMsg && (
            <span
              className={`text-sm ${actionMsg.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}
            >
              {actionMsg}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); void load(); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Config warning ── */}
      {!data.configOk && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Meta configuration incomplete</p>
          <p className="mt-1 text-xs text-amber-700">
            Missing environment variables: {data.configMissing.join(", ")}
          </p>
          <p className="mt-1 text-xs text-amber-600">
            Add these to your .env file before launching. See setup notes below.
          </p>
        </div>
      )}

      {/* ── Status + Primary Action ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Status */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Campaign</p>
              <div className="mt-1 flex items-center gap-2">
                <Pill tone={campaign ? statusTone(campaign.status) : "neutral"}>
                  {campaign?.status ?? "No campaign"}
                </Pill>
                {state?.isRunning && (
                  <Pill tone="blue">Automation ON</Pill>
                )}
              </div>
            </div>

            {/* Budget */}
            {campaign && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Daily Budget</p>
                <p className="mt-1 text-lg font-bold text-slate-800">
                  {fmtCents(campaign.dailyBudgetCents)}
                </p>
              </div>
            )}

            {/* Cities */}
            {campaign && campaign.cities.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cities</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {campaign.cities.map((city) => (
                    <Pill key={city} tone="blue">{city}</Pill>
                  ))}
                </div>
              </div>
            )}

            {/* Ads count */}
            {totalAds > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ads</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {activeAds} active · {pausedAds} paused
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {canStop && (
              <>
                {canPause && (
                  <button
                    onClick={() => void handlePause()}
                    disabled={actioning}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Pause All Ads
                  </button>
                )}
                {canResume && (
                  <button
                    onClick={() => void handleResume()}
                    disabled={actioning}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    Resume All Ads
                  </button>
                )}
                <button
                  onClick={() => void handleStop()}
                  disabled={actioning}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Stop Campaign
                </button>
              </>
            )}

            {canLaunch && (
              <span className="text-sm text-slate-400">
                Fill the launch form below to start
              </span>
            )}
          </div>
        </div>

        {/* Launching state */}
        {isLaunching && (
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-sm font-medium text-blue-700">
              Campaign is launching — generating AI creatives and setting up Meta ads…
            </p>
            <p className="text-xs text-blue-500 mt-1">This page refreshes automatically.</p>
          </div>
        )}

        {/* Error state */}
        {campaign?.error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">Launch error</p>
            <p className="text-xs text-red-600 mt-1 font-mono">{campaign.error}</p>
          </div>
        )}
      </div>

      {/* ── Launch Form (shown only when no active campaign) ── */}
      {canLaunch && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">Launch Meta Ads Campaign</h2>
          <form onSubmit={(e) => void handleLaunch(e)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Target Cities <span className="text-slate-400 font-normal">(one per line)</span>
                </label>
                <textarea
                  value={cities}
                  onChange={(e) => setCities(e.target.value)}
                  rows={4}
                  placeholder={"Miami, FL\nFort Lauderdale, FL\nHialeah, FL"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Format: "City, State" — e.g. Miami, FL
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Total Daily Budget ($)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Split automatically across cities. Minimum $1.00.
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-600">What happens when you launch:</p>
                  <p>1. AI generates 6 creative variants (headlines, copy, images)</p>
                  <p>2. AI judge scores and approves the best ads</p>
                  <p>3. Meta campaign, ad sets, and lead form are created</p>
                  <p>4. Ads go live targeting subcontractors in your cities</p>
                  <p>5. Automation optimizes hourly — no manual work needed</p>
                </div>
              </div>
            </div>

            {launchMsg && (
              <p
                className={`text-sm ${launchMsg.includes("failed") || launchMsg.includes("Error") ? "text-red-500" : "text-emerald-600"}`}
              >
                {launchMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={launching || !data.configOk}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {launching ? "Launching…" : "Launch Meta Ads"}
            </button>
          </form>
        </div>
      )}

      {/* ── Tabs ── */}
      {campaign && (
        <>
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white leading-none">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard
                  label="Total Spend"
                  value={fmtDollars(latestSnapshot?.spend ?? 0)}
                  sub="last 7 days"
                  tone="amber"
                />
                <StatCard
                  label="Leads"
                  value={latestSnapshot?.leads ?? 0}
                  sub="last 7 days"
                  tone="green"
                />
                <StatCard
                  label="CPL"
                  value={latestSnapshot?.cpl != null ? fmtDollars(latestSnapshot.cpl) : "—"}
                  sub="cost per lead"
                  tone={
                    latestSnapshot?.cpl != null
                      ? latestSnapshot.cpl < 20
                        ? "green"
                        : latestSnapshot.cpl < 50
                        ? "amber"
                        : "red"
                      : "neutral"
                  }
                />
                <StatCard
                  label="Clicks"
                  value={latestSnapshot?.clicks ?? 0}
                  sub={`CTR ${latestSnapshot?.ctr != null ? (latestSnapshot.ctr * 100).toFixed(2) + "%" : "—"}`}
                />
                <StatCard
                  label="Active Ads"
                  value={activeAds}
                  sub={`${pausedAds} paused`}
                  tone="blue"
                />
                <StatCard
                  label="Active Creatives"
                  value={activeCreatives}
                  tone="blue"
                  sub={`${creativeVariants.length} total`}
                />
              </div>

              {/* Top performers */}
              {latestSnapshot && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                      Best Performing City
                    </p>
                    <p className="mt-1 text-xl font-bold text-emerald-800">
                      {latestSnapshot.topCity ?? "Not enough data yet"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                      Best Performing Angle
                    </p>
                    <p className="mt-1 text-xl font-bold text-blue-800">
                      {latestSnapshot.topAngle
                        ? angleLabel(latestSnapshot.topAngle)
                        : "Not enough data yet"}
                    </p>
                  </div>
                </div>
              )}

              {/* AI Review */}
              {latestAiReview && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-slate-700">AI Performance Summary</h2>
                    <span className="text-xs text-slate-400">{fmtDate(latestAiReview.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{latestAiReview.summary}</p>
                  {latestAiReview.weaknesses && (
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs font-semibold text-amber-700">Weaknesses</p>
                      <p className="text-xs text-amber-600 mt-1">{latestAiReview.weaknesses}</p>
                    </div>
                  )}
                  {latestAiReview.recommendations && (
                    <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-xs font-semibold text-blue-700">Recommendations</p>
                      <p className="text-xs text-blue-600 mt-1">{latestAiReview.recommendations}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Automation status */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                <h2 className="font-semibold text-slate-700 mb-3">Automation Status</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <span className="text-slate-500">Status: </span>
                    <span className="font-medium text-slate-700">
                      {state?.isRunning ? "Running" : "Stopped"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Last insights: </span>
                    <span className="font-medium text-slate-700">
                      {fmtDate(state?.lastInsightsFetchAt ?? null)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Last optimized: </span>
                    <span className="font-medium text-slate-700">
                      {fmtDate(state?.lastOptimizedAt ?? null)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Last action: </span>
                    <span className="font-medium text-slate-700">
                      {state?.lastActionTaken ?? "—"}
                    </span>
                  </div>
                  {state?.consecutiveErrors && state.consecutiveErrors > 0 ? (
                    <div className="col-span-2">
                      <Pill tone="red">
                        {state.consecutiveErrors} consecutive error(s)
                      </Pill>
                      {state.error && (
                        <p className="mt-1 text-xs text-red-500 font-mono">{state.error}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* ── AD SETS TAB ── */}
          {tab === "adsets" && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-700">Cities / Ad Sets</h2>
              </div>
              {adSets.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">No ad sets created yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">City</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-right">Daily Budget</th>
                        <th className="px-4 py-2 text-right">Spend</th>
                        <th className="px-4 py-2 text-right">Leads</th>
                        <th className="px-4 py-2 text-right">CPL</th>
                        <th className="px-4 py-2 text-right">Ads</th>
                        <th className="px-4 py-2 text-left">Pause Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adSets.map((adSet) => {
                        const cpl = adSet.leads > 0 ? adSet.spend / adSet.leads : null;
                        return (
                          <tr key={adSet.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-700">{adSet.city}</td>
                            <td className="px-4 py-2">
                              <Pill tone={statusTone(adSet.status)}>{adSet.status}</Pill>
                            </td>
                            <td className="px-4 py-2 text-right">
                              {fmtCents(adSet.dailyBudgetCents)}
                            </td>
                            <td className="px-4 py-2 text-right text-amber-700 font-semibold">
                              {fmtDollars(adSet.spend)}
                            </td>
                            <td className="px-4 py-2 text-right text-emerald-600 font-bold">
                              {adSet.leads}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {cpl != null ? fmtDollars(cpl) : "—"}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span className="text-emerald-600 font-medium">
                                {adSet.ads.filter((a) => a.status === "active").length}
                              </span>
                              <span className="text-slate-400"> / {adSet.ads.length}</span>
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-400">
                              {adSet.pauseReason ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Per-ad detail */}
              {adSets.some((s) => s.ads.length > 0) && (
                <div className="border-t border-slate-100">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-600">Individual Ads</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">City</th>
                          <th className="px-4 py-2 text-left">Angle</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-right">Leads</th>
                          <th className="px-4 py-2 text-right">Spend</th>
                          <th className="px-4 py-2 text-right">Clicks</th>
                          <th className="px-4 py-2 text-right">Impressions</th>
                          <th className="px-4 py-2 text-left">Pause Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adSets.flatMap((s) =>
                          s.ads.map((ad) => (
                            <tr key={ad.id} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-4 py-2 text-slate-500">{s.city}</td>
                              <td className="px-4 py-2 font-medium text-slate-700">
                                {ad.variant ? angleLabel(ad.variant.angle) : "—"}
                              </td>
                              <td className="px-4 py-2">
                                <Pill tone={statusTone(ad.status)}>{ad.status}</Pill>
                              </td>
                              <td className="px-4 py-2 text-right text-emerald-600 font-bold">
                                {ad.leads}
                              </td>
                              <td className="px-4 py-2 text-right text-amber-700">
                                {fmtDollars(ad.spend)}
                              </td>
                              <td className="px-4 py-2 text-right">{ad.clicks}</td>
                              <td className="px-4 py-2 text-right">
                                {ad.impressions.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-xs text-slate-400">
                                {ad.pauseReason ?? "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CREATIVES TAB ── */}
          {tab === "creatives" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {creativeVariants.length} variants — AI-generated, scored, and linked to ads
                </p>
                <button
                  onClick={() => void handleRefreshCreatives()}
                  disabled={refreshingCreatives}
                  className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  {refreshingCreatives ? "Generating…" : "Refresh Creatives"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {creativeVariants.map((v) => (
                  <div
                    key={v.id}
                    className={`rounded-xl border bg-white shadow-sm p-4 space-y-2 ${
                      v.aiVerdict === "approved"
                        ? "border-emerald-200"
                        : v.aiVerdict === "rejected"
                        ? "border-red-200"
                        : v.aiVerdict === "needs_revision"
                        ? "border-amber-200"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Pill
                        tone={
                          v.aiVerdict === "approved"
                            ? "green"
                            : v.aiVerdict === "rejected"
                            ? "red"
                            : v.aiVerdict === "needs_revision"
                            ? "amber"
                            : "neutral"
                        }
                      >
                        {v.aiVerdict ?? "Unscored"}
                      </Pill>
                      {v.aiScore != null && (
                        <span
                          className={`text-xs font-bold ${
                            v.aiScore >= 7 ? "text-emerald-600" : v.aiScore >= 5 ? "text-amber-600" : "text-red-500"
                          }`}
                        >
                          {v.aiScore.toFixed(1)}/10
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                        {angleLabel(v.angle)}
                      </p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{v.headline}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-3">
                        {v.primaryText}
                      </p>
                    </div>

                    {v.aiNotes && (
                      <p className="text-xs text-slate-400 italic">{v.aiNotes}</p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {v.isActive && <Pill tone="blue">Active</Pill>}
                      {v.imageUrl && (
                        <a
                          href={v.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View image
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === "history" && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-700">Campaign History</h2>
              </div>
              {data.allCampaigns.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">No campaigns yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-right">Daily Budget</th>
                        <th className="px-4 py-2 text-left">Cities</th>
                        <th className="px-4 py-2 text-left">Started</th>
                        <th className="px-4 py-2 text-left">Stopped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.allCampaigns.map((c) => (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700">{c.name}</td>
                          <td className="px-4 py-2">
                            <Pill tone={statusTone(c.status)}>{c.status}</Pill>
                          </td>
                          <td className="px-4 py-2 text-right">{fmtCents(c.dailyBudgetCents)}</td>
                          <td className="px-4 py-2 text-slate-500">
                            {c.cities.join(", ")}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-400">
                            {fmtDate(c.startedAt)}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-400">
                            {fmtDate(c.stoppedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
