"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CategoryRow = {
  id: number;
  name: string;
  phaseSize: number;
  _count?: { contacts: number };
};

type TemplateRow = {
  id: number;
  name: string;
  subject: string;
};

type CampaignRow = {
  id: number;
  status: string;
  createdAt: string;
  phaseNumber: number;
  categoryName: string;
  templateName: string;
  subject: string;
  counts: { queued: number; sent: number; failed: number };
};

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "blue" | "amber";
}) {
  const map: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function formatDateTime(x: string) {
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("fail") || s.includes("error")) return "red";
  if (s.includes("sent") || s.includes("done") || s.includes("complete")) return "green";
  if (s.includes("queue")) return "blue";
  if (s.includes("send")) return "amber";
  return "neutral";
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-600">{hint}</div> : null}
    </div>
  );
}

export default function CampaignsPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [phaseNumber, setPhaseNumber] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);

  const [phases, setPhases] = useState<number[]>([]);
  const [phaseSize, setPhaseSize] = useState<number>(500);

  const [loading, setLoading] = useState(false);
  const [queuing, setQueuing] = useState(false);

  const [sendingCampaignId, setSendingCampaignId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [lastQueueResult, setLastQueueResult] = useState<any>(null);
  const [lastSendResult, setLastSendResult] = useState<any>(null);

  // NEW: AbortControllers so we can cancel in-flight requests
  const queueAbortRef = useRef<AbortController | null>(null);
  const sendAbortRef = useRef<AbortController | null>(null);

  async function loadBuilder() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/builder", { cache: "no-store" });
      const data = await res.json();
      setCategories(data.categories || []);
      setTemplates(data.templates || []);

      const firstCat = data.categories?.[0]?.id ?? null;
      const firstTpl = data.templates?.[0]?.id ?? null;
      if (!categoryId && firstCat) setCategoryId(firstCat);
      if (!templateId && firstTpl) setTemplateId(firstTpl);
    } catch {
      setError("Failed to load builder data");
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaigns() {
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      // ignore
    }
  }

  async function loadPhases(catId: number) {
    setPhases([]);
    setPhaseNumber(null);
    try {
      const res = await fetch(`/api/categories/${catId}/phases`, { cache: "no-store" });
      const data = await res.json();
      setPhases(data.phases || []);
      setPhaseSize(data.phaseSize || 500);
      if ((data.phases || []).length) setPhaseNumber(data.phases[0]);
    } catch {
      setError("Failed to load phases");
    }
  }

  useEffect(() => {
    loadBuilder();
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (categoryId) loadPhases(categoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || null,
    [categories, categoryId]
  );

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => {
        acc.queued += c.counts?.queued ?? 0;
        acc.sent += c.counts?.sent ?? 0;
        acc.failed += c.counts?.failed ?? 0;
        return acc;
      },
      { queued: 0, sent: 0, failed: 0 }
    );
  }, [campaigns]);

  async function queueCampaign() {
    setError(null);
    setLastQueueResult(null);
    setLastSendResult(null);

    if (!categoryId) return setError("Select a category");
    if (!phaseNumber) return setError("Select a phase");
    if (!templateId) return setError("Select a template");

    // cancel any previous queue request
    queueAbortRef.current?.abort();
    const controller = new AbortController();
    queueAbortRef.current = controller;

    setQueuing(true);
    try {
      const res = await fetch("/api/campaigns/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, phaseNumber, templateId }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Queue failed");

      setLastQueueResult(data);
      await loadCampaigns();
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user canceled
      setError("Queue failed");
    } finally {
      setQueuing(false);
      queueAbortRef.current = null;
    }
  }

  async function sendBatch(campaignId: number, limit: number) {
    setError(null);
    setLastSendResult(null);
    setLastQueueResult(null);

    // cancel any previous send request (we only allow one at a time)
    sendAbortRef.current?.abort();
    const controller = new AbortController();
    sendAbortRef.current = controller;

    setSendingCampaignId(campaignId);

    try {
      const res = await fetch("/api/send/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, limit }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Send failed");

      setLastSendResult(data);
      await loadCampaigns();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setError(null);
        // optional: show a friendly message
        setLastSendResult({ canceled: true, message: "Canceled by user" });
        return;
      }
      setError("Send failed");
    } finally {
      setSendingCampaignId(null);
      sendAbortRef.current = null;
    }
  }

  function cancelSend() {
    sendAbortRef.current?.abort();
  }

  const phaseSizeDisplay = selectedCategory?.phaseSize ?? phaseSize;

  return (
    <main className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-600">
            Queue a phase, then send a safe batch. Always test with <b>Send 50</b> first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            onClick={loadCampaigns}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Campaigns" value={campaigns.length} />
        <Stat label="Queued" value={totals.queued} hint="Ready to send" />
        <Stat label="Sent" value={totals.sent} hint="Delivered by worker" />
        <Stat label="Failed" value={totals.failed} hint="Needs review" />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Something went wrong</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {/* Last results */}
      {(lastQueueResult || lastSendResult) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {lastQueueResult && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Last queue result</div>
                <Pill tone="blue">queued</Pill>
              </div>
              <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(lastQueueResult, null, 2)}
              </pre>
            </div>
          )}

          {lastSendResult && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Last send result</div>
                <Pill tone={lastSendResult?.canceled ? "amber" : "green"}>
                  {lastSendResult?.canceled ? "canceled" : "done"}
                </Pill>
              </div>
              <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(lastSendResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Queue builder */}
        <section className="lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Queue a campaign</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose category → phase → template. Phase size:{" "}
                  <span className="font-semibold text-slate-900">{phaseSizeDisplay}</span>
                </p>
              </div>
              <Pill tone="neutral">Step 1</Pill>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-700">Category</div>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={categoryId ?? ""}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                >
                  {categories.length === 0 ? (
                    <option value="">No categories</option>
                  ) : (
                    categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c._count?.contacts ?? 0})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700">Phase</div>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
                  value={phaseNumber ?? ""}
                  onChange={(e) => setPhaseNumber(Number(e.target.value))}
                  disabled={phases.length === 0}
                >
                  {phases.length === 0 ? (
                    <option value="">No phases yet</option>
                  ) : (
                    phases.map((p) => (
                      <option key={p} value={p}>
                        Phase {p}
                      </option>
                    ))
                  )}
                </select>
                <div className="mt-1 text-xs text-slate-500">
                  Phases appear after importing contacts.
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700">Template</div>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  value={templateId ?? ""}
                  onChange={(e) => setTemplateId(Number(e.target.value))}
                >
                  {templates.length === 0 ? (
                    <option value="">No templates</option>
                  ) : (
                    templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.subject}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="flex-1 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                  onClick={queueCampaign}
                  disabled={queuing || loading}
                >
                  {queuing ? "Queuing..." : "Queue phase"}
                </button>

                <button
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => queueAbortRef.current?.abort()}
                  disabled={!queuing}
                  title="Cancel the current queue request"
                >
                  Cancel
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">Safety workflow</div>
                <div className="mt-1">Queue → Send 50 → confirm inbox → Send 500.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Campaigns table */}
        <section className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Recent campaigns</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Track queued/sent/failed and send batches.
                  </p>
                </div>
                <Pill tone="neutral">Step 2</Pill>
              </div>
            </div>

            {campaigns.length === 0 ? (
              <div className="p-5 text-sm text-slate-600">No campaigns yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px]">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3">Phase</th>
                      <th className="px-5 py-3">Template</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Counts</th>
                      <th className="px-5 py-3">Created</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {campaigns.map((c) => {
                      const sending = sendingCampaignId === c.id;
                      const tone = statusTone(c.status) as any;

                      const queued = c.counts?.queued ?? 0;
                      const sent = c.counts?.sent ?? 0;
                      const failed = c.counts?.failed ?? 0;

                      return (
                        <tr key={c.id} className="text-sm">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">{c.categoryName}</div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="text-slate-900">Phase {c.phaseNumber}</div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">{c.templateName}</div>
                            <div className="mt-0.5 text-xs text-slate-600 line-clamp-1">
                              {c.subject}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <Pill tone={tone}>{c.status || "unknown"}</Pill>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Pill tone="blue">{queued} queued</Pill>
                              {sent > 0 && <Pill tone="green">{sent} sent</Pill>}
                              {failed > 0 && <Pill tone="red">{failed} failed</Pill>}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-slate-700">{formatDateTime(c.createdAt)}</td>

                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                                onClick={() => sendBatch(c.id, 500)}
                                disabled={sendingCampaignId !== null} // one-at-a-time
                                title="Send up to 500 queued emails for this campaign"
                              >
                                {sending ? "Sending..." : "Send 500"}
                              </button>

                              <button
                                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                                onClick={() => sendBatch(c.id, 50)}
                                disabled={sendingCampaignId !== null} // one-at-a-time
                                title="Test small batch"
                              >
                                Send 50
                              </button>

                              <button
                                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                                onClick={cancelSend}
                                disabled={!sending}
                                title="Cancel the current send request"
                              >
                                Cancel
                              </button>
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

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Rule of thumb</div>
            <div className="mt-1">
              If failed is growing, pause and review your template + list quality before scaling.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
