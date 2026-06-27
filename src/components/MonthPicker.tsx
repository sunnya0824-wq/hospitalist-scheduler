"use client";

import { MONTH_NAMES } from "@/lib/shift-style";

export function MonthPicker({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  const step = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    onChange(y, m);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-[#1e293b] bg-[#0f172a] px-2 py-1 text-sm text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.35)] md:min-h-[36px] md:min-w-[36px]"
        aria-label="Previous month"
      >
        ‹
      </button>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="rounded-md border border-[#1e293b] bg-[#0f172a] px-2 py-1 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={year}
        onChange={(e) => onChange(Number(e.target.value), month)}
        className="w-20 rounded-md border border-[#1e293b] bg-[#0f172a] px-2 py-1 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
      />
      <button
        type="button"
        onClick={() => step(1)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-[#1e293b] bg-[#0f172a] px-2 py-1 text-sm text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.35)] md:min-h-[36px] md:min-w-[36px]"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
