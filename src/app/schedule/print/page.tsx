"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MONTH_NAMES, WEEKDAY_SHORT } from "@/lib/shift-style";
import {
  scheduleColumns,
  slotKey,
  templateKeyOf,
} from "@/lib/scheduler/shifts";
import { weekdayOf } from "@/lib/scheduler/dates";
import { fetchMonth } from "@/lib/client";
import type { AssignmentDTO, MonthScheduleDTO } from "@/lib/api-types";

interface LocationGroup {
  key: string;
  name: string;
  assignments: AssignmentDTO[];
}

function locationKeyOf(a: Pick<AssignmentDTO, "locationId" | "locationName">): string {
  return a.locationId ?? `name:${a.locationName}`;
}

/** Locations with shifts this month, in configured order. */
function groupByLocation(data: MonthScheduleDTO): LocationGroup[] {
  const groups = new Map<string, LocationGroup>();
  for (const a of data.assignments) {
    const key = locationKeyOf(a);
    if (!groups.has(key)) groups.set(key, { key, name: a.locationName, assignments: [] });
    groups.get(key)!.assignments.push(a);
  }
  const ordered: LocationGroup[] = [];
  for (const l of data.locations) {
    const g = groups.get(l.id);
    if (g) {
      ordered.push({ ...g, name: l.name });
      groups.delete(l.id);
    }
  }
  return [...ordered, ...groups.values()];
}

function PrintContent() {
  const params = useSearchParams();
  const now = new Date();
  const year = Number(params.get("year")) || now.getUTCFullYear();
  const month = Number(params.get("month")) || now.getUTCMonth() + 1;
  const [data, setData] = useState<MonthScheduleDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetchMonth(year, month)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoaded(true));
  }, [year, month]);

  const groups = data ? groupByLocation(data) : [];
  const multiLocation = groups.length > 1;

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

      {!loaded ? (
        <p className="mt-4 text-slate-500">Loading…</p>
      ) : !data || groups.length === 0 ? (
        <p className="mt-4 text-slate-500">No schedule found for this month.</p>
      ) : (
        groups.map((g, i) => (
          <div key={g.key} className={i > 0 ? "print-page-break pt-6" : ""}>
            <LocationGrid
              title={
                multiLocation
                  ? `${g.name} — ${MONTH_NAMES[month - 1]} ${year}`
                  : `${MONTH_NAMES[month - 1]} ${year}`
              }
              assignments={g.assignments}
              data={data}
            />
          </div>
        ))
      )}
    </div>
  );
}

function LocationGrid({
  title,
  assignments,
  data,
}: {
  title: string;
  assignments: AssignmentDTO[];
  data: MonthScheduleDTO;
}) {
  const locOrder = new Map(data.locations.map((l, i) => [l.id, i]));
  const templates = data.coverage.map((c, i) => ({
    id: c.templateId,
    locationSort: locOrder.get(c.locationId) ?? Number.MAX_SAFE_INTEGER,
    sortOrder: i,
    locationName: c.locationName,
    name: c.name,
  }));
  const columns = scheduleColumns(assignments, templates);

  const cell = new Map<string, string>();
  const dateSet = new Set<string>();
  for (const a of assignments) {
    dateSet.add(a.date);
    cell.set(slotKey(a.date, templateKeyOf(a), a.slotIndex), a.physicianName ?? "—");
  }
  const dates = Array.from(dateSet).sort();
  const weekendDays = new Set(data.weekendDays);
  const hasHolidays = dates.some((d) => data.holidays[d]);

  return (
    <>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>

      <table className="print-table w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="border border-slate-300 px-2 py-1">Date</th>
            {columns.map((c) => (
              <th
                key={`${c.templateKey}-${c.slotIndex}`}
                className="border border-slate-300 px-2 py-1"
                title={c.shiftName}
              >
                {c.label}
              </th>
            ))}
            {hasHolidays && (
              <th className="border border-slate-300 px-2 py-1">Holiday</th>
            )}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const wd = weekdayOf(date);
            const holiday = data.holidays[date];
            const shade = holiday ? "bg-slate-200" : weekendDays.has(wd) ? "bg-slate-50" : "";
            return (
              <tr key={date} className={shade}>
                <td className="whitespace-nowrap border border-slate-300 px-2 py-1 font-medium">
                  {WEEKDAY_SHORT[wd]} {date.slice(5)}
                </td>
                {columns.map((c) => (
                  <td
                    key={`${c.templateKey}-${c.slotIndex}`}
                    className="border border-slate-300 px-2 py-1"
                  >
                    {cell.get(slotKey(date, c.templateKey, c.slotIndex)) ?? ""}
                  </td>
                ))}
                {hasHolidays && (
                  <td className="border border-slate-300 px-2 py-1">{holiday ?? ""}</td>
                )}
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
