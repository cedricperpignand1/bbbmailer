import Link from "next/link";

function ActionCard({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-200 to-indigo-200 opacity-50 blur-2xl transition group-hover:opacity-80" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500">{badge}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{title}</div>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>

        <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 transition group-hover:bg-slate-100">
          Open →
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl">
      {/* Hero */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Ready to send phases
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            BBB Mailer
          </h1>

          <p className="mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
            Organize contacts by category, split into phases, queue campaigns, and send clean batches.
            Built for speed and clarity.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/campaigns"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Go to Campaigns
            </Link>
            <Link
              href="/categories"
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Import Contacts
            </Link>
          </div>
        </div>

        {/* Quick steps */}
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-sm font-semibold text-slate-900">Quick start</div>
          <ol className="mt-3 space-y-2 text-sm text-slate-700">
            <li className="flex gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                1
              </span>
              Create a category (Miami, Broward, etc.)
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                2
              </span>
              Import emails (CSV or one-per-line)
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                3
              </span>
              Pick a template and queue a phase
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                4
              </span>
              Send 25 first, then Send 500
            </li>
          </ol>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <ActionCard
          href="/categories"
          badge="Step 1"
          title="Categories"
          description="Create lists and import contacts. Phases are auto-generated."
        />
        <ActionCard
          href="/templates"
          badge="Step 2"
          title="Templates"
          description="Write raw HTML emails and preview them before sending."
        />
        <ActionCard
          href="/campaigns"
          badge="Step 3"
          title="Campaigns"
          description="Queue a phase and send batches safely."
        />
      </div>

      {/* Bottom note */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">Best practice</div>
        <p className="mt-2 text-sm text-slate-600">
          For deliverability: keep templates short, avoid heavy images, and always test with{" "}
          <span className="font-semibold text-slate-900">Send 25</span> first.
        </p>
      </div>
    </main>
  );
}
