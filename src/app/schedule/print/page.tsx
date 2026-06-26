"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MONTH_NAMES } from "@/lib/shift-style";
import {
  scheduleColumns,
  HOSPITALS,
  HOSPITAL_LABELS,
  COMMUNITY_COUNT_KEY,
  type ScheduleColumn,
} from "@/lib/scheduler/shifts";
import { fetchMonth } from "@/lib/client";
import type { AssignmentDTO, MonthScheduleDTO } from "@/lib/api-types";
import type { Hospital } from "@prisma/client";

function PrintContent() {
  const params = useSearchParams();
  const now = new Date();
  const year = Number(params.get("year")) || now.getUTCFullYear();
  const month = Number(params.get("month")) || now.getUTCMonth() + 1;
  const [data, setData] = useState<MonthScheduleDTO | null>(null);

  useEffect(() => {
    fetchMonth(year, month).then(setData).catch(() => setData(null));
  }, [year, month]);

  const hospitalsWithData = HOSPITALS.filter((h) =>
    (data?.assignments ?? []).some((a) => a.hospital === h)
  );

  return (
    <div className="print-light mx-auto min-h-screen max-w-7xl rounded-lg bg-white p-6 text-black">
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

      {hospitalsWithData.length === 0 ? (
        <p className="mt-4 text-slate-500">No schedule found for this month.</p>
      ) : (
        hospitalsWithData.map((hospital, i) => (
          <div
            key={hospital}
            className={i > 0 ? "print-page-break pt-6" : ""}
          >
            <HospitalGrid
              hospital={hospital}
              year={year}
              month={month}
              data={data!}
            />
          </div>
        ))
      )}
    </div>
  );
}

/** Columns for a hospital: full slot set for MAIN, rounders-only for community. */
function columnsFor(hospital: Hospital, data: MonthScheduleDTO): ScheduleColumn[] {
  if (hospital === "MAIN") {
    return scheduleColumns({
      rounderCount: data.rounderCount,
      dayAdmitCount: data.dayAdmitCount,
      nightAdmit1Count: data.nightAdmit1Count,
      nightAdmit2Count: data.nightAdmit2Count,
    });
  }
  const count = data[COMMUNITY_COUNT_KEY[hospital as keyof typeof COMMUNITY_COUNT_KEY]];
  return Array.from({ length: count }, (_, i) => ({
    label: `R${i + 1}`,
    shiftType: "ROUNDER" as const,
    index: i + 1,
  }));
}

function HospitalGrid({
  hospital,
  year,
  month,
  data,
}: {
  hospital: Hospital;
  year: number;
  month: number;
  data: MonthScheduleDTO;
}) {
  const byDate = new Map<string, AssignmentDTO[]>();
  for (const a of data.assignments) {
    if (a.hospital !== hospital) continue;
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date)!.push(a);
  }
  const dates = Array.from(byDate.keys()).sort();
  const columns = columnsFor(hospital, data);

  const cell = (items: AssignmentDTO[], type: string, idx: number | null) =>
    items.find(
      (i) => i.shiftType === type && (idx ? i.rounderIndex === idx : true)
    )?.physicianName ?? "—";

  return (
    <>
      <h2 className="mb-2 text-lg font-bold">
        {HOSPITAL_LABELS[hospital]} — {MONTH_NAMES[month - 1]} {year}
      </h2>

      <table className="print-table w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="border border-slate-300 px-2 py-1">Date</th>
            {columns.map((c) => (
              <th
                key={`${c.shiftType}-${c.index ?? 0}`}
                className="border border-slate-300 px-2 py-1"
              >
                {c.label}
              </th>
            ))}
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
                {columns.map((c) => (
                  <td
                    key={`${c.shiftType}-${c.index ?? 0}`}
                    className="border border-slate-300 px-2 py-1"
                  >
                    {cell(items, c.shiftType, c.index)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <PrintContent />
    </Suspense>
  );
}
