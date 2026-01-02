"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({
  href,
  label,
  highlight,
}: {
  href: string;
  label: string;
  highlight?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  if (highlight) {
    return (
      <Link
        href={href}
        className={`
          rounded-xl px-3 py-2 text-sm font-semibold transition
          ${
            isActive
              ? "bg-gradient-to-br from-yellow-300 to-yellow-500 text-black shadow-[0_0_20px_rgba(250,204,21,0.5)]"
              : "bg-yellow-400/20 text-yellow-300 hover:bg-yellow-400/30"
          }
        `}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`
        rounded-xl px-3 py-2 text-sm font-medium transition
        ${
          isActive
            ? "bg-white/20 text-white"
            : "text-white/80 hover:text-white hover:bg-white/15"
        }
        focus:outline-none focus:ring-2 focus:ring-cyan-400/40
      `}
    >
      {label}
    </Link>
  );
}

export default function TopNav() {
  return (
    <nav className="hidden md:flex items-center gap-1 rounded-2xl bg-white/10 p-1 border border-white/10">
      <NavLink href="/categories" label="Contacts" />
      <NavLink href="/templates" label="Templates" />
      <NavLink href="/campaigns" label="Campaigns" />
      <NavLink href="/auto-campaigns" label="Auto Campaigns" />
      <NavLink href="/auto-sms" label="Auto SMS" highlight />
    </nav>
  );
}
