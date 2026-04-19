"use client";

import React, { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "addresses" | "settings" | "templates" | "post" | "logs";

type Address = {
  id: number;
  address: string;
  status: "pending" | "used";
  createdAt: string;
};

type Settings = {
  email: string;
  passwordSet: boolean;
  city: string;
  category: string;
  minDelayMs: number;
  maxDelayMs: number;
};

type Template = {
  id: number;
  type: "title" | "body";
  content: string;
  createdAt: string;
};

type PostLog = {
  id: number;
  address: string;
  generatedTitle: string;
  generatedBody: string;
  city: string;
  category: string;
  status: "previewed" | "posted" | "failed";
  error?: string | null;
  createdAt: string;
};

type Preview = {
  addressId: number;
  address: string;
  title: string;
  body: string;
  city: string;
  category: string;
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "amber" | "blue" | "purple";
}) {
  const map: Record<string, string> = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function Btn({
  onClick,
  disabled,
  children,
  variant = "primary",
  size = "md",
  type = "button",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const v: Record<string, string> = {
    primary: "bg-slate-800 text-white hover:bg-slate-700",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-800",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sz} ${v[variant]}`}>
      {children}
    </button>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && <h3 className="mb-4 text-sm font-semibold text-slate-800">{title}</h3>}
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>;
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 6,
  disabled,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50 resize-y ${mono ? "font-mono" : ""}`}
    />
  );
}

function formatDt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORIES = [
  { value: "jobs/construction", label: "Jobs → Construction / Extraction" },
  { value: "services/skilled-trades", label: "Services → Skilled Trade Services" },
  { value: "gigs/labor", label: "Gigs → Labor Gigs" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CraigslistPage() {
  const [tab, setTab] = useState<Tab>("addresses");

  // Data
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [settings, setSettings] = useState<Settings>({
    email: "",
    passwordSet: false,
    city: "",
    category: "jobs/construction",
    minDelayMs: 2000,
    maxDelayMs: 5000,
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<PostLog[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);

  // Loading flags
  const [loadingData, setLoadingData] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [resettingAddresses, setResettingAddresses] = useState(false);
  const [clearingAddresses, setClearingAddresses] = useState(false);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<number | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  // Form state
  const [addressText, setAddressText] = useState("");
  const [settingsForm, setSettingsForm] = useState({
    email: "",
    password: "",
    city: "",
    category: "jobs/construction",
    minDelayMs: "2000",
    maxDelayMs: "5000",
  });
  const [newTitleContent, setNewTitleContent] = useState("");
  const [newBodyContent, setNewBodyContent] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<{ id: number; content: string } | null>(null);
  const [postStatus, setPostStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [seedingDefaults, setSeedingDefaults] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadAddresses = useCallback(async () => {
    const r = await fetch("/api/craigslist/addresses");
    const d = await r.json();
    setAddresses(d.addresses ?? []);
  }, []);

  const loadSettings = useCallback(async () => {
    const r = await fetch("/api/craigslist/settings");
    const d = await r.json();
    setSettings(d);
    setSettingsForm({
      email: d.email || "",
      password: "",
      city: d.city || "",
      category: d.category || "jobs/construction",
      minDelayMs: String(d.minDelayMs ?? 2000),
      maxDelayMs: String(d.maxDelayMs ?? 5000),
    });
  }, []);

  const loadTemplates = useCallback(async () => {
    const r = await fetch("/api/craigslist/templates");
    const d = await r.json();
    setTemplates(d.templates ?? []);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    const r = await fetch("/api/craigslist/logs");
    const d = await r.json();
    setLogs(d.logs ?? []);
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingData(true);
      await Promise.all([loadAddresses(), loadSettings(), loadTemplates()]);
      setLoadingData(false);
    })();
  }, [loadAddresses, loadSettings, loadTemplates]);

  useEffect(() => {
    if (tab === "logs") loadLogs();
  }, [tab, loadLogs]);

  // ── Addresses ─────────────────────────────────────────────────────────────

  async function handleLoadAddresses() {
    if (!addressText.trim()) return;
    setLoadingAddresses(true);
    const r = await fetch("/api/craigslist/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "load", text: addressText }),
    });
    const d = await r.json();
    if (d.addresses) {
      setAddresses(d.addresses);
      setAddressText("");
    }
    setLoadingAddresses(false);
  }

  async function handleResetAddresses() {
    setResettingAddresses(true);
    const r = await fetch("/api/craigslist/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    const d = await r.json();
    if (d.addresses) setAddresses(d.addresses);
    setResettingAddresses(false);
  }

  async function handleClearAddresses() {
    if (!confirm("Delete all addresses? This cannot be undone.")) return;
    setClearingAddresses(true);
    const r = await fetch("/api/craigslist/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    const d = await r.json();
    if (d.addresses) setAddresses(d.addresses);
    setClearingAddresses(false);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async function handleSaveSettings() {
    setSavingSettings(true);
    const r = await fetch("/api/craigslist/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: settingsForm.email,
        password: settingsForm.password || undefined,
        city: settingsForm.city,
        category: settingsForm.category,
        minDelayMs: Number(settingsForm.minDelayMs),
        maxDelayMs: Number(settingsForm.maxDelayMs),
      }),
    });
    const d = await r.json();
    setSettings(d);
    setSettingsForm((prev) => ({ ...prev, password: "" }));
    setSavingSettings(false);
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async function handleAddTemplate(type: "title" | "body") {
    const content = type === "title" ? newTitleContent.trim() : newBodyContent.trim();
    if (!content) return;
    setAddingTemplate(true);
    const r = await fetch("/api/craigslist/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content }),
    });
    const tpl = await r.json();
    if (tpl.id) {
      setTemplates((prev) => [...prev, tpl]);
      if (type === "title") setNewTitleContent("");
      else setNewBodyContent("");
    }
    setAddingTemplate(false);
  }

  async function handleDeleteTemplate(id: number) {
    if (!confirm("Delete this template?")) return;
    setDeletingTemplate(id);
    await fetch(`/api/craigslist/templates/${id}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setDeletingTemplate(null);
  }

  async function handleSaveEditTemplate() {
    if (!editingTemplate) return;
    const r = await fetch(`/api/craigslist/templates/${editingTemplate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editingTemplate.content }),
    });
    const updated = await r.json();
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingTemplate(null);
  }

  async function handleSeedDefaults() {
    setSeedingDefaults(true);
    const r = await fetch("/api/craigslist/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed-defaults" }),
    });
    const d = await r.json();
    if (d.templates) setTemplates(d.templates);
    setSeedingDefaults(false);
  }

  // ── Preview & Post ────────────────────────────────────────────────────────

  async function handleGeneratePreview() {
    setGeneratingPreview(true);
    setPreview(null);
    setPostStatus(null);
    const r = await fetch("/api/craigslist/preview", { method: "POST" });
    const d = await r.json();
    if (r.ok) {
      setPreview(d);
    } else {
      setPostStatus({ type: "error", msg: d.error || "Failed to generate preview." });
    }
    setGeneratingPreview(false);
  }

  async function handleRefreshLogs() {
    await loadLogs();
    await loadAddresses();
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const pendingCount = addresses.filter((a) => a.status === "pending").length;
  const usedCount = addresses.filter((a) => a.status === "used").length;
  const titleCount = templates.filter((t) => t.type === "title").length;
  const bodyCount = templates.filter((t) => t.type === "body").length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  const tabCls = (t: Tab) =>
    `px-3 py-2 text-sm font-medium rounded-lg transition ${
      tab === t
        ? "bg-slate-800 text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
    }`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Craigslist Poster</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Auto-generate and post construction listings from permit addresses.
          </p>
        </div>
        {/* Quick stats */}
        <div className="flex flex-wrap gap-2">
          <Pill tone="blue">{pendingCount} pending</Pill>
          <Pill tone="neutral">{usedCount} used</Pill>
          <Pill tone="purple">{titleCount} titles · {bodyCount} bodies</Pill>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button className={tabCls("addresses")} onClick={() => setTab("addresses")}>
          Addresses {pendingCount > 0 && <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{pendingCount}</span>}
        </button>
        <button className={tabCls("settings")} onClick={() => setTab("settings")}>Settings</button>
        <button className={tabCls("templates")} onClick={() => setTab("templates")}>
          Templates {(titleCount + bodyCount) > 0 && <span className="ml-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">{titleCount + bodyCount}</span>}
        </button>
        <button className={tabCls("post")} onClick={() => setTab("post")}>
          Preview &amp; Post
        </button>
        <button className={tabCls("logs")} onClick={() => setTab("logs")}>Logs</button>
      </div>

      {/* ── Tab: Addresses ── */}
      {tab === "addresses" && (
        <div className="space-y-4">
          <SectionCard title="Load Addresses">
            <p className="mb-3 text-xs text-slate-500">
              Paste addresses below — one per line. Duplicates are skipped automatically.
            </p>
            <Textarea
              value={addressText}
              onChange={setAddressText}
              placeholder={"123 Main St, Miami FL 33101\n456 Oak Ave, Fort Lauderdale FL 33309\n..."}
              rows={7}
              mono
            />
            <div className="mt-3 flex gap-2">
              <Btn onClick={handleLoadAddresses} disabled={loadingAddresses || !addressText.trim()}>
                {loadingAddresses ? "Loading…" : "Load Addresses"}
              </Btn>
            </div>
          </SectionCard>

          <SectionCard title={`Address List (${addresses.length})`}>
            <div className="mb-3 flex gap-2">
              <Btn
                variant="secondary"
                onClick={handleResetAddresses}
                disabled={resettingAddresses || !addresses.length}
              >
                {resettingAddresses ? "Resetting…" : "Reset All to Pending"}
              </Btn>
              <Btn
                variant="danger"
                onClick={handleClearAddresses}
                disabled={clearingAddresses || !addresses.length}
              >
                {clearingAddresses ? "Clearing…" : "Clear All"}
              </Btn>
            </div>

            {!addresses.length ? (
              <p className="py-8 text-center text-sm text-slate-400">No addresses loaded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Address</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {addresses.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-800">{a.address}</td>
                        <td className="px-4 py-3">
                          <Pill tone={a.status === "pending" ? "blue" : "neutral"}>
                            {a.status}
                          </Pill>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{formatDt(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Settings ── */}
      {tab === "settings" && (
        <SectionCard title="Craigslist Settings">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Craigslist Email</Label>
              <Input
                value={settingsForm.email}
                onChange={(v) => setSettingsForm((p) => ({ ...p, email: v }))}
                placeholder="you@example.com"
                type="email"
              />
            </div>
            <div>
              <Label>
                Craigslist Password{" "}
                {settings.passwordSet && (
                  <span className="text-emerald-600">(saved — leave blank to keep)</span>
                )}
              </Label>
              <Input
                value={settingsForm.password}
                onChange={(v) => setSettingsForm((p) => ({ ...p, password: v }))}
                placeholder={settings.passwordSet ? "••••••••" : "Enter password"}
                type="password"
              />
            </div>
            <div>
              <Label>City / Region</Label>
              <Input
                value={settingsForm.city}
                onChange={(v) => setSettingsForm((p) => ({ ...p, city: v }))}
                placeholder="Miami, FL"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Used in templates as {"{{city}}"}. Also determines Craigslist subdomain.
              </p>
            </div>
            <div>
              <Label>Category</Label>
              <select
                value={settingsForm.category}
                onChange={(e) => setSettingsForm((p) => ({ ...p, category: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Min Delay (ms)</Label>
              <Input
                value={settingsForm.minDelayMs}
                onChange={(v) => setSettingsForm((p) => ({ ...p, minDelayMs: v }))}
                type="number"
                placeholder="2000"
              />
            </div>
            <div>
              <Label>Max Delay (ms)</Label>
              <Input
                value={settingsForm.maxDelayMs}
                onChange={(v) => setSettingsForm((p) => ({ ...p, maxDelayMs: v }))}
                type="number"
                placeholder="5000"
              />
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Btn onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? "Saving…" : "Save Settings"}
            </Btn>
            {settings.passwordSet && (
              <span className="ml-3 text-xs text-emerald-600">Password stored (encrypted)</span>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tab: Templates ── */}
      {tab === "templates" && (
        <div className="space-y-4">
          {/* Seed defaults */}
          {templates.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">No templates yet.</p>
              <p className="mt-1">Load built-in starter templates to get going quickly, or add your own below.</p>
              <div className="mt-3">
                <Btn onClick={handleSeedDefaults} disabled={seedingDefaults}>
                  {seedingDefaults ? "Loading defaults…" : "Load Default Templates"}
                </Btn>
              </div>
            </div>
          )}

          {/* Title templates */}
          <SectionCard title="Title Templates">
            <p className="mb-3 text-xs text-slate-500">
              Supports: <code className="rounded bg-slate-100 px-1">{"{{address}}"}</code>{" "}
              <code className="rounded bg-slate-100 px-1">{"{{city}}"}</code>
            </p>
            {templates.filter((t) => t.type === "title").length === 0 ? (
              <p className="mb-3 text-sm text-slate-400">No title templates yet.</p>
            ) : (
              <div className="mb-4 space-y-2">
                {templates
                  .filter((t) => t.type === "title")
                  .map((t) => (
                    <TemplateRow
                      key={t.id}
                      tpl={t}
                      editing={editingTemplate?.id === t.id ? editingTemplate.content : null}
                      onEdit={() => setEditingTemplate({ id: t.id, content: t.content })}
                      onEditChange={(v) => setEditingTemplate({ id: t.id, content: v })}
                      onSaveEdit={handleSaveEditTemplate}
                      onCancelEdit={() => setEditingTemplate(null)}
                      onDelete={() => handleDeleteTemplate(t.id)}
                      deleting={deletingTemplate === t.id}
                    />
                  ))}
              </div>
            )}
            <div className="border-t border-slate-100 pt-3">
              <Label>New title template</Label>
              <Input
                value={newTitleContent}
                onChange={setNewTitleContent}
                placeholder="Construction project at {{address}} — {{city}}"
              />
              <div className="mt-2">
                <Btn
                  size="sm"
                  onClick={() => handleAddTemplate("title")}
                  disabled={addingTemplate || !newTitleContent.trim()}
                >
                  Add Title
                </Btn>
              </div>
            </div>
          </SectionCard>

          {/* Body templates */}
          <SectionCard title="Body Templates">
            <p className="mb-3 text-xs text-slate-500">
              Supports:{" "}
              <code className="rounded bg-slate-100 px-1">{"{{address}}"}</code>{" "}
              <code className="rounded bg-slate-100 px-1">{"{{city}}"}</code>{" "}
              <code className="rounded bg-slate-100 px-1">{"{{link}}"}</code>{" "}
              — link is automatically randomized each time. If omitted, it is appended naturally.
            </p>
            {templates.filter((t) => t.type === "body").length === 0 ? (
              <p className="mb-3 text-sm text-slate-400">No body templates yet.</p>
            ) : (
              <div className="mb-4 space-y-3">
                {templates
                  .filter((t) => t.type === "body")
                  .map((t) => (
                    <TemplateRow
                      key={t.id}
                      tpl={t}
                      multiline
                      editing={editingTemplate?.id === t.id ? editingTemplate.content : null}
                      onEdit={() => setEditingTemplate({ id: t.id, content: t.content })}
                      onEditChange={(v) => setEditingTemplate({ id: t.id, content: v })}
                      onSaveEdit={handleSaveEditTemplate}
                      onCancelEdit={() => setEditingTemplate(null)}
                      onDelete={() => handleDeleteTemplate(t.id)}
                      deleting={deletingTemplate === t.id}
                    />
                  ))}
              </div>
            )}
            <div className="border-t border-slate-100 pt-3">
              <Label>New body template</Label>
              <Textarea
                value={newBodyContent}
                onChange={setNewBodyContent}
                placeholder={"We have a construction project at {{address}} in {{city}}.\n\nFor more info, visit {{link}}."}
                rows={6}
              />
              <div className="mt-2">
                <Btn
                  size="sm"
                  onClick={() => handleAddTemplate("body")}
                  disabled={addingTemplate || !newBodyContent.trim()}
                >
                  Add Body
                </Btn>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Preview & Post ── */}
      {tab === "post" && (
        <div className="space-y-4">
          {/* How it works banner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">How posting works (Vercel deployment)</p>
            <p className="mt-1 text-xs text-blue-700">
              Since this app runs on Vercel, the browser automation runs on your <strong>local machine</strong> via a script.
              The script runs forever — it posts one listing, waits, picks the next address, and repeats.
              Addresses rotate automatically. When all are used, it resets and starts over. It never reuses the same address twice in a row.
            </p>
          </div>

          {/* Setup steps */}
          <SectionCard title="Local Script Setup (one-time)">
            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">1</span>
                <span>
                  Copy the example config:{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    copy scripts\.env.example scripts\.env
                  </code>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">2</span>
                <div>
                  Open <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">scripts\.env</code> and fill in:
                  <div className="mt-1.5 rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-green-400">
                    <div>SITE_URL=https://your-app.vercel.app</div>
                    <div>CL_EMAIL=you@craigslist.org</div>
                    <div>CL_PASSWORD=yourpassword</div>
                    <div>POST_INTERVAL_MINUTES=35</div>
                  </div>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">3</span>
                <span>
                  Install Playwright browser (one-time):{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    npx playwright install chromium
                  </code>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">4</span>
                <div>
                  Run the script from your project folder — it loops forever:
                  <div className="mt-1.5 rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-green-400">
                    node scripts/cl-post.js
                  </div>
                  Press <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-xs">Ctrl+C</kbd> to stop.
                </div>
              </li>
            </ol>
          </SectionCard>

          {/* Preview panel */}
          <SectionCard title="Preview a Post (optional — script auto-generates each time)">
            <p className="mb-3 text-xs text-slate-500">
              Generate a sample to see what the script will produce. The actual script generates a fresh preview on each run.
            </p>
            {postStatus && (
              <div className={`mb-3 rounded-lg border p-3 text-sm ${
                postStatus.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}>
                {postStatus.msg}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn onClick={handleGeneratePreview} disabled={generatingPreview}>
                {generatingPreview ? "Generating…" : "Generate Preview"}
              </Btn>
              {preview && (
                <Btn variant="secondary" onClick={handleGeneratePreview} disabled={generatingPreview}>
                  Regenerate
                </Btn>
              )}
              <Btn variant="secondary" onClick={handleRefreshLogs} disabled={loadingLogs}>
                Refresh Logs &amp; Addresses
              </Btn>
            </div>

            {preview && (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Address</span>
                    <p className="mt-1 font-mono text-xs text-slate-800">{preview.address}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">City</span>
                    <p className="mt-1 text-xs text-slate-800">{preview.city || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Category</span>
                    <p className="mt-1 text-xs text-slate-800">
                      {CATEGORIES.find((c) => c.value === preview.category)?.label ?? preview.category}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Title</span>
                  <p className="mt-1 text-sm font-medium text-slate-900">{preview.title}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Body</span>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                    {preview.body}
                  </pre>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Behavior summary */}
          <SectionCard title="Script Behavior">
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li>✓ Runs <strong>indefinitely</strong> until you press Ctrl+C</li>
              <li>✓ Posts one listing per interval (default: 35 min)</li>
              <li>✓ Picks a <strong>random pending address</strong> each time</li>
              <li>✓ Never picks the <strong>same address twice in a row</strong></li>
              <li>✓ When all addresses are used → <strong>auto-resets</strong> and starts over</li>
              <li>✓ Each post uses a randomly selected title + body template</li>
              <li>✓ Link format (BuildersBidBook.com) is randomized every post</li>
              <li>✓ Results are logged back to your live app automatically</li>
            </ul>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Logs ── */}
      {tab === "logs" && (
        <SectionCard title="Posting Log">
          <div className="mb-3 flex gap-2">
            <Btn size="sm" variant="secondary" onClick={loadLogs} disabled={loadingLogs}>
              {loadingLogs ? "Loading…" : "Refresh"}
            </Btn>
            {logs.length > 0 && (
              <Btn
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!confirm("Clear all logs?")) return;
                  await fetch("/api/craigslist/logs", { method: "DELETE" });
                  setLogs([]);
                }}
              >
                Clear Logs
              </Btn>
            )}
          </div>

          {!logs.length ? (
            <p className="py-8 text-center text-sm text-slate-400">No log entries yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left">Time</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Address</th>
                    <th className="px-3 py-3 text-left">Title</th>
                    <th className="px-3 py-3 text-left">City</th>
                    <th className="px-3 py-3 text-left">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <LogRow key={l.id} log={l} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TemplateRow({
  tpl,
  multiline,
  editing,
  onEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  deleting,
}: {
  tpl: Template;
  multiline?: boolean;
  editing: string | null;
  onEdit: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  if (editing !== null) {
    return (
      <div className="rounded-lg border border-slate-300 p-3">
        {multiline ? (
          <textarea
            value={editing}
            onChange={(e) => onEditChange(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-sans text-sm text-slate-800 focus:outline-none resize-y"
          />
        ) : (
          <input
            type="text"
            value={editing}
            onChange={(e) => onEditChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none"
          />
        )}
        <div className="mt-2 flex gap-2">
          <button
            onClick={onSaveEdit}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <pre className="flex-1 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800 break-words min-w-0">
        {tpl.content}
      </pre>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={onEdit}
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? "…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function LogRow({ log }: { log: PostLog }) {
  const [expanded, setExpanded] = useState(false);
  const tone: Record<string, "green" | "neutral" | "red"> = {
    posted: "green",
    previewed: "neutral",
    failed: "red",
  };
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded((x) => !x)}
      >
        <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{formatDt(log.createdAt)}</td>
        <td className="px-3 py-2">
          <Pill tone={tone[log.status] ?? "neutral"}>{log.status}</Pill>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-slate-700 max-w-[180px] truncate">{log.address}</td>
        <td className="px-3 py-2 text-xs text-slate-700 max-w-[200px] truncate">{log.generatedTitle}</td>
        <td className="px-3 py-2 text-xs text-slate-500">{log.city}</td>
        <td className="px-3 py-2 text-xs text-slate-500">{log.category}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-3 pb-3 pt-1">
            {log.error && (
              <p className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{log.error}</p>
            )}
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">
              {log.generatedBody}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}
