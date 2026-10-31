"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip } from "@/components/ShiftChip";
import { Card, CardHeader } from "@/components/Card";
import { MONTH_NAMES, WEEKDAY_SHORT, colorStyle } from "@/lib/shift-style";
import {
  CATEGORY_LABELS,
  shiftHours,
  slotLabel,
  templateKeyOf,
} from "@/lib/scheduler/shifts";
import {
  addDaysISO,
  daysInMonth,
  isWeekend,
  toISODate,
  utcDate,
} from "@/lib/scheduler/dates";
import {
  fetchConfig,
  fetchMonth,
  fetchPhysicians,
  fetchTimeOff,
  saveTimeOff,
  deleteTimeOff,
  resetIcsToken,
  updatePhysician,
} from "@/lib/client";
import type {
  AssignmentDTO,
  ConfigDTO,
  MonthScheduleDTO,
  PhysicianDTO,
  TimeOffDTO,
} from "@/lib/api-types";

const DAY_NAMES = WEEKDAY_SHORT;

/** Shift length for display: whole hours, or one decimal when needed. */
function hoursLabel(start: string, end: string): string {
  const h = shiftHours(start, end);
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
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
  const [config, setConfig] = useState<ConfigDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [physicians, monthData, cfg] = await Promise.all([
        fetchPhysicians(),
        fetchMonth(year, month),
        fetchConfig().catch(() => null),
      ]);
      setPhysician(physicians.find((p) => p.id === id) ?? null);
      setData(monthData);
      if (cfg) setConfig(cfg);
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
    const map = new Map<string, AssignmentDTO[]>();
    for (const a of mine) {
      const arr = map.get(a.date) ?? [];
      arr.push(a);
      map.set(a.date, arr);
    }
    return map;
  }, [mine]);

  /** Highest slot index per (date, shift template), across the whole month. */
  const maxSlot = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data?.assignments ?? []) {
      const k = `${a.date}|${templateKeyOf(a)}`;
      m.set(k, Math.max(m.get(k) ?? 0, a.slotIndex));
    }
    return m;
  }, [data]);

  const labelOf = useCallback(
    (a: AssignmentDTO) =>
      slotLabel(
        a.shiftCode,
        a.slotIndex,
        (maxSlot.get(`${a.date}|${templateKeyOf(a)}`) ?? 1) > 1
      ),
    [maxSlot]
  );

  const multiLocation = (data?.locations.length ?? 0) > 1;
  const holidays = useMemo(() => data?.holidays ?? {}, [data]);

  const unavailable = useMemo(
    () => new Set(physician?.unavailableDates ?? []),
    [physician]
  );

  const counts = useMemo(() => {
    const weekendDays = new Set(data?.weekendDays ?? [0, 6]);
    const c = {
      total: mine.length,
      day: 0,
      admit: 0,
      night: 0,
      weekends: 0,
      holidays: 0,
    };
    for (const a of mine) {
      if (a.category === "DAY") c.day += 1;
      else if (a.category === "ADMIT") c.admit += 1;
      else if (a.category === "NIGHT") c.night += 1;
      if (isWeekend(a.date, weekendDays)) c.weekends += 1;
      if (holidays[a.date]) c.holidays += 1;
    }
    return c;
  }, [mine, data, holidays]);

  const byLocation = useMemo(() => {
    const order = new Map(
      (data?.locations ?? []).map((l) => [l.id, l.sortOrder])
    );
    const map = new Map<
      string,
      { key: string; name: string; code: string; sort: number; count: number }
    >();
    for (const a of mine) {
      const key = a.locationId ?? a.locationName;
      const row = map.get(key) ?? {
        key,
        name: a.locationName,
        code: a.locationCode,
        sort: (a.locationId ? order.get(a.locationId) : undefined) ?? 999,
        count: 0,
      };
      row.count += 1;
      map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) => a.sort - b.sort || a.name.localeCompare(b.name)
    );
  }, [mine, data]);

  const byShift = useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; color: string; locationCode: string; count: number }
    >();
    for (const a of mine) {
      const key = templateKeyOf(a);
      const row = map.get(key) ?? {
        key,
        name: a.shiftName,
        color: a.color,
        locationCode: a.locationCode,
        count: 0,
      };
      row.count += 1;
      map.set(key, row);
    }
    return [...map.values()];
  }, [mine]);

  const restrictedAllowed = (config?.locations ?? [])
    .filter(
      (l) => l.active && !l.openToAll && physician?.locationIds.includes(l.id)
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

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
            <h1 className="page-title">{physician.fullName}</h1>
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
                Can work nights
              </span>
            )}
            {physician.adminEligible && (
              <span className="rounded-md border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                Can work admitting shifts
              </span>
            )}
            {restrictedAllowed.map((l) => (
              <span
                key={l.id}
                className="rounded-md border border-violet-400/60 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-300"
                title={`Can work at ${l.name}`}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MonthPicker
            year={year}
            month={month}
            onChange={(y, m) => {
              setYear(y);
              setMonth(m);
            }}
          />
          <a
            href={`/physicians/${id}/print?year=${year}&month=${month}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_12px_rgba(34,211,238,0.4)]"
          >
            Export schedule (PDF)
          </a>
        </div>
      </header>

      <div className="my-8 h-px bg-gradient-to-r from-transparent via-cyan-900/40 to-transparent" />

      <WorkloadCard
        physician={physician}
        defaultNightBlock={config?.settings.preferredNightBlock ?? null}
        onSaved={load}
      />

      <PreferencesCard physician={physician} onSaved={load} />

      <LocationsCard physician={physician} config={config} onSaved={load} />

      <CalendarFeedCard physician={physician} />

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
            <SummaryCard label={`${CATEGORY_LABELS.DAY} shifts`} value={counts.day} />
            <SummaryCard label={`${CATEGORY_LABELS.ADMIT} shifts`} value={counts.admit} />
            <SummaryCard label={`${CATEGORY_LABELS.NIGHT} shifts`} value={counts.night} />
            <SummaryCard label="Weekend shifts" value={counts.weekends} />
            <SummaryCard label="Holiday shifts" value={counts.holidays} />
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
              {multiLocation ? "By location and shift" : "By shift"}
            </h2>
            {mine.length === 0 ? (
              <p className="text-sm text-slate-400">No assignments this month.</p>
            ) : (
              <>
                {multiLocation && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {byLocation.map((l) => (
                      <span
                        key={l.key}
                        className="inline-flex items-center gap-2 rounded-md border border-violet-400/60 bg-violet-500/10 px-3 py-1 text-sm font-medium text-violet-300"
                      >
                        {l.name}
                        <span className="font-bold">{l.count}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {byShift.map((r) => (
                    <span
                      key={r.key}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-medium ${colorStyle(r.color).badge}`}
                    >
                      {r.name}
                      {multiLocation && (
                        <span className="text-[10px] uppercase opacity-70">{r.locationCode}</span>
                      )}
                      <span className="font-bold">{r.count}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <CalendarGrid
            year={year}
            month={month}
            byDate={byDate}
            unavailable={unavailable}
            holidays={holidays}
            labelOf={labelOf}
          />

          <AssignmentTable
            assignments={mine}
            labelOf={labelOf}
            holidays={holidays}
            showLocation={multiLocation}
          />
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
  holidays,
  labelOf,
}: {
  year: number;
  month: number;
  byDate: Map<string, AssignmentDTO[]>;
  unavailable: Set<string>;
  holidays: Record<string, string>;
  labelOf: (a: AssignmentDTO) => string;
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
          const list = byDate.get(iso) ?? [];
          const a = list[0];
          const off = unavailable.has(iso);
          const holiday = holidays[iso];
          const dayNum = Number(iso.slice(8));
          return (
            <div
              key={iso}
              title={holiday || undefined}
              className={`min-h-[60px] rounded-md border p-1 text-left ${
                a ? colorStyle(a.color).chip : "border-[#1e293b] bg-[#0a0e1a]"
              }`}
            >
              <div
                className={`flex items-center gap-1 text-[10px] font-semibold ${
                  off ? "text-slate-500 line-through" : "text-slate-400"
                }`}
              >
                {dayNum}
                {holiday && (
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" aria-label={holiday} />
                )}
              </div>
              {list.length > 0 ? (
                <div className="mt-1 space-y-0.5 text-[10px] font-medium leading-tight">
                  {list.map((x) => (
                    <div key={x.id} title={`${x.shiftName} · ${x.locationName}`}>
                      {labelOf(x)}
                    </div>
                  ))}
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

function AssignmentTable({
  assignments,
  labelOf,
  holidays,
  showLocation,
}: {
  assignments: AssignmentDTO[];
  labelOf: (a: AssignmentDTO) => string;
  holidays: Record<string, string>;
  showLocation: boolean;
}) {
  const rows = [...assignments].sort((a, b) =>
    a.date < b.date
      ? -1
      : a.date > b.date
        ? 1
        : a.startTime.localeCompare(b.startTime)
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
            if (holidays[a.date]) notes.push(holidays[a.date]);
            return (
              <tr key={a.id} className="border-b border-[#1e293b] transition hover:bg-cyan-500/5">
                <td className="px-4 py-2 font-medium text-slate-200">{a.date}</td>
                <td className="px-4 py-2 text-slate-400">{dow}</td>
                <td className="px-4 py-2">
                  <ShiftChip
                    label={labelOf(a)}
                    color={a.color}
                    name={`${labelOf(a)} · ${a.shiftName}`}
                    locationCode={showLocation ? a.locationCode : null}
                    title={`${a.shiftName} at ${a.locationName} (${CATEGORY_LABELS[a.category]})`}
                  />
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {hoursLabel(a.startTime, a.endTime)}h
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

function WorkloadCard({
  physician,
  defaultNightBlock,
  onSaved,
}: {
  physician: PhysicianDTO;
  defaultNightBlock: number | null;
  onSaved: () => void | Promise<void>;
}) {
  const [fte, setFte] = useState(physician.fteMultiplier);
  const [target, setTarget] = useState<string>(
    physician.monthlyShiftTarget == null
      ? ""
      : String(physician.monthlyShiftTarget)
  );
  const [maxDays, setMaxDays] = useState(physician.maxConsecutiveDays);
  const [maxNightsRow, setMaxNightsRow] = useState(
    physician.maxConsecutiveNights ?? 7
  );
  const [nightBlock, setNightBlock] = useState<string>(
    physician.preferredNightBlock == null
      ? ""
      : String(physician.preferredNightBlock)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updatePhysician(physician.id, {
        fteMultiplier: fte,
        monthlyShiftTarget: target === "" ? null : Number(target),
        maxConsecutiveDays: maxDays,
        maxConsecutiveNights: maxNightsRow,
        preferredNightBlock:
          nightBlock === ""
            ? null
            : Math.min(31, Math.max(1, Math.round(Number(nightBlock)))),
      });
      setMessage("Workload saved.");
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        <span className="inline-block h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
        Workload
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        Fine-tune how many shifts this physician should work this month.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-300">
            FTE multiplier{" "}
            <span className="text-slate-500">(0.1–1.0)</span>
          </span>
          <input
            type="number"
            step={0.1}
            min={0.1}
            max={1.0}
            value={fte}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n))
                setFte(Math.min(1, Math.max(0.1, n)));
            }}
            className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-300">
            Monthly target{" "}
            <span className="text-slate-500">(blank = auto)</span>
          </span>
          <input
            type="number"
            min={0}
            max={31}
            value={target}
            placeholder="auto"
            onChange={(e) => setTarget(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-300">
            Max consecutive days{" "}
            <span className="text-slate-500">(1–14)</span>
          </span>
          <input
            type="number"
            min={1}
            max={14}
            value={maxDays}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n))
                setMaxDays(Math.min(14, Math.max(1, Math.round(n))));
            }}
            className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-300">
            Max nights in a row{" "}
            <span className="text-slate-500">(1–31)</span>
          </span>
          <input
            type="number"
            min={1}
            max={31}
            value={maxNightsRow}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n))
                setMaxNightsRow(Math.min(31, Math.max(1, Math.round(n))));
            }}
            className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-300">
            Preferred night block{" "}
            <span className="text-slate-500">(nights in a row)</span>
          </span>
          <input
            type="number"
            min={1}
            max={31}
            value={nightBlock}
            placeholder={
              defaultNightBlock != null
                ? `Group default (${defaultNightBlock})`
                : "Group default"
            }
            onChange={(e) => setNightBlock(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
          <span className="mt-0.5 block text-[11px] text-slate-500">
            Leave blank to use the group default
            {defaultNightBlock != null ? ` (${defaultNightBlock})` : ""}.
          </span>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save workload"}
        </button>
        {message && <span className="text-xs text-slate-400">{message}</span>}
      </div>
      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer text-slate-400 hover:text-cyan-300">
          Why these settings?
        </summary>
        <p className="mt-2 leading-relaxed">
          FTE scales the auto-computed monthly target. Leave the target blank to
          derive it from the FTE-weighted average. Max consecutive days and max
          nights in a row are hard caps the scheduler never exceeds. The
          preferred night block is how many nights the scheduler tries to group
          together when it gives this physician nights.
        </p>
      </details>
    </div>
  );
}

type Direction = "prefer" | "neutral" | "avoid";

function toDirection(prefer: boolean, avoid: boolean): Direction {
  if (prefer) return "prefer";
  if (avoid) return "avoid";
  return "neutral";
}

function PreferencesCard({
  physician,
  onSaved,
}: {
  physician: PhysicianDTO;
  onSaved: () => void | Promise<void>;
}) {
  const [nights, setNights] = useState<Direction>(
    toDirection(physician.prefersNights, physician.avoidsNights)
  );
  const [weekends, setWeekends] = useState<Direction>(
    toDirection(physician.prefersWeekends, physician.avoidsWeekends)
  );
  const [dayAdmit, setDayAdmit] = useState<Direction>(
    toDirection(physician.prefersDayAdmit, physician.avoidsDayAdmit)
  );
  const [avoidDays, setAvoidDays] = useState<Set<number>>(
    () =>
      new Set(
        Object.entries(physician.avoidWeekdays ?? {})
          .filter(([, v]) => v === true)
          .map(([k]) => Number(k))
      )
  );
  const [maxNights, setMaxNights] = useState<number | null>(
    physician.maxNightsPerMonth
  );
  const [maxWeekends, setMaxWeekends] = useState<number | null>(
    physician.maxWeekendsPerMonth
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const initial = useMemo(
    () => ({
      nights: toDirection(physician.prefersNights, physician.avoidsNights),
      weekends: toDirection(physician.prefersWeekends, physician.avoidsWeekends),
      dayAdmit: toDirection(physician.prefersDayAdmit, physician.avoidsDayAdmit),
      avoidKey: Object.entries(physician.avoidWeekdays ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => Number(k))
        .sort()
        .join(","),
      maxNights: physician.maxNightsPerMonth,
      maxWeekends: physician.maxWeekendsPerMonth,
    }),
    [physician]
  );

  const dirty =
    nights !== initial.nights ||
    weekends !== initial.weekends ||
    dayAdmit !== initial.dayAdmit ||
    [...avoidDays].sort().join(",") !== initial.avoidKey ||
    maxNights !== initial.maxNights ||
    maxWeekends !== initial.maxWeekends;

  const toggleDay = (dow: number) => {
    setMessage(null);
    setAvoidDays((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow);
      else next.add(dow);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const avoidWeekdays: Record<string, boolean> = {};
      for (const d of avoidDays) avoidWeekdays[String(d)] = true;
      await updatePhysician(physician.id, {
        prefersNights: nights === "prefer",
        avoidsNights: nights === "avoid",
        prefersWeekends: weekends === "prefer",
        avoidsWeekends: weekends === "avoid",
        prefersDayAdmit: dayAdmit === "prefer",
        avoidsDayAdmit: dayAdmit === "avoid",
        avoidWeekdays,
        maxNightsPerMonth: maxNights,
        maxWeekendsPerMonth: maxWeekends,
      });
      setMessage("Preferences saved.");
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader
        title="Preferences"
        subtitle="Soft, strongly-weighted scheduling preferences. The scheduler honors them aggressively but will override them when needed to fill coverage."
      />

      <div className="space-y-3">
        <DirectionRow label="Night shifts" value={nights} onChange={setNights} />
        <DirectionRow label="Weekends" value={weekends} onChange={setWeekends} />
        <DirectionRow
          label="Admitting shifts"
          value={dayAdmit}
          onChange={setDayAdmit}
        />
      </div>

      <div className="mt-6">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-300">
          Avoid specific weekdays
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {DAY_NAMES.map((name, dow) => {
            const on = avoidDays.has(dow);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleDay(dow)}
                aria-pressed={on}
                className={`flex min-h-[44px] items-center justify-center rounded-md border px-1 text-xs font-medium transition ${
                  on
                    ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_10px_rgba(217,70,239,0.35)]"
                    : "border-[#1e293b] bg-[#0a0e1a] text-slate-400 hover:border-fuchsia-500/40"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Tap a day to mark it as &ldquo;avoid&rdquo;. Scheduler will try to keep
          this physician off those days.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CapField
          label="Max night shifts per month"
          value={maxNights}
          onChange={(v) => {
            setMessage(null);
            setMaxNights(v);
          }}
        />
        <CapField
          label="Max weekends per month"
          value={maxWeekends}
          onChange={(v) => {
            setMessage(null);
            setMaxWeekends(v);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Soft caps. Scheduler will avoid exceeding these unless required to fill a
        slot.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="min-h-[44px] rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50 md:min-h-0"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {message && <span className="text-xs text-slate-400">{message}</span>}
      </div>
    </Card>
  );
}

function DirectionRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Direction;
  onChange: (d: Direction) => void;
}) {
  const options: { key: Direction; label: string; active: string }[] = [
    {
      key: "prefer",
      label: "Prefer",
      active:
        "border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.3)]",
    },
    {
      key: "neutral",
      label: "Neutral",
      active: "border-slate-400 bg-slate-500/20 text-slate-100",
    },
    {
      key: "avoid",
      label: "Avoid",
      active:
        "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_10px_rgba(217,70,239,0.3)]",
    },
  ];
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <div className="grid grid-cols-3 gap-1 sm:w-72">
        {options.map((o) => {
          const on = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              aria-pressed={on}
              className={`flex min-h-[44px] items-center justify-center rounded-md border px-2 text-xs font-medium transition md:min-h-0 md:py-1.5 ${
                on
                  ? o.active
                  : "border-[#1e293b] bg-[#0a0e1a] text-slate-500 hover:border-slate-600"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CapField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(31, Math.round(n)));
  const current = value ?? 0;
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      <div className="mt-0.5 flex items-stretch gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(current - 1))}
          disabled={value == null || value <= 0}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-cyan-400/50 bg-cyan-500/10 text-lg font-bold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-40"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          max={31}
          value={value ?? ""}
          placeholder="No limit"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(null);
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          className="w-full min-w-0 rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-center text-sm tabular-nums text-slate-200 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 md:text-left"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(current + 1))}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-cyan-400/50 bg-cyan-500/10 text-lg font-bold text-cyan-300 transition hover:bg-cyan-500/20"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={value == null}
          className="shrink-0 rounded-md border border-slate-700 px-2 text-xs font-medium uppercase tracking-wide text-slate-400 transition hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </label>
  );
}

function LocationsCard({
  physician,
  config,
  onSaved,
}: {
  physician: PhysicianDTO;
  config: ConfigDTO | null;
  onSaved: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(physician.locationIds)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set(physician.locationIds));
  }, [physician]);

  const active = (config?.locations ?? [])
    .filter((l) => l.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const restricted = active.filter((l) => !l.openToAll);
  const open = active.filter((l) => l.openToAll);

  const initialKey = [...physician.locationIds].sort().join(",");
  const dirty = [...selected].sort().join(",") !== initialKey;

  const toggle = (lid: string) => {
    setMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lid)) next.delete(lid);
      else next.add(lid);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updatePhysician(physician.id, { locationIds: [...selected] });
      setMessage("Locations saved.");
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        <span className="inline-block h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
        Can work at
      </h2>
      {!config ? (
        <p className="text-xs text-slate-400">Loading locations…</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-400">
            Some locations are limited to listed physicians. Tick the ones this
            physician may cover.
          </p>
          {restricted.length === 0 ? (
            <p className="text-sm text-slate-400">
              Every location is open to everyone. To limit a location to certain
              physicians, turn off &ldquo;open to everyone&rdquo; in{" "}
              <Link
                href="/settings"
                className="text-cyan-400 hover:text-cyan-300 hover:underline"
              >
                Settings
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {restricted.map((l) => (
                <label
                  key={l.id}
                  className="flex min-h-[44px] items-center gap-2 rounded-md px-1 text-sm text-slate-200 md:min-h-0 md:py-1"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggle(l.id)}
                  />
                  {l.name}
                  <span className="text-[10px] uppercase text-slate-500">
                    {l.code}
                  </span>
                </label>
              ))}
            </div>
          )}
          {open.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {open.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-2 px-1 py-1 text-sm text-slate-400"
                >
                  <input type="checkbox" checked disabled />
                  {l.name}
                  <span className="text-[10px] text-slate-500">
                    open to everyone
                  </span>
                </label>
              ))}
            </div>
          )}
          {restricted.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="min-h-[44px] rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50 md:min-h-0"
              >
                {saving ? "Saving…" : "Save locations"}
              </button>
              {message && (
                <span className="text-xs text-slate-400">{message}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CalendarFeedCard({ physician }: { physician: PhysicianDTO }) {
  const [token, setToken] = useState(physician.icsToken);
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [resetting, setResetting] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/api/ics/${token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const reset = async () => {
    if (
      !window.confirm(
        "Reset the calendar URL? Existing subscriptions will stop updating."
      )
    )
      return;
    setResetting(true);
    try {
      setToken(await resetIcsToken(physician.id));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        <span className="inline-block h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
        Calendar feed
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        Subscribe to this physician&apos;s shifts in any calendar app. The feed
        covers the last 30 days through the end of next month across all
        locations.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <code className="block w-full overflow-x-auto whitespace-nowrap rounded-md border border-cyan-900/40 bg-slate-950/60 px-3 py-2 pr-24 font-mono text-xs text-cyan-200">
            {url}
          </code>
          <button
            onClick={copy}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md border border-cyan-900/50 bg-slate-900/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300 transition hover:border-cyan-400/60 hover:text-cyan-200 hover:shadow-[0_0_12px_rgba(34,211,238,0.25)]"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <button
          onClick={reset}
          disabled={resetting}
          className="rounded-lg border border-rose-400/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset URL"}
        </button>
      </div>
      <button
        onClick={() => setShowHelp((v) => !v)}
        className="mt-3 text-xs font-medium text-cyan-300 hover:underline"
      >
        {showHelp ? "Hide" : "How to subscribe"} ▾
      </button>
      {showHelp && (
        <div className="mt-2 space-y-2 rounded-lg border border-[#1e293b] bg-[#0a0e1a] p-3 text-xs text-slate-400">
          <p>
            <span className="font-semibold text-slate-300">Google Calendar:</span>{" "}
            Other calendars → + → From URL → paste the URL above.
          </p>
          <p>
            <span className="font-semibold text-slate-300">Apple Calendar:</span>{" "}
            File → New Calendar Subscription → paste the URL.
          </p>
          <p>
            Subscribed calendars refresh on their own schedule; the feed always
            reflects the latest published schedule.
          </p>
        </div>
      )}
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
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
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
