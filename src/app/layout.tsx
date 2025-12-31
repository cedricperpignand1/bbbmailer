import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "BBB Mailer",
  description: "BBB Mailer MVP",
};

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="
        rounded-xl px-3 py-2 text-sm font-medium
        text-white/80
        hover:text-white
        hover:bg-white/15
        transition
        focus:outline-none focus:ring-2 focus:ring-cyan-400/40
      "
    >
      {label}
    </Link>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-900">
        {/* Background */}
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900" />
          <div className="absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="absolute right-[-160px] top-[160px] h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        {/* App frame */}
        <div className="relative">
          <div className="mx-auto max-w-6xl px-5 py-6">
            {/* Top Nav */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500" />
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-white">
                    BBB Mailer
                  </div>
                  <div className="text-xs text-white/60">Local MVP</div>
                </div>
              </Link>

              {/* Tabs */}
              <nav className="hidden md:flex items-center gap-1 rounded-2xl bg-white/10 p-1 border border-white/10">
                <NavLink href="/categories" label="Categories" />
                <NavLink href="/templates" label="Templates" />
                <NavLink href="/campaigns" label="Campaigns" />
              </nav>

              {/* Version */}
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
                  v0.1
                </span>
              </div>
            </div>

            {/* Page content area */}
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur">
              <div className="rounded-2xl bg-white p-5">
                {children}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center text-xs text-white/50">
              Builders Bid Book • Mailer
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
