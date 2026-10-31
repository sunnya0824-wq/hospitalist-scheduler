"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip, ShiftLegend } from "@/components/ShiftChip";
import { Card, CardHeader, SECONDARY_BTN } from "@/components/Card";
import {
  GridIcon,
  CheckIcon,
  AlertTriangleIcon,
  ScalesIcon,
  DownloadIcon,
  PrinterIcon,
  SettingsIcon,
} from "@/components/icons";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
} from "@/lib/shift-style";
import { daysInMonth, monthDates, weekdayOf } from "@/lib/scheduler/dates";
import {
  CATEGORY_LABELS,
  MAX_SLOTS_PER_DAY,
  slotLabel,
  templateKeyOf,
} from "@/lib/scheduler/shifts";
import { fetchMonth, generateMonth } from "@/lib/client";
import type {
  AssignmentDTO,
  FairnessBreakdownDTO,
  MonthCoverageDTO,
  MonthScheduleDTO,
  UnfilledSlotDTO,
} from "@/lib/api-types";

/** Slots a coverage row needs on one date, honoring an optional override. */
function slotsOn(
  c: MonthCoverageDTO,
  iso: string,
  holidays: Record<string, string>,
  override: number | null
): number {
  if (override != null) return override;
  if (holidays[iso] && c.holidayCount != null) return c.holidayCount;
  return c.dailyCounts[weekdayOf(iso)] ?? 0;
}

/** Plain-English summary of a template's default counts. */
function describeDefault(c: MonthCoverageDTO, weekendDays: number[]): string {
  const counts = c.dailyCounts;
  let base: string;
  if (counts.every((n) => n === counts[0])) {
    base = `${counts[0] ?? 0}/day`;
  } else {
    const wkend = new Set(weekendDays);
    const weekdayVals = counts.filter((_, i) => !wkend.has(i));
    const weekendVals = counts.filter((_, i) => wkend.has(i));
    const uniform = (v: number[]) => v.length > 0 && v.every((n) => n === v[0]);
    if (uniform(weekdayVals) && uniform(weekendVals)) {
      base = `Weekdays ${weekdayVals[0]}, weekends ${weekendVals[0]}`;
    } else {
      base = counts.map((n, i) => `${WEEKDAY_SHORT[i]} ${n}`).join(" · ");
    }
  }
  return c.holidayCount != null ? `${base} · Holidays ${c.holidayCount}` : base;
}

/** Parse an override input: blank → null, otherwise a clamped integer. */
function parseOverride(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_SLOTS_PER_DAY, Math.max(0, Math.round(n)));
}

interface LocationGroup<T> {
  id: string;
  name: string;
  items: T[];
}

function groupBy<T>(
  items: T[],
  id: (t: T) => string,
  name: (t: T) => string
): LocationGroup<T>[] {
  const groups = new Map<string, LocationGroup<T>>();
  for (const it of items) {
    const k = id(it);
    let g = groups.get(k);
    if (!g) {
      g = { id: k, name: name(it), items: [] };
      groups.set(k, g);
    }
    g.items.push(it);
  }
  return [...groups.values()];
}

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [data, setData] = useState<MonthScheduleDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unfilled, setUnfilled] = useState<UnfilledSlotDTO[]>([]);
  const [allowOverMax, setAllowOverMax] = useState(false);
  const [lastBreakdown, setLastBreakdown] =
    useState<FairnessBreakdownDTO | null>(null);
  /** templateId → raw input text ("" = use default). */
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>(
    {}
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchMonth(year, month);
      setData(d);
      const inputs: Record<string, string> = {};
      for (const c of d.coverage ?? []) {
        inputs[c.templateId] = c.override == null ? "" : String(c.override);
      }
      setOverrideInputs(inputs);
    } catch {
      setMessage("Could not load schedule. Is the database connected?");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const coverage = useMemo(() => data?.coverage ?? [], [data]);
  const holidays = useMemo(() => data?.holidays ?? {}, [data]);
  const weekendDays = data?.weekendDays ?? [0, 6];
  const assignments = useMemo(() => data?.assignments ?? [], [data]);
  const numDays = daysInMonth(year, month);
  const dates = useMemo(() => monthDates(year, month), [year, month]);

  const coverageGroups = useMemo(
    () =>
      groupBy(
        coverage,
        (c) => c.locationId,
        (c) => c.locationName
      ),
    [coverage]
  );

  // Projected slots for the month with the current inputs.
  const projection = useMemo(() => {
    const perDay = dates.map((iso) =>
      coverage.reduce(
        (sum, c) =>
          sum +
          slotsOn(c, iso, holidays, parseOverride(overrideInputs[c.templateId])),
        0
      )
    );
    const total = perDay.reduce((a, n) => a + n, 0);
    const min = perDay.length ? Math.min(...perDay) : 0;
    const max = perDay.length ? Math.max(...perDay) : 0;
    return { total, min, max };
  }, [coverage, dates, holidays, overrideInputs]);

  const perDayText =
    projection.min === projection.max
      ? `${projection.max}/day`
      : `${projection.min}–${projection.max}/day`;

  const onGenerate = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const overrides: Record<string, number> = {};
      for (const c of coverage) {
        const v = parseOverride(overrideInputs[c.templateId]);
        if (v != null) overrides[c.templateId] = v;
      }
      const result = await generateMonth(year, month, allowOverMax, overrides);
      setUnfilled(result.unfilledSlots ?? []);
      setLastBreakdown(result.fairnessBreakdown ?? null);
      await load();
      setMessage("Schedule generated.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const filled = assignments.filter((a) => a.physicianId).length;
  const total = assignments.length;
  const gaps = total - filled;
  const fairness = data?.lastRun?.summary?.fairnessScore ?? null;
  const breakdown =
    lastBreakdown ?? data?.lastRun?.summary?.fairnessBreakdown ?? null;
  const warnings = data?.lastRun?.warnings?.length ?? 0;
  const noShiftTypes = !!data && !loading && coverage.length === 0;

  // Filled vs required per location (from stored assignments).
  const locationSummary = useMemo(() => {
    const groups = groupBy(
      assignments,
      (a) => a.locationId ?? `name:${a.locationName}`,
      (a) => a.locationName
    );
    const order = new Map(
      (data?.locations ?? []).map((l) => [l.id, l.sortOrder] as const)
    );
    return groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        required: g.items.length,
        filled: g.items.filter((a) => a.physicianId).length,
      }))
      .sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }, [assignments, data]);
  const multiLocation = locationSummary.length > 1;

  // Assignments by day for the daily coverage list.
  const byDay = useMemo(() => {
    const m = new Map<string, AssignmentDTO[]>();
    for (const a of assignments) {
      const list = m.get(a.date) ?? [];
      list.push(a);
      m.set(a.date, list);
    }
    return m;
  }, [assignments]);

  // Highest slot index per (date, template), for unfilled-slot labels.
  const dayTemplateMax = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignments) {
      const k = `${a.date}|${templateKeyOf(a)}`;
      m.set(k, Math.max(m.get(k) ?? 0, a.slotIndex));
    }
    return m;
  }, [assignments]);

  const legendItems = useMemo(() => {
    if (assignments.length > 0) {
      return assignments.map((a) => ({ name: a.shiftName, color: a.color }));
    }
    return coverage.map((c) => ({
      name: c.name,
      color: c.color,
    }));
  }, [assignments, coverage]);

  const exportHref = (fmt: "csv" | "xlsx") =>
    `/api/export/${fmt}?year=${year}&month=${month}`;

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {MONTH_NAMES[month - 1]} {year} coverage overview
          </p>
        </div>
        <div className="text-right">
          <MonthPicker
            year={year}
            month={month}
            onChange={(y, m) => {
              setYear(y);
              setMonth(m);
              setUnfilled([]);
              setLastBreakdown(null);
              setMessage(null);
            }}
          />
          <p className="mt-1 text-xs text-slate-400">
            {numDays} days in {MONTH_NAMES[month - 1]} {year} · projected{" "}
            <strong>{projection.total}</strong> slots ({perDayText})
          </p>
        </div>
      </header>

      {unfilled.length > 0 && (
        <div className="mb-6 rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/10 p-4 shadow-[0_0_14px_rgba(217,70,239,0.25)]">
          <p className="mb-2 font-semibold uppercase tracking-wide text-fuchsia-300">
            {unfilled.length} slot{unfilled.length === 1 ? "" : "s"} could not be
            filled — not enough physicians available
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-fuchsia-200/90">
            {unfilled.map((s, i) => (
              <li key={i}>
                • {s.date} — {s.shiftName} (
                {slotLabel(
                  s.shiftCode,
                  s.slotIndex,
                  (dayTemplateMax.get(`${s.date}|${s.shiftTemplateId}`) ??
                    s.slotIndex) > 1
                )}
                )
                {multiLocation || coverageGroups.length > 1
                  ? ` · ${s.locationName}`
                  : ""}
              </li>
            ))}
          </ul>
          <Link
            href={`/schedule?year=${year}&month=${month}`}
            className="mt-2 inline-block text-sm font-medium text-fuchsia-300 hover:underline"
          >
            View on schedule →
          </Link>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total slots"
          value={total}
          sub={
            total > 0
              ? `${multiLocation ? `across ${locationSummary.length} locations` : "this month"}`
              : `${projection.total} projected · ${perDayText}`
          }
          accent="cyan"
          Icon={GridIcon}
        />
        <StatCard
          label="Filled"
          value={filled}
          sub={total > 0 ? `of ${total} needed` : undefined}
          accent="green"
          Icon={CheckIcon}
        />
        <StatCard
          label="Coverage gaps"
          value={gaps}
          sub={gaps > 0 ? "slots need a physician" : "fully covered"}
          accent={gaps > 0 ? "magenta" : "green"}
          Icon={AlertTriangleIcon}
        />
        <StatCard
          label="Fairness"
          value={fairness === null ? "—" : fairness}
          sub="0–100, higher is fairer"
          accent="amber"
          Icon={ScalesIcon}
          bar={fairness}
        />
      </div>

      {breakdown && (
        <Card className="mb-6">
          <CardHeader
            title="Fairness breakdown"
            subtitle="Workload: shifts vs each person's target. Nights: spread among people who share nights (nocturnists excluded). Weekends: weekend share."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BreakdownBar label="Workload" value={breakdown.workload} />
            <BreakdownBar label="Nights" value={breakdown.nights} />
            <BreakdownBar label="Weekends" value={breakdown.weekends} />
          </div>
        </Card>
      )}

      {noShiftTypes ? (
        <Card className="mb-6">
          <div className="py-6 text-center">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Set up your hospitals and shifts first
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              There are no shift types yet. Add your hospitals (locations) and
              the shifts each one needs, then come back to build a schedule.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-cyan-400 bg-cyan-500/15 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/25 hover:shadow-[0_0_18px_rgba(34,211,238,0.55)] md:min-h-0"
            >
              <SettingsIcon className="h-4 w-4" />
              Go to settings
            </Link>
          </div>
        </Card>
      ) : (
        coverage.length > 0 && (
          <Card className="mb-6">
            <CardHeader
              title="This month's coverage"
              subtitle="Defaults come from Settings. Enter a number to use that many slots every day this month, or leave blank to use the default."
              action={
                <Link
                  href="/settings"
                  className="shrink-0 text-xs font-medium text-cyan-300 hover:underline"
                >
                  Edit defaults →
                </Link>
              }
            />
            <div className="space-y-5">
              {coverageGroups.map((g) => (
                <div key={g.id}>
                  {coverageGroups.length > 1 && (
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                      {g.name}
                    </h3>
                  )}
                  <div className="space-y-2">
                    {g.items.map((c) => (
                      <OverrideRow
                        key={c.templateId}
                        coverage={c}
                        defaultText={describeDefault(c, weekendDays)}
                        value={overrideInputs[c.templateId] ?? ""}
                        onChange={(v) =>
                          setOverrideInputs((prev) => ({
                            ...prev,
                            [c.templateId]: v,
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-slate-400">
              Slots this month ={" "}
              <span className="tabular-nums text-slate-200">
                {projection.total}
              </span>{" "}
              · per day{" "}
              <span className="tabular-nums text-slate-200">{perDayText}</span>
              {Object.keys(holidays).length > 0 && (
                <span className="text-slate-500">
                  {" "}
                  · holidays: {Object.entries(holidays)
                    .map(([iso, name]) => `${name} (${iso.slice(8)})`)
                    .join(", ")}
                </span>
              )}
            </p>
          </Card>
        )
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
              <span className="inline-block h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
              Generate schedule
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Assigns nights first, then admitting, then day shifts — keeping
              any locked or manually edited slots.
            </p>
            <label className="mt-2 flex min-h-[44px] items-center gap-2 text-xs text-slate-300 md:min-h-0">
              <input
                type="checkbox"
                checked={allowOverMax}
                onChange={(e) => setAllowOverMax(e.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
              Allow going over a physician&apos;s maximum to fill gaps
            </label>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating || noShiftTypes}
            className="w-full min-h-[44px] rounded-lg border border-cyan-400 bg-cyan-500/15 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/25 hover:shadow-[0_0_18px_rgba(34,211,238,0.55)] disabled:opacity-50 md:w-auto md:min-h-0"
          >
            {generating ? "Generating…" : "Generate Schedule"}
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-slate-400">{message}</p>}
      </Card>

      <Card className="mb-6">
        <CardHeader title="Exports" />
        <div className="flex snap-x gap-2 overflow-x-auto [&>*]:shrink-0 md:flex-wrap md:overflow-visible">
          <a href={exportHref("csv")} className={`${SECONDARY_BTN} snap-start`}>
            <DownloadIcon className="h-3.5 w-3.5" />
            CSV
          </a>
          <a href={exportHref("xlsx")} className={`${SECONDARY_BTN} snap-start`}>
            <DownloadIcon className="h-3.5 w-3.5" />
            XLSX
          </a>
          <Link
            href={`/schedule/print?year=${year}&month=${month}`}
            className={`${SECONDARY_BTN} snap-start`}
          >
            <PrinterIcon className="h-3.5 w-3.5" />
            Print view
          </Link>
          <Link href="/schedule" className={`${SECONDARY_BTN} snap-start`}>
            <GridIcon className="h-3.5 w-3.5" />
            Open schedule
          </Link>
        </div>
      </Card>

      {total > 0 && (
        <Card className="mb-6">
          <CardHeader
            title="Coverage summary"
            subtitle={
              multiLocation
                ? "Filled vs needed at each location."
                : "Filled vs needed this month."
            }
          />
          <div className="space-y-2">
            {(multiLocation
              ? locationSummary
              : [{ id: "all", name: "All shifts", required: total, filled }]
            ).map((r) => (
              <CoverageBar
                key={r.id}
                label={r.name}
                filled={r.filled}
                required={r.required}
              />
            ))}
          </div>
        </Card>
      )}

      {total > 0 && (
        <Card className="mb-6">
          <CardHeader
            title="Daily coverage"
            subtitle="Tap a day to see its shifts."
          />
          <div className="space-y-1.5">
            {dates
              .filter((iso) => byDay.has(iso))
              .map((iso) => (
                <DayRow
                  key={iso}
                  iso={iso}
                  holiday={holidays[iso]}
                  weekend={weekendDays.includes(weekdayOf(iso))}
                  items={byDay.get(iso) ?? []}
                  multiLocation={multiLocation}
                />
              ))}
          </div>
        </Card>
      )}

      <Card hover>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            <span className="inline-block h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
            Shift legend
          </h2>
          {warnings > 0 && (
            <Link
              href="/analytics"
              className="text-sm font-medium text-fuchsia-300 hover:underline"
            >
              {warnings} warning{warnings === 1 ? "" : "s"} →
            </Link>
          )}
        </div>
        <ShiftLegend items={legendItems} />
        {loading && <p className="mt-3 text-sm text-slate-400">Loading…</p>}
        {!loading && total === 0 && !noShiftTypes && (
          <p className="mt-3 text-sm text-slate-400">
            No schedule yet for this month. Click{" "}
            <strong>Generate Schedule</strong> to build one ({projection.total}{" "}
            slots, {perDayText}).
          </p>
        )}
      </Card>
    </div>
  );
}

function OverrideRow({
  coverage: c,
  defaultText,
  value,
  onChange,
}: {
  coverage: MonthCoverageDTO;
  defaultText: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseOverride(value);
  const step = (delta: number) => {
    const base = parsed ?? c.dailyCounts[1] ?? 0;
    onChange(String(Math.min(MAX_SLOTS_PER_DAY, Math.max(0, base + delta))));
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#1e293b] bg-[#0a0e1a]/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
          <span className="font-medium">{c.name}</span>
          <span className="rounded-sm border border-slate-500/40 bg-slate-500/10 px-1 text-[10px] font-semibold uppercase text-slate-300">
            {c.code}
          </span>
          <span className="text-xs text-slate-500">
            {CATEGORY_LABELS[c.category]}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-slate-400">
          Default: {defaultText}
        </div>
      </div>
      <div className="flex items-stretch gap-1 sm:w-44">
        <button
          type="button"
          aria-label={`Fewer ${c.name}`}
          onClick={() => step(-1)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-cyan-400/50 bg-cyan-500/10 text-lg font-bold text-cyan-300 transition hover:bg-cyan-500/20 md:hidden"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_SLOTS_PER_DAY}
          value={value}
          placeholder="Use default"
          aria-label={`${c.name} slots per day this month`}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-center text-sm tabular-nums text-slate-200 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 md:text-left"
        />
        <button
          type="button"
          aria-label={`More ${c.name}`}
          onClick={() => step(1)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-cyan-400/50 bg-cyan-500/10 text-lg font-bold text-cyan-300 transition hover:bg-cyan-500/20 md:hidden"
        >
          +
        </button>
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="min-h-[44px] shrink-0 px-1 text-xs text-slate-500 hover:text-cyan-300 md:min-h-0"
            title="Use default"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function CoverageBar({
  label,
  filled,
  required,
}: {
  label: string;
  filled: number;
  required: number;
}) {
  const pct = required > 0 ? (filled / required) * 100 : 100;
  const full = filled >= required;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 truncate text-sm text-slate-300 sm:w-40">
        {label}
      </div>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${full ? "bg-emerald-400" : "bg-fuchsia-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={`w-20 text-right text-sm tabular-nums ${full ? "text-emerald-300" : "text-fuchsia-300"}`}
      >
        {filled}/{required}
      </div>
    </div>
  );
}

function DayRow({
  iso,
  holiday,
  weekend,
  items,
  multiLocation,
}: {
  iso: string;
  holiday?: string;
  weekend: boolean;
  items: AssignmentDTO[];
  multiLocation: boolean;
}) {
  const filled = items.filter((a) => a.physicianId).length;
  const required = items.length;
  const full = filled >= required;
  // Highest slot index per template this day, for slot labels.
  const maxIdx = new Map<string, number>();
  for (const a of items) {
    const k = templateKeyOf(a);
    maxIdx.set(k, Math.max(maxIdx.get(k) ?? 0, a.slotIndex));
  }
  const groups = multiLocation
    ? groupBy(
        items,
        (a) => a.locationId ?? a.locationName,
        (a) => a.locationName
      )
    : [{ id: "all", name: "", items }];
  return (
    <details className="group rounded-lg border border-[#1e293b] bg-[#0a0e1a]/60">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm md:min-h-0">
        <span className="flex items-center gap-2 text-slate-200">
          <span className="tabular-nums">
            {WEEKDAY_SHORT[weekdayOf(iso)]} {Number(iso.slice(8))}
          </span>
          {weekend && (
            <span className="text-[10px] uppercase text-slate-500">weekend</span>
          )}
          {holiday && (
            <span className="truncate text-xs text-amber-300">{holiday}</span>
          )}
        </span>
        <span
          className={`tabular-nums ${full ? "text-emerald-300" : "text-fuchsia-300"}`}
        >
          {filled}/{required}
          <span className="ml-2 inline-block text-slate-500 transition group-open:rotate-90">
            ›
          </span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-[#1e293b] px-3 py-2">
        {groups.map((g) => (
          <div key={g.id}>
            {g.name && (
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {g.name}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((a) => {
                const label = slotLabel(
                  a.shiftCode,
                  a.slotIndex,
                  (maxIdx.get(templateKeyOf(a)) ?? 1) > 1
                );
                return (
                  <ShiftChip
                    key={a.id}
                    label={label}
                    color={a.color}
                    name={a.physicianName ? `${label} ${a.physicianName}` : null}
                    empty={!a.physicianId}
                    title={`${a.shiftName} (${CATEGORY_LABELS[a.category]}) ${a.startTime}–${a.endTime}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#0a0e1a]/60 p-3">
      <div className="flex items-baseline justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
        {label}
        <span className="text-lg font-bold tabular-nums text-amber-300">
          {Math.round(value)}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400"
          style={{ width: `${Math.max(Math.min(value, 100), 4)}%` }}
        />
      </div>
    </div>
  );
}

type Accent = "cyan" | "green" | "magenta" | "amber";

const ACCENT: Record<Accent, { text: string; glow: string; border: string }> = {
  cyan: {
    text: "text-cyan-300",
    glow: "drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]",
    border: "border-t-cyan-400/60",
  },
  green: {
    text: "text-emerald-300",
    glow: "drop-shadow-[0_0_12px_rgba(52,211,153,0.4)]",
    border: "border-t-emerald-400/60",
  },
  magenta: {
    text: "text-fuchsia-300",
    glow: "drop-shadow-[0_0_12px_rgba(232,121,249,0.4)]",
    border: "border-t-fuchsia-400/60",
  },
  amber: {
    text: "text-amber-300",
    glow: "drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]",
    border: "border-t-amber-400/60",
  },
};

function StatCard({
  label,
  value,
  sub,
  accent,
  Icon,
  bar,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent: Accent;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  bar?: number | null;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`min-w-0 rounded-xl border border-t-2 border-slate-800/80 ${a.border} bg-slate-900/40 backdrop-blur-sm p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.04),0_8px_24px_rgba(0,0,0,0.4)]`}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-slate-400">
        <Icon className={`h-3.5 w-3.5 ${a.text}`} />
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums md:text-5xl ${a.text} ${a.glow}`}>
        {value}
      </div>
      {bar !== undefined && (
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full border border-amber-900/30 bg-slate-800">
          {bar !== null && (
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400 shadow-[0_0_12px_rgba(232,121,249,0.4)]"
              style={{ width: `${Math.max(bar, 4)}%` }}
            />
          )}
        </div>
      )}
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
