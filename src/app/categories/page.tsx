"use client";

import React, { useEffect, useMemo, useState } from "react";

type CategoryRow = {
  id: number;
  name: string;
  phaseSize: number;
  createdAt: string;
  _count?: { contacts: number };
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

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPhaseSize, setNewPhaseSize] = useState(500);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const [csvText, setCsvText] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");

  async function loadCategories() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      const data = await res.json();
      setCategories(data.categories || []);
      if (!selectedCategoryId && (data.categories?.[0]?.id ?? null)) {
        setSelectedCategoryId(data.categories[0].id);
      }
    } catch {
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return categories;
    return categories.filter((c) => `${c.name}`.toLowerCase().includes(s));
  }, [categories, q]);

  async function createCategory() {
    setError(null);
    setImportResult(null);

    const name = newName.trim();
    if (!name) return setError("Enter a category name (ex: Miami)");
    if (!Number.isFinite(newPhaseSize) || newPhaseSize < 1) {
      return setError("Phase size must be at least 1");
    }

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phaseSize: newPhaseSize }),
      });

      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Failed to create category");

      setNewName("");
      await loadCategories();
      setSelectedCategoryId(data.category.id);
    } catch {
      setError("Failed to create category");
    }
  }

  async function importCsv() {
    setError(null);
    setImportResult(null);

    if (!selectedCategoryId) return setError("Select a category first");
    if (!csvText.trim()) return setError("Paste emails or CSV text first");

    setImporting(true);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: selectedCategoryId, csvText }),
      });

      const data = await res.json();
      if (!res.ok) return setError(data?.error || "Import failed");

      setImportResult(data);
      setCsvText("");
      await loadCategories();
    } catch {
      setError("Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Categories
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Create lists and import contacts. We auto-split into phases (default 500).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            onClick={loadCategories}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
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
        {/* LEFT SIDEBAR */}
        <section className="lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">Your lists</div>
                <Pill tone="neutral">{categories.length}</Pill>
              </div>
              <Pill tone="blue">Select → Import</Pill>
            </div>

            <div className="mt-3">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                placeholder="Search categories…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            {/* Create card */}
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">Create</div>
              <div className="mt-2 space-y-2">
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  placeholder="Name (ex: Miami)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <input
                    className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    type="number"
                    min={1}
                    value={newPhaseSize}
                    onChange={(e) => setNewPhaseSize(Number(e.target.value))}
                  />
                  <div className="text-xs text-slate-600">
                    Phase size (keep 500)
                  </div>
                </div>

                <button
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                  onClick={createCategory}
                >
                  Create category
                </button>
              </div>
            </div>

            {/* Category list */}
            <div className="mt-3 space-y-2">
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  No categories yet.
                </div>
              ) : (
                filtered.map((c) => {
                  const active = selectedCategoryId === c.id;
                  const contacts = c._count?.contacts ?? 0;

                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategoryId(c.id)}
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
                            {c.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            {formatDateTime(c.createdAt)}
                          </div>
                        </div>
                        {active ? <Pill tone="blue">Selected</Pill> : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <Pill tone="neutral">Phase {c.phaseSize}</Pill>
                        <Pill tone={contacts > 0 ? "green" : "neutral"}>
                          {contacts} contacts
                        </Pill>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* RIGHT MAIN */}
        <section className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">Import</h2>
                  {selectedCategory ? (
                    <Pill tone="blue">{selectedCategory.name}</Pill>
                  ) : (
                    <Pill tone="red">No category selected</Pill>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Paste emails (one-per-line) or CSV with a header containing{" "}
                  <span className="font-semibold text-slate-900">email</span>.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Recommended: test with{" "}
                <span className="font-semibold text-slate-900">50–200</span> first
              </div>
            </div>

            <div className="mt-4">
              <textarea
                className="h-[360px] w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                placeholder={`Emails:
gc1@email.com
gc2@email.com

CSV:
email,company
a@x.com,ABC Construction
b@y.com,XYZ Builders`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                onClick={importCsv}
                disabled={importing}
              >
                {importing ? "Importing..." : "Import"}
              </button>

              <button
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                onClick={() => {
                  setCsvText("");
                  setImportResult(null);
                  setError(null);
                }}
              >
                Clear
              </button>

              {selectedCategory ? (
                <div className="ml-auto text-sm text-slate-600">
                  Phase size:{" "}
                  <span className="font-semibold text-slate-900">
                    {selectedCategory.phaseSize}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Result */}
            {importResult?.summary && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">
                    Import summary
                  </div>
                  <Pill tone="green">Success</Pill>
                </div>

                <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-800">
                  {JSON.stringify(importResult.summary, null, 2)}
                </pre>

                {importResult.invalid?.length ? (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-700">
                      Sample invalid emails (first 50)
                    </div>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-800">
                      {JSON.stringify(importResult.invalid, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
