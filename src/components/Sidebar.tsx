"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/physicians", label: "Physicians", icon: "✚" },
  { href: "/schedule", label: "Schedule", icon: "▤" },
  { href: "/analytics", label: "Analytics", icon: "◷" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print sticky top-0 flex h-screen w-16 flex-col border-r border-[#1e293b] bg-[#0f172a] sm:w-60">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/60 bg-cyan-500/10 font-bold text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]">
          H
        </div>
        <div className="hidden sm:block">
          <div className="text-sm font-semibold uppercase tracking-wide leading-tight text-slate-100">
            Hospitalist
          </div>
          <div className="text-xs uppercase tracking-widest text-cyan-400/70">Scheduler</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-cyan-400 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                  : "border-transparent text-slate-400 hover:bg-white/5 hover:text-cyan-200"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="hidden px-4 py-4 text-xs text-slate-500 sm:block">
        Adjustable daily coverage
      </div>
    </aside>
  );
}
