"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MONTH_NAMES } from "@/lib/shift-style";
import { fetchMonth } from "@/lib/client";
import type { AssignmentDTO, MonthScheduleDTO } from "@/lib/api-types";

function PrintContent() {
  const params = useSearchParams();
  const now = new Date();
  const year = Number(params.get("year")) || now.getUTCFullYear();
  const month = Number(params.get("month")) || now.getUTCMonth() + 1;
  const [data, setData] = useState<MonthScheduleDTO | null>(null);

  useEffect(() => {
    fetchMonth(year, month).then(setData).catch(() => setData(null));
  }, [year, month]);

  const byDate = new Map<string, AssignmentDTO[]>();
  for (const a of data?.assignments ?? []) {
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date)!.push(a);
  }
  const dates = Array.from(byDate.keys()).sort();

  const cell = (items: AssignmentDTO[], type: string, idx?: number) =>
    items.find(
      (i) => i.shiftType === type && (idx ? i.rounderIndex === idx : true)
    )?.physicianName ?? "—";

  return (
    <div className="mx-auto max-w-7xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          Print preview — {MONTH_NAMES[month - 1]} {year}
        </h1>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Print
        </button>
      </div>

      <h2 className="mb-2 text-lg font-bold">
        Hospitalist Schedule — {MONTH_NAMES[month - 1]} {year}
      </h2>

      <table className="print-table w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="border border-slate-300 px-2 py-1">Date</th>
            {Array.from({ length: 10 }, (_, i) => (
              <th key={i} className="border border-slate-300 px-2 py-1">
                R{i + 1}
              </th>
            ))}
            <th className="border border-slate-300 px-2 py-1">Day Admit</th>
            <th className="border border-slate-300 px-2 py-1">Night 1</th>
            <th className="border border-slate-300 px-2 py-1">Night 2</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const items = byDate.get(date)!;
            return (
              <tr key={date}>
                <td className="border border-slate-300 px-2 py-1 font-medium">
                  {date.slice(5)}
                </td>
                {Array.from({ length: 10 }, (_, i) => (
                  <td key={i} className="border border-slate-300 px-2 py-1">
                    {cell(items, "ROUNDER", i + 1)}
                  </td>
                ))}
                <td className="border border-slate-300 px-2 py-1">
                  {cell(items, "ADMIN")}
                </td>
                <td className="border border-slate-300 px-2 py-1">
                  {cell(items, "NIGHT_ADMIT_1")}
                </td>
                <td className="border border-slate-300 px-2 py-1">
                  {cell(items, "NIGHT_ADMIT_2")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {dates.length === 0 && (
        <p className="mt-4 text-slate-500">
          No schedule found for this month.
        </p>
      )}
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <PrintContent />
    </Suspense>
  );
}
