"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";
import {
  GridIcon,
  UsersIcon,
  CalendarIcon,
  BarChartIcon,
} from "@/components/icons";

const NAV: {
  href: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
}[] = [
  { href: "/", label: "Dashboard", Icon: GridIcon },
  { href: "/physicians", label: "Physicians", Icon: UsersIcon },
  { href: "/schedule", label: "Schedule", Icon: CalendarIcon },
  { href: "/analytics", label: "Analytics", Icon: BarChartIcon },
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
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-300 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)]"
                  : "border-transparent text-slate-400 hover:border-cyan-900 hover:bg-slate-800/40 hover:text-cyan-300"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
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
