"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { MONTH_NAMES, WEEKDAY_SHORT } from "@/lib/shift-style";
import { CATEGORY_LABELS, slotLabel, templateKeyOf } from "@/lib/scheduler/shifts";
import { daysInMonth, toISODate, utcDate } from "@/lib/scheduler/dates";
import { fetchMonth, fetchPhysicians } from "@/lib/client";
import type {
  AssignmentDTO,
  MonthScheduleDTO,
  PhysicianDTO,
} from "@/lib/api-types";

const DAY_NAMES = WEEKDAY_SHORT;

function PrintContent() {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams.id;
  const search = useSearchParams();
  const now = new Date();
  const year = Number(search.get("year")) || now.getUTCFullYear();
  const month = Number(search.get("month")) || now.getUTCMonth() + 1;

  const [physician, setPhysician] = useState<PhysicianDTO | null>(null);
  const [data, setData] = useState<MonthScheduleDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [physicians, monthData] = await Promise.all([
        fetchPhysicians(),
        fetchMonth(year, month),
      ]);
      setPhysician(physicians.find((p) => p.id === id) ?? null);
      setData(monthData);
    } finally {
      setLoading(false);
    }
  }, [id, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const mine = useMemo(
    () =>
      (data?.assignments ?? []).filter((a) => a.physicianId === id),
    [data, id]
  );

  // Map ISO date -> assignments for this physician on that day.
  const byDate = useMemo(() => {
    const m = new Map<string, AssignmentDTO[]>();
    for (const a of mine) {
      const arr = m.get(a.date) ?? [];
      arr.push(a);
      m.set(a.date, arr);
    }
    for (const arr of m.values())
      arr.sort((x, y) => x.startTime.localeCompare(y.startTime));
    return m;
  }, [mine]);

  // Highest slot index per (date, template), so labels only number multi-slot shifts.
  const maxSlot = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data?.assignments ?? []) {
      const k = `${a.date}|${templateKeyOf(a)}`;
      m.set(k, Math.max(m.get(k) ?? 0, a.slotIndex));
    }
    return m;
  }, [data]);

  if (loading) {
    return <div className="p-8 text-slate-700">Loading…</div>;
  }
  if (!physician) {
    return <div className="p-8 text-slate-700">Physician not found.</div>;
  }

  const total = daysInMonth(year, month);
  const firstDow = utcDate(year, month, 1).getUTCDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const holidays = data?.holidays ?? {};
  const multiLocation = (data?.locations.length ?? 0) > 1;
  const labelOf = (a: AssignmentDTO) =>
    slotLabel(
      a.shiftCode,
      a.slotIndex,
      (maxSlot.get(`${a.date}|${templateKeyOf(a)}`) ?? 1) > 1
    );

  // Summary tallies.
  const byShift = new Map<string, { name: string; category: AssignmentDTO["category"]; locationCode: string; count: number }>();
  const byLocation = new Map<string, { name: string; count: number }>();
  for (const a of mine) {
    const sk = templateKeyOf(a);
    const s = byShift.get(sk) ?? { name: a.shiftName, category: a.category, locationCode: a.locationCode, count: 0 };
    s.count += 1;
    byShift.set(sk, s);
    const lk = a.locationId ?? a.locationName;
    const l = byLocation.get(lk) ?? { name: a.locationName, count: 0 };
    l.count += 1;
    byLocation.set(lk, l);
  }

  return (
    <div className="print-light min-h-screen bg-white p-8 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <div className="no-print mb-4 flex justify-end">
          <button
            onClick={() => window.print()}
            className="rounded-md border border-slate-400 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Print / Save as PDF
          </button>
        </div>

        <header className="mb-6 border-b border-slate-300 pb-4">
          <h1 className="text-2xl font-bold">{physician.fullName}</h1>
          <p className="text-sm text-slate-600">
            Schedule for {MONTH_NAMES[month - 1]} {year} · {mine.length} shift
            {mine.length === 1 ? "" : "s"}
          </p>
        </header>

        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {DAY_NAMES.map((d) => (
                <th
                  key={d}
                  className="border border-slate-300 bg-slate-100 px-1 py-1 text-xs font-semibold uppercase"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: cells.length / 7 }).map((_, row) => (
              <tr key={row}>
                {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                  if (day === null) {
                    return (
                      <td
                        key={col}
                        className="h-20 border border-slate-200 bg-slate-50 align-top"
                      />
                    );
                  }
                  const iso = toISODate(utcDate(year, month, day));
                  const dayShifts = byDate.get(iso) ?? [];
                  const holiday = holidays[iso];
                  return (
                    <td
                      key={col}
                      className="h-20 border border-slate-300 align-top"
                    >
                      <div className="flex items-center justify-between px-1 pt-1">
                        <span className="text-xs font-semibold">{day}</span>
                        {holiday && (
                          <span className="text-[9px] font-medium text-fuchsia-700">
                            {holiday}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5 px-1 pb-1">
                        {dayShifts.map((a) => (
                          <div
                            key={a.id}
                            className="rounded border border-slate-400 bg-slate-100 px-1 py-0.5 text-[10px] leading-tight"
                          >
                            <div className="font-medium">
                              {labelOf(a)} · {a.shiftName}
                            </div>
                            <div className="text-slate-600">
                              {multiLocation ? `${a.locationCode} · ` : ""}
                              {a.startTime}–{a.endTime}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase">By shift</h2>
            <table className="w-full text-sm">
              <tbody>
                {Array.from(byShift.entries()).map(([k, v]) => (
                  <tr key={k} className="border-b border-slate-200">
                    <td className="py-1">
                      {v.name}
                      {multiLocation ? ` (${v.locationCode})` : ""}
                      <span className="ml-1 text-xs text-slate-500">
                        {CATEGORY_LABELS[v.category]}
                      </span>
                    </td>
                    <td className="py-1 text-right font-medium">{v.count}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-400">
                  <td className="py-1 font-semibold">Total</td>
                  <td className="py-1 text-right font-semibold">
                    {mine.length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase">By location</h2>
            <table className="w-full text-sm">
              <tbody>
                {Array.from(byLocation.entries()).map(([k, v]) => (
                  <tr key={k} className="border-b border-slate-200">
                    <td className="py-1">{v.name}</td>
                    <td className="py-1 text-right font-medium">{v.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PhysicianPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-700">Loading…</div>}>
      <PrintContent />
    </Suspense>
  );
}
