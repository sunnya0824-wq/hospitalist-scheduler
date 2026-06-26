"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftLegend } from "@/components/ShiftChip";
import { MONTH_NAMES } from "@/lib/shift-style";
import { daysInMonth } from "@/lib/scheduler/dates";
import {
  DEFAULT_COVERAGE,
  normalizeCoverage,
  totalDailySlots,
  type CoverageSettings,
} from "@/lib/scheduler/shifts";
import { fetchMonth, generateMonth } from "@/lib/client";
import type { MonthScheduleDTO } from "@/lib/api-types";

const COVERAGE_STORAGE_KEY = "hs.coverage";

function loadStoredCoverage(): CoverageSettings {
  if (typeof window === "undefined") return DEFAULT_COVERAGE;
  try {
    const raw = window.localStorage.getItem(COVERAGE_STORAGE_KEY);
    if (!raw) return DEFAULT_COVERAGE;
    return normalizeCoverage(JSON.parse(raw));
  } catch {
    return DEFAULT_COVERAGE;
  }
}

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [data, setData] = useState<MonthScheduleDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageSettings>(DEFAULT_COVERAGE);

  // Hydrate coverage inputs from localStorage after mount (SSR-safe).
  useEffect(() => {
    setCoverage(loadStoredCoverage());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchMonth(year, month));
    } catch {
      setMessage("Could not load schedule. Is the database connected?");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const setCount = (key: keyof CoverageSettings, value: number) => {
    setCoverage((c) => {
      const next = { ...c, [key]: Number.isFinite(value) ? value : 0 };
      try {
        window.localStorage.setItem(COVERAGE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode errors */
      }
      return next;
    });
  };

  const totalPerDay = totalDailySlots(coverage);
  const numDays = daysInMonth(year, month);
  const projectedAssignments = numDays * totalPerDay;

  const onGenerate = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const settings = normalizeCoverage(coverage);
      try {
        window.localStorage.setItem(
          COVERAGE_STORAGE_KEY,
          JSON.stringify(settings)
        );
      } catch {
        /* ignore */
      }
      await generateMonth(year, month, false, settings);
      await load();
      setMessage("Schedule generated.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const filled =
    data?.assignments.filter((a) => a.physicianId).length ?? 0;
  const total = data?.assignments.length ?? 0;
  const gaps = total - filled;
  const fairness = data?.lastRun?.summary?.fairnessScore ?? null;
  const warnings = data?.lastRun?.warnings?.length ?? 0;

  const exportHref = (fmt: "csv" | "xlsx") =>
    `/api/export/${fmt}?year=${year}&month=${month}`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-100 neon-text-cyan">
            Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            {MONTH_NAMES[month - 1]} {year} coverage overview
          </p>
        </div>
        <div className="text-right">
          <MonthPicker year={year} month={month} onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }} />
          <p className="mt-1 text-xs text-slate-400">
            {numDays} days in {MONTH_NAMES[month - 1]} {year} · projected{" "}
            <strong>{projectedAssignments}</strong> assignments (
            {numDays} × {totalPerDay}/day)
          </p>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total slots" value={total} hint={`${totalPerDay} / day`} />
        <StatCard label="Filled" value={filled} accent="text-emerald-400" />
        <StatCard
          label="Coverage gaps"
          value={gaps}
          accent={gaps > 0 ? "text-rose-400" : "text-emerald-400"}
        />
        <StatCard
          label="Fairness"
          value={fairness === null ? "—" : `${fairness}`}
          hint="Higher is fairer (0–100)"
        />
      </div>

      <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] transition hover:border-cyan-900/40 p-5">
        <h2 className="font-semibold">Daily coverage</h2>
        <p className="text-sm text-slate-400">
          Adjust how many of each shift to fill per day for this month.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <CountField
            label="Rounders"
            value={coverage.rounderCount}
            min={1}
            max={20}
            onChange={(v) => setCount("rounderCount", v)}
          />
          <CountField
            label="Day Admitting"
            value={coverage.dayAdmitCount}
            min={0}
            max={3}
            onChange={(v) => setCount("dayAdmitCount", v)}
          />
          <CountField
            label="Night Admit 1"
            value={coverage.nightAdmit1Count}
            min={0}
            max={2}
            onChange={(v) => setCount("nightAdmit1Count", v)}
          />
          <CountField
            label="Night Admit 2"
            value={coverage.nightAdmit2Count}
            min={0}
            max={2}
            onChange={(v) => setCount("nightAdmit2Count", v)}
          />
        </div>
        <p className="mt-4 text-sm font-medium text-cyan-300">
          Total slots per day = {totalPerDay}
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] transition hover:border-cyan-900/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Generate schedule</h2>
            <p className="text-sm text-slate-400">
              Assigns nights first, then day admitting, then rounders — preserving any
              locked or manually edited slots.
            </p>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate Schedule"}
          </button>
        </div>
        {message && (
          <p className="mt-3 text-sm text-slate-400">{message}</p>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] transition hover:border-cyan-900/40 p-5">
        <h2 className="mb-3 font-semibold">Exports</h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportHref("csv")}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            Download CSV
          </a>
          <a
            href={exportHref("xlsx")}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            Download XLSX
          </a>
          <Link
            href={`/schedule/print?year=${year}&month=${month}`}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            Print view
          </Link>
          <Link
            href="/schedule"
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            Open schedule
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-[#1e293b] bg-[#0f172a] transition hover:border-cyan-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Shift legend</h2>
          {warnings > 0 && (
            <Link
              href="/analytics"
              className="text-sm font-medium text-rose-600 hover:underline"
            >
              {warnings} warning{warnings === 1 ? "" : "s"} →
            </Link>
          )}
        </div>
        <ShiftLegend />
        {loading && (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        )}
        {!loading && total === 0 && (
          <p className="mt-3 text-sm text-slate-400">
            No schedule yet for this month. Click{" "}
            <strong>Generate Schedule</strong> to build one. Each day needs{" "}
            {totalPerDay} assignments.
          </p>
        )}
      </div>
    </div>
  );
}

function CountField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-300">
        {label}{" "}
        <span className="text-slate-500">
          ({min}–{max})
        </span>
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max, Math.max(min, Math.round(n))));
        }}
        className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
      />
    </label>
  );
}

function StatCard({
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
    <div className="rounded-xl border border-[#1e293b] bg-[#0f172a] transition hover:border-cyan-900/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-cyan-400/70">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
