"use client";

import React, { useEffect, useMemo, useState } from "react";

type TemplateRow = {
  id: number;
  name: string;
  subject: string;
  html: string;
  createdAt: string;
};

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "blue";
}) {
  const map: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
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

function Tab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl px-3 py-2 text-sm font-semibold transition",
        active
          ? "bg-slate-900 text-white shadow-sm"
          : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(
    `<div style="font-family:Arial,Helvetica,sans-serif; line-height:1.5;">
  <h2 style="margin:0 0 12px 0;">Quick bid request</h2>
  <p>Hey — we have a project in Miami we’re sending out for pricing.</p>
  <p>Can you take a look and send your proposal?</p>
  <p style="margin-top:16px;">– Cedric</p>
</div>`
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"html" | "preview">("html");

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", { cache: "no-store" });
      const data = await res.json();
      setTemplates(data.templates || []);
      if (!selectedId && data.templates?.[0]?.id) setSelectedId(data.templates[0].id);
    } catch {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) || null,
    [templates, selectedId]
  );

  function loadIntoEditor(t: TemplateRow) {
    setSelectedId(t.id);
    setName(t.name);
    setSubject(t.subject);
    setHtml(t.html);
    setError(null);
  }

  function createNew() {
    setSelectedId(null);
    setName("");
    setSubject("");
    setHtml("");
    setError(null);
    setTab("html");
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Template name is required");
    if (!subject.trim()) return setError("Subject is required");
    if (!html.trim()) return setError("HTML is required");

    setSaving(true);
    try {
      if (selectedId) {
        const res = await fetch(`/api/templates/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, subject, html }),
        });
        const data = await res.json();
        if (!res.ok) return setError(data?.error || "Failed to update");
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, subject, html }),
        });
        const data = await res.json();
        if (!res.ok) return setError(data?.error || "Failed to create");
        setSelectedId(data.template.id);
      }
      await loadTemplates();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedId) return;
    if (!confirm("Delete this template?")) return;

    setError(null);
    try {
      const res = await fetch(`/api/templates/${selectedId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Failed to delete");

      setSelectedId(null);
      setName("");
      setSubject("");
      setHtml("");
      await loadTemplates();
    } catch {
      setError("Delete failed");
    }
  }

  // safety strip scripts for preview
  const previewHtml = useMemo(() => {
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  }, [html]);

  const filteredTemplates = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter((t) => `${t.name} ${t.subject}`.toLowerCase().includes(s));
  }, [templates, q]);

  const dirty = useMemo(() => {
    if (!selected) {
      return Boolean(name.trim() || subject.trim() || html.trim());
    }
    return name !== selected.name || subject !== selected.subject || html !== selected.html;
  }, [selected, name, subject, html]);

  return (
    <main className="mx-auto max-w-6xl">
      {/* Header row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Templates
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Create and manage your email templates. Preview without scripts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            onClick={loadTemplates}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            onClick={createNew}
          >
            + New
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Something went wrong</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Sidebar */}
        <aside className="lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">Saved</div>
                <Pill tone="neutral">{templates.length}</Pill>
              </div>
              {dirty ? <Pill tone="red">Unsaved</Pill> : <Pill tone="green">Saved</Pill>}
            </div>

            <div className="mt-3">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                placeholder="Search templates…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="mt-3 space-y-2">
              {loading && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  Loading…
                </div>
              )}

              {!loading && filteredTemplates.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  No templates found.
                </div>
              )}

              {filteredTemplates.map((t) => {
                const active = selectedId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => loadIntoEditor(t)}
                    className={[
                      "w-full rounded-2xl border p-3 text-left transition",
                      active
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {t.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                          {t.subject}
                        </div>
                      </div>
                      {active ? <Pill tone="blue">Editing</Pill> : null}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {formatDateTime(t.createdAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Editor */}
        <section className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {/* Sticky action bar */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {selectedId ? "Edit template" : "New template"}
                  </div>
                  {selectedId ? <Pill tone="blue">Saved record</Pill> : <Pill tone="neutral">Draft</Pill>}
                  {dirty ? <Pill tone="red">Unsaved changes</Pill> : <Pill tone="green">All saved</Pill>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    onClick={() => setTab("preview")}
                  >
                    Preview
                  </button>
                  <button
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : selectedId ? "Save" : "Create"}
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                    onClick={remove}
                    disabled={!selectedId}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-2 px-4 pb-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  <Tab active={tab === "html"} onClick={() => setTab("html")}>
                    HTML
                  </Tab>
                  <Tab active={tab === "preview"} onClick={() => setTab("preview")}>
                    Preview
                  </Tab>
                </div>

                <div className="ml-auto hidden sm:block text-xs text-slate-500">
                  Preview strips scripts for safety
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="p-4">
              <div className="grid grid-cols-1 gap-3">
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  placeholder="Template name (ex: Miami GC Intro)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  placeholder='Subject (ex: "Quick bid request – Miami")'
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />

                {tab === "html" ? (
                  <textarea
                    className="h-[520px] w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    placeholder="<div>...</div>"
                    spellCheck={false}
                  />
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <iframe
                      title="Email preview"
                      className="h-[520px] w-full"
                      srcDoc={previewHtml}
                    />
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Deliverability tip</div>
                  <div className="mt-1">
                    Short HTML + inline styles usually lands better. Avoid heavy images, lots of links,
                    and complex CSS.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
