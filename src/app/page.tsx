"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftLegend } from "@/components/ShiftChip";
import { MONTH_NAMES } from "@/lib/shift-style";
import { fetchMonth, generateMonth } from "@/lib/client";
import type { MonthScheduleDTO } from "@/lib/api-types";

const SLOTS_PER_DAY = 13;

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [data, setData] = useState<MonthScheduleDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const onGenerate = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      await generateMonth(year, month);
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
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {MONTH_NAMES[month - 1]} {year} coverage overview
          </p>
        </div>
        <MonthPicker year={year} month={month} onChange={(y, m) => {
          setYear(y);
          setMonth(m);
        }} />
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total slots" value={total} hint="13 / day" />
        <StatCard label="Filled" value={filled} accent="text-emerald-600" />
        <StatCard
          label="Coverage gaps"
          value={gaps}
          accent={gaps > 0 ? "text-rose-600" : "text-emerald-600"}
        />
        <StatCard
          label="Fairness"
          value={fairness === null ? "—" : `${fairness}`}
          hint="0–100"
        />
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Generate schedule</h2>
            <p className="text-sm text-slate-500">
              Assigns nights first, then admin, then rounders — preserving any
              locked or manually edited slots.
            </p>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate Schedule"}
          </button>
        </div>
        {message && (
          <p className="mt-3 text-sm text-slate-600">{message}</p>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Exports</h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportHref("csv")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Download CSV
          </a>
          <a
            href={exportHref("xlsx")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Download XLSX
          </a>
          <Link
            href={`/schedule/print?year=${year}&month=${month}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Print view
          </Link>
          <Link
            href="/schedule"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Open schedule
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
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
          <p className="mt-3 text-sm text-slate-500">
            No schedule yet for this month. Click{" "}
            <strong>Generate Schedule</strong> to build one. Each day needs{" "}
            {SLOTS_PER_DAY} assignments.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "text-slate-900",
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
