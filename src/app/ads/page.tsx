"use client";

import React, { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  googleCampaignId: string;
  city: string;
  dailyBudgetCents: number;
  status: string;
  createdAt: string;
};

type Metric = {
  id: string;
  campaignId: string;
  date: string;
  clicks: number;
  impressions: number;
  costMicros: string;
  conversions: number;
  invalidClicks: number;
  city: string | null;
  campaign: { name: string; city: string };
};

type Decision = {
  id: string;
  type: string;
  action: string;
  reasoning: string;
  confidence: number;
  requiresApproval: boolean;
  approved: boolean | null;
  executedAt: string | null;
  createdAt: string;
};

type Click = {
  id: string;
  ip: string;
  fraudScore: number;
  flags: string[];
  flagged: boolean;
  blocked: boolean;
  city: string | null;
  createdAt: string;
};

type IpBlock = {
  id: string;
  ip: string;
  reason: string;
  blockedAt: string;
  googleExcluded: boolean;
};

type NegativeKeyword = {
  id: string;
  text: string;
  addedBy: string;
  addedAt: string;
};

type Stats = {
  totalClicks7d: number;
  totalConversions7d: number;
  totalSpendCents7d: number;
  flaggedClicks: number;
  blockedClicks: number;
  activeCampaigns: number;
  pendingDecisions: number;
};

type DashboardData = {
  campaigns: Campaign[];
  recentMetrics: Metric[];
  recentDecisions: Decision[];
  recentClicks: Click[];
  blockedIps: IpBlock[];
  negativeKeywords: NegativeKeyword[];
  stats: Stats;
};

type Tab = "overview" | "campaigns" | "fraud" | "decisions" | "keywords";

// ── Small components ──────────────────────────────────────────────────────────

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

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confidenceColor(c: number) {
  if (c >= 0.85) return "text-emerald-600";
  if (c >= 0.6) return "text-amber-600";
  return "text-red-500";
}

function decisionTypePill(type: string) {
  const red = ["PAUSE_CAMPAIGN", "FRAUD_ALERT", "REDUCE_BUDGET"];
  const amber = ["SHIFT_CITY_BUDGET", "REDUCE_BID", "REWRITE_AD"];
  const green = ["INCREASE_BUDGET", "INCREASE_BID", "KEYWORD_EXPANSION"];
  if (red.includes(type)) return <Pill tone="red">{type}</Pill>;
  if (amber.includes(type)) return <Pill tone="amber">{type}</Pill>;
  if (green.includes(type)) return <Pill tone="green">{type}</Pill>;
  return <Pill tone="blue">{type}</Pill>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ads/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json as DashboardData);
    } catch {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, approved: boolean) {
    setDecidingId(id);
    try {
      await fetch(`/api/ads/decisions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      await load();
    } finally {
      setDecidingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading Google Ads dashboard…
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

  const { campaigns, recentMetrics, recentDecisions, recentClicks, blockedIps, negativeKeywords, stats } = data;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "campaigns", label: "Campaigns", badge: stats.activeCampaigns },
    { key: "fraud", label: "Fraud", badge: stats.flaggedClicks },
    { key: "decisions", label: "AI Decisions", badge: stats.pendingDecisions },
    { key: "keywords", label: "Negatives" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Google Ads</h1>
          <p className="text-sm text-slate-500">Builder&apos;s Bid Book — Florida Markets</p>
        </div>
        <button
          onClick={() => { setLoading(true); void load(); }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
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
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white leading-none">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Active Campaigns" value={stats.activeCampaigns} tone="blue" />
            <StatCard label="Clicks (7d)" value={stats.totalClicks7d} />
            <StatCard label="Conversions (7d)" value={stats.totalConversions7d} tone="green" />
            <StatCard
              label="Spend (7d)"
              value={`$${(stats.totalSpendCents7d / 100).toFixed(2)}`}
              tone="amber"
            />
            <StatCard label="Flagged Clicks" value={stats.flaggedClicks} tone="amber" />
            <StatCard label="Blocked Clicks" value={stats.blockedClicks} tone="red" />
            <StatCard label="Pending Decisions" value={stats.pendingDecisions} tone={stats.pendingDecisions > 0 ? "red" : "neutral"} />
          </div>

          {/* Metrics table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-700">Campaign Metrics (Last 7 Days)</h2>
            </div>
            {recentMetrics.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No metrics yet — run a daily sync first.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Campaign</th>
                      <th className="px-4 py-2 text-left">City</th>
                      <th className="px-4 py-2 text-right">Clicks</th>
                      <th className="px-4 py-2 text-right">Impr.</th>
                      <th className="px-4 py-2 text-right">Spend</th>
                      <th className="px-4 py-2 text-right">Conv.</th>
                      <th className="px-4 py-2 text-right">Invalid</th>
                      <th className="px-4 py-2 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMetrics.map((m) => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-700">{m.campaign.name}</td>
                        <td className="px-4 py-2 text-slate-500">{m.campaign.city}</td>
                        <td className="px-4 py-2 text-right">{m.clicks}</td>
                        <td className="px-4 py-2 text-right">{m.impressions.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">${(Number(m.costMicros) / 1_000_000).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{m.conversions}</td>
                        <td className="px-4 py-2 text-right text-red-500">{m.invalidClicks}</td>
                        <td className="px-4 py-2 text-slate-400 text-xs">{fmt(m.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CAMPAIGNS ── */}
      {tab === "campaigns" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-700">Campaigns</h2>
          </div>
          {campaigns.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No campaigns yet — run a sync from Google Ads first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">City</th>
                    <th className="px-4 py-2 text-right">Daily Budget</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Google ID</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-700">{c.name}</td>
                      <td className="px-4 py-2 text-slate-500">{c.city || "—"}</td>
                      <td className="px-4 py-2 text-right">${(c.dailyBudgetCents / 100).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <Pill tone={c.status === "ENABLED" ? "green" : "red"}>{c.status}</Pill>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">{c.googleCampaignId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FRAUD ── */}
      {tab === "fraud" && (
        <div className="space-y-6">
          {/* Recent clicks */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-700">Recent Click Events (Last 7 Days)</h2>
            </div>
            {recentClicks.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No click events tracked yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">IP</th>
                      <th className="px-4 py-2 text-right">Fraud Score</th>
                      <th className="px-4 py-2 text-left">Flags</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentClicks.map((c) => (
                      <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{c.ip}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-bold ${c.fraudScore >= 80 ? "text-red-600" : c.fraudScore >= 50 ? "text-amber-600" : "text-emerald-600"}`}>
                            {c.fraudScore}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {c.flags.length === 0 ? (
                              <span className="text-slate-300 text-xs">—</span>
                            ) : (
                              c.flags.map((f) => (
                                <span key={f} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600 border border-red-100">{f}</span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {c.blocked ? (
                            <Pill tone="red">BLOCKED</Pill>
                          ) : c.flagged ? (
                            <Pill tone="amber">FLAGGED</Pill>
                          ) : (
                            <Pill tone="green">CLEAN</Pill>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-400">{fmt(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Blocked IPs */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-700">Blocked IPs</h2>
            </div>
            {blockedIps.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No IPs blocked yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">IP</th>
                      <th className="px-4 py-2 text-left">Reason</th>
                      <th className="px-4 py-2 text-left">Google Excluded</th>
                      <th className="px-4 py-2 text-left">Blocked At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockedIps.map((b) => (
                      <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs text-slate-700">{b.ip}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{b.reason}</td>
                        <td className="px-4 py-2">
                          <Pill tone={b.googleExcluded ? "green" : "amber"}>
                            {b.googleExcluded ? "Yes" : "Pending"}
                          </Pill>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-400">{fmt(b.blockedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI DECISIONS ── */}
      {tab === "decisions" && (
        <div className="space-y-4">
          {recentDecisions.length === 0 && (
            <p className="text-sm text-slate-400">No AI decisions yet — trigger the weekly cron to generate some.</p>
          )}
          {recentDecisions.map((d) => (
            <div
              key={d.id}
              className={`rounded-xl border bg-white shadow-sm p-4 space-y-3 ${
                d.requiresApproval && d.approved === null
                  ? "border-amber-300"
                  : d.approved === true
                  ? "border-emerald-200"
                  : d.approved === false
                  ? "border-red-200"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {decisionTypePill(d.type)}
                <span className={`text-xs font-semibold ${confidenceColor(d.confidence)}`}>
                  {(d.confidence * 100).toFixed(0)}% confidence
                </span>
                {d.requiresApproval && d.approved === null && (
                  <Pill tone="amber">Awaiting Approval</Pill>
                )}
                {d.approved === true && <Pill tone="green">Approved</Pill>}
                {d.approved === false && <Pill tone="red">Rejected</Pill>}
                {!d.requiresApproval && d.approved === null && (
                  <Pill tone="blue">Auto-executed</Pill>
                )}
                <span className="ml-auto text-xs text-slate-400">{fmt(d.createdAt)}</span>
              </div>

              <p className="text-sm font-semibold text-slate-700">{d.action}</p>
              <p className="text-sm text-slate-500 leading-relaxed">{d.reasoning}</p>

              {d.requiresApproval && d.approved === null && (
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={decidingId === d.id}
                    onClick={() => void decide(d.id, true)}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={decidingId === d.id}
                    onClick={() => void decide(d.id, false)}
                    className="rounded-lg border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── NEGATIVE KEYWORDS ── */}
      {tab === "keywords" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Negative Keywords</h2>
            <span className="text-sm text-slate-400">{negativeKeywords.length} total</span>
          </div>
          {negativeKeywords.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">No negative keywords added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Keyword</th>
                    <th className="px-4 py-2 text-left">Added By</th>
                    <th className="px-4 py-2 text-left">Added At</th>
                  </tr>
                </thead>
                <tbody>
                  {negativeKeywords.map((k) => (
                    <tr key={k.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-700">{k.text}</td>
                      <td className="px-4 py-2">
                        <Pill tone={k.addedBy === "auto" ? "purple" : k.addedBy === "api" ? "blue" : "neutral"}>
                          {k.addedBy}
                        </Pill>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">{fmt(k.addedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
