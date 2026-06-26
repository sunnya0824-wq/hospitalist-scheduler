"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip } from "@/components/ShiftChip";
import { MONTH_NAMES, SHIFT_STYLES, getHospitalBadge } from "@/lib/shift-style";
import { HOSPITALS, COMMUNITY_HOSPITALS } from "@/lib/scheduler/shifts";
import {
  addDaysISO,
  daysInMonth,
  isWeekend,
  toISODate,
  utcDate,
} from "@/lib/scheduler/dates";
import {
  fetchMonth,
  fetchPhysicians,
  fetchTimeOff,
  saveTimeOff,
  deleteTimeOff,
} from "@/lib/client";
import type {
  AssignmentDTO,
  MonthScheduleDTO,
  PhysicianDTO,
  TimeOffDTO,
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

  const byHospital = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of mine) map.set(a.hospital, (map.get(a.hospital) ?? 0) + 1);
    return HOSPITALS.map((h) => ({ hospital: h, count: map.get(h) ?? 0 })).filter(
      (r) => r.count > 0
    );
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
            {COMMUNITY_HOSPITALS.filter(
              (h) =>
                ({
                  CARSON: physician.canWorkCarson,
                  EATON: physician.canWorkEaton,
                  CLINTON: physician.canWorkClinton,
                }[h])
            ).map((h) => {
              const badge = getHospitalBadge(h);
              return (
                <span
                  key={h}
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium ${badge.badge}`}
                >
                  {badge.label}
                </span>
              );
            })}
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

      <TimeOffCard
        physicianId={id}
        initialYear={year}
        initialMonth={month}
      />

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

          <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
            <h2 className="mb-3 font-semibold uppercase tracking-wide text-slate-200">
              By hospital
            </h2>
            {byHospital.length === 0 ? (
              <p className="text-sm text-slate-400">No assignments this month.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {byHospital.map(({ hospital, count }) => {
                  const badge = getHospitalBadge(hospital);
                  return (
                    <span
                      key={hospital}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-medium ${badge.badge}`}
                    >
                      {badge.label}
                      <span className="font-bold">{count}</span>
                    </span>
                  );
                })}
              </div>
            )}
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
                    hospital={a.hospital}
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

function TimeOffCard({
  physicianId,
  initialYear,
  initialMonth,
}: {
  physicianId: string;
  initialYear: number;
  initialMonth: number;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [serverDates, setServerDates] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [note, setNote] = useState("");
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows: TimeOffDTO[] = await fetchTimeOff(physicianId);
    const set = new Set(rows.map((r) => r.date));
    setServerDates(set);
    setDraft(new Set(set));
    setNotes(new Map(rows.map((r) => [r.date, r.note ?? ""])));
  }, [physicianId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (iso: string, shift: boolean) => {
    setMessage(null);
    setDraft((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked) {
        // Select the inclusive range as time-off (always turns days on).
        const [a, b] = lastClicked <= iso ? [lastClicked, iso] : [iso, lastClicked];
        let cursor = a;
        while (cursor <= b) {
          next.add(cursor);
          cursor = addDaysISO(cursor, 1);
        }
      } else if (next.has(iso)) {
        next.delete(iso);
      } else {
        next.add(iso);
      }
      return next;
    });
    setLastClicked(iso);
  };

  const removeDate = (iso: string) => {
    setMessage(null);
    setDraft((prev) => {
      const next = new Set(prev);
      next.delete(iso);
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const additions = [...draft].filter((d) => !serverDates.has(d));
      const removals = [...serverDates].filter((d) => !draft.has(d));
      if (additions.length) await saveTimeOff(physicianId, additions, note);
      if (removals.length) await deleteTimeOff(physicianId, removals);
      setNote("");
      await load();
      setMessage(
        additions.length || removals.length
          ? `Saved — ${additions.length} added, ${removals.length} removed.`
          : "No changes to save."
      );
    } catch {
      setMessage("Failed to save time off.");
    } finally {
      setSaving(false);
    }
  };

  const days = daysInMonth(year, month);
  const firstDow = utcDate(year, month, 1).getUTCDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toISODate(utcDate(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  const pending = [...draft].sort();
  const dirty =
    [...draft].some((d) => !serverDates.has(d)) ||
    [...serverDates].some((d) => !draft.has(d));

  return (
    <div className="mb-6 rounded-xl border border-fuchsia-500/30 bg-[#0f172a] p-5 shadow-[0_0_14px_rgba(217,70,239,0.12)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold uppercase tracking-wide text-fuchsia-300 neon-text-magenta">
            Time off
          </h2>
          <p className="text-xs text-slate-400">
            Click a day to toggle. Shift+click to select a range. These days are
            a hard block — the scheduler will not assign any shift on them.
          </p>
        </div>
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-300">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((iso, i) => {
              if (!iso)
                return <div key={`empty-${i}`} className="min-h-[44px]" />;
              const off = draft.has(iso);
              const dayNum = Number(iso.slice(8));
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={(e) => toggle(iso, e.shiftKey)}
                  className={`min-h-[44px] rounded-md border p-1 text-left transition ${
                    off
                      ? "border-fuchsia-400 bg-fuchsia-500/25 text-fuchsia-100 shadow-[0_0_10px_rgba(217,70,239,0.4)]"
                      : "border-[#1e293b] bg-[#0a0e1a] text-slate-400 hover:border-fuchsia-500/50"
                  }`}
                >
                  <div className="text-[10px] font-semibold">{dayNum}</div>
                  {off && (
                    <div className="mt-0.5 text-[10px] font-medium">off</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col">
          <label className="mb-1 text-sm font-medium text-slate-300">
            Note for new dates
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. vacation"
            className="mb-3 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 focus:border-fuchsia-400 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/50"
          />
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className="rounded-lg border border-fuchsia-400/60 bg-fuchsia-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-fuchsia-300 transition hover:bg-fuchsia-500/20 hover:shadow-[0_0_14px_rgba(217,70,239,0.5)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save time off"}
          </button>
          {message && (
            <p className="mt-2 text-xs text-fuchsia-200">{message}</p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-[#1e293b] pt-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Pending time off ({pending.length})
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No time-off dates requested.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pending.map((iso) => {
              const dow =
                DAY_NAMES[new Date(iso + "T00:00:00Z").getUTCDay()];
              const n = notes.get(iso);
              return (
                <span
                  key={iso}
                  className="inline-flex items-center gap-2 rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-1 text-xs text-fuchsia-200"
                >
                  {dow} {iso}
                  {n ? <span className="text-fuchsia-300/70">· {n}</span> : null}
                  <button
                    type="button"
                    onClick={() => removeDate(iso)}
                    className="text-fuchsia-300 hover:text-fuchsia-100"
                    title="Remove"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
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
