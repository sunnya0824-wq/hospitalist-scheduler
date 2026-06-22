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
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
        aria-label="Previous month"
      >
        ‹
      </button>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
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
        className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={() => step(1)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
