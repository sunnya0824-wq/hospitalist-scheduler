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
    <aside className="no-print sticky top-0 flex h-screen w-16 flex-col border-r border-slate-200 bg-white sm:w-60">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
          H
        </div>
        <div className="hidden sm:block">
          <div className="text-sm font-semibold leading-tight">
            Hospitalist
          </div>
          <div className="text-xs text-slate-500">Scheduler</div>
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
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="hidden px-4 py-4 text-xs text-slate-400 sm:block">
        Adjustable daily coverage
      </div>
    </aside>
  );
}
