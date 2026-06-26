"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip } from "@/components/ShiftChip";
import { MONTH_NAMES, SHIFT_STYLES } from "@/lib/shift-style";
import { daysInMonth, isWeekend, toISODate, utcDate } from "@/lib/scheduler/dates";
import { fetchMonth, fetchPhysicians } from "@/lib/client";
import type {
  AssignmentDTO,
  MonthScheduleDTO,
  PhysicianDTO,
} from "@/lib/api-types";
import type { ShiftType } from "@prisma/client";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Whole-hour duration of a shift, accounting for overnight wrap. */
function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round(mins / 60);
}

function PhysicianDetailContent() {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams.id;
  const search = useSearchParams();
  const now = new Date();

  const [year, setYear] = useState(
    Number(search.get("year")) || now.getUTCFullYear()
  );
  const [month, setMonth] = useState(
    Number(search.get("month")) || now.getUTCMonth() + 1
  );
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

  const byDate = useMemo(() => {
    const map = new Map<string, AssignmentDTO>();
    for (const a of mine) map.set(a.date, a);
    return map;
  }, [mine]);

  const unavailable = useMemo(
    () => new Set(physician?.unavailableDates ?? []),
    [physician]
  );

  const counts = useMemo(() => {
    const c = {
      total: mine.length,
      rounding: 0,
      admin: 0,
      night1: 0,
      night2: 0,
      weekends: 0,
    };
    for (const a of mine) {
      if (a.shiftType === "ROUNDER") c.rounding += 1;
      else if (a.shiftType === "ADMIN") c.admin += 1;
      else if (a.shiftType === "NIGHT_ADMIT_1") c.night1 += 1;
      else if (a.shiftType === "NIGHT_ADMIT_2") c.night2 += 1;
      if (isWeekend(a.date)) c.weekends += 1;
    }
    return c;
  }, [mine]);

  const scheduleExists =
    Boolean(data?.lastRun) || (data?.assignments.length ?? 0) > 0;

  if (loading) {
    return <p className="p-6 text-sm text-slate-400">Loading…</p>;
  }

  if (!physician) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="rounded-xl border border-[#1e293b] bg-[#0f172a] p-6 text-slate-300">
          Physician not found.{" "}
          <Link href="/physicians" className="text-cyan-400 hover:text-cyan-300 hover:underline">
            Back to roster
          </Link>
        </p>
      </div>
    );
  }

  const desiredDiff = counts.total - physician.desiredShifts;
  const belowMin = counts.total < physician.minShifts;
  const aboveMax = counts.total > physician.maxShifts;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-2">
        <Link
          href="/physicians"
          className="text-sm text-cyan-400 transition hover:text-cyan-300 hover:underline"
        >
          ← Back to roster
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-100 neon-text-cyan">{physician.fullName}</h1>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                physician.active
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : "border-[#1e293b] bg-slate-500/10 text-slate-400"
              }`}
            >
              {physician.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {physician.nightEligible && (
              <span className="rounded-md border border-teal-400/50 bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-300">
                Night eligible
              </span>
            )}
            {physician.adminEligible && (
              <span className="rounded-md border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                Day admitting eligible
              </span>
            )}
          </div>
        </div>
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
      </header>

      {!scheduleExists ? (
        <div className="rounded-xl border border-dashed border-[#1e293b] bg-[#0f172a] p-10 text-center">
          <p className="mb-4 text-slate-400">
            No schedule generated for {MONTH_NAMES[month - 1]} {year}.
          </p>
          <Link
            href="/"
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)]"
          >
            Go to Dashboard
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total shifts" value={counts.total} />
            <SummaryCard label="Rounding" value={counts.rounding} />
            <SummaryCard label="Day admitting" value={counts.admin} />
            <SummaryCard label="Weekend shifts" value={counts.weekends} />
            <SummaryCard label="Night Admit 1" value={counts.night1} />
            <SummaryCard label="Night Admit 2" value={counts.night2} />
            <SummaryCard
              label="Vs. desired"
              value={`${counts.total} of ${physician.desiredShifts}`}
              hint={`${desiredDiff >= 0 ? "+" : ""}${desiredDiff}`}
              accent={desiredDiff < 0 ? "text-amber-300" : "text-emerald-400"}
            />
            <SummaryCard
              label="Vs. min/max"
              value={`${physician.minShifts}–${physician.maxShifts}`}
              hint={
                belowMin ? "below min" : aboveMax ? "above max" : "within range"
              }
              accent={
                belowMin || aboveMax ? "text-rose-400" : "text-emerald-400"
              }
            />
          </div>

          <CalendarGrid
            year={year}
            month={month}
            byDate={byDate}
            unavailable={unavailable}
          />

          <AssignmentTable assignments={mine} />
        </>
      )}
    </div>
  );
}

function CalendarGrid({
  year,
  month,
  byDate,
  unavailable,
}: {
  year: number;
  month: number;
  byDate: Map<string, AssignmentDTO>;
  unavailable: Set<string>;
}) {
  const days = daysInMonth(year, month);
  const firstDow = utcDate(year, month, 1).getUTCDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toISODate(utcDate(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] p-4">
      <h2 className="mb-3 font-semibold">
        {MONTH_NAMES[month - 1]} {year}
      </h2>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`empty-${i}`} className="min-h-[60px]" />;
          const a = byDate.get(iso);
          const off = unavailable.has(iso);
          const style = a ? SHIFT_STYLES[a.shiftType as ShiftType] : null;
          const dayNum = Number(iso.slice(8));
          return (
            <div
              key={iso}
              className={`min-h-[60px] rounded-md border p-1 text-left ${
                a && style
                  ? style.chip
                  : "border-[#1e293b] bg-[#0a0e1a]"
              }`}
            >
              <div
                className={`text-[10px] font-semibold ${
                  off ? "text-slate-500 line-through" : "text-slate-400"
                }`}
              >
                {dayNum}
              </div>
              {a && style ? (
                <div className="mt-1 text-[10px] font-medium leading-tight">
                  {a.shiftType === "ROUNDER" && a.rounderIndex
                    ? `R${a.rounderIndex}`
                    : style.label}
                </div>
              ) : off ? (
                <div className="mt-1 text-[10px] text-slate-500 line-through">
                  off
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssignmentTable({ assignments }: { assignments: AssignmentDTO[] }) {
  const rows = [...assignments].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#1e293b] bg-[#0f172a] p-5 text-sm text-slate-400">
        No assignments for this physician this month.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#1e293b] bg-[#0f172a]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e293b] text-left text-xs uppercase text-cyan-400/70">
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Day</th>
            <th className="px-4 py-2">Shift</th>
            <th className="px-4 py-2">Hours</th>
            <th className="px-4 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const dow = DAY_NAMES[new Date(a.date + "T00:00:00Z").getUTCDay()];
            const notes: string[] = [];
            if (a.isManual) notes.push("manually edited");
            if (a.isLocked) notes.push("locked");
            return (
              <tr key={a.id} className="border-b border-[#1e293b] transition hover:bg-cyan-500/5">
                <td className="px-4 py-2 font-medium text-slate-200">{a.date}</td>
                <td className="px-4 py-2 text-slate-400">{dow}</td>
                <td className="px-4 py-2">
                  <ShiftChip
                    shiftType={a.shiftType}
                    rounderIndex={a.rounderIndex}
                    name={a.physicianName}
                  />
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {shiftHours(a.startTime, a.endTime)}h
                  <span className="ml-1 text-xs text-slate-500">
                    ({a.startTime}–{a.endTime})
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-400">
                  {notes.join(", ") || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  accent = "text-slate-100",
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[#1e293b] bg-[#0f172a] p-4 transition hover:border-cyan-900/40">
      <div className="text-xs font-medium uppercase tracking-wide text-cyan-400/70">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export default function PhysicianDetailPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <PhysicianDetailContent />
    </Suspense>
  );
}
