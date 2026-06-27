"use client";

import { useCallback, useEffect, useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftLegend } from "@/components/ShiftChip";
import { Card, CardHeader, SECONDARY_BTN } from "@/components/Card";
import {
  GridIcon,
  CheckIcon,
  AlertTriangleIcon,
  ScalesIcon,
  DownloadIcon,
  PrinterIcon,
} from "@/components/icons";
import { MONTH_NAMES, getHospitalBadge } from "@/lib/shift-style";
import { daysInMonth } from "@/lib/scheduler/dates";
import {
  DEFAULT_COVERAGE,
  DEFAULT_COMMUNITY_COVERAGE,
  normalizeCoverage,
  normalizeCommunityCoverage,
  totalDailySlots,
  COMMUNITY_HOSPITALS,
  COMMUNITY_COUNT_KEY,
  type CoverageSettings,
  type CommunityCoverage,
} from "@/lib/scheduler/shifts";
import { fetchMonth, generateMonth } from "@/lib/client";
import type { MonthScheduleDTO, UnfilledSlotDTO } from "@/lib/api-types";
import type { Hospital } from "@prisma/client";

const COVERAGE_STORAGE_KEY = "hs.coverage";
const communityKey = (h: string) =>
  `coverage.community.${h.toLowerCase()}.rounders`;

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

function loadStoredCommunity(): CommunityCoverage {
  if (typeof window === "undefined") return DEFAULT_COMMUNITY_COVERAGE;
  const read = (h: string) => {
    const v = Number(window.localStorage.getItem(communityKey(h)));
    return Number.isFinite(v) ? v : 0;
  };
  return normalizeCommunityCoverage({
    carsonRounderCount: read("CARSON"),
    eatonRounderCount: read("EATON"),
    clintonRounderCount: read("CLINTON"),
  });
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
  const [coverage, setCoverage] = useState<CoverageSettings>(DEFAULT_COVERAGE);
  const [community, setCommunity] = useState<CommunityCoverage>(
    DEFAULT_COMMUNITY_COVERAGE
  );

  // Hydrate coverage inputs from localStorage after mount (SSR-safe).
  useEffect(() => {
    setCoverage(loadStoredCoverage());
    setCommunity(loadStoredCommunity());
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

  const setCommunityCount = (
    hospital: (typeof COMMUNITY_HOSPITALS)[number],
    value: number
  ) => {
    const key = COMMUNITY_COUNT_KEY[hospital];
    setCommunity((c) => {
      const next = { ...c, [key]: Number.isFinite(value) ? value : 0 };
      try {
        window.localStorage.setItem(
          communityKey(hospital),
          String(next[key])
        );
      } catch {
        /* ignore quota / private-mode errors */
      }
      return next;
    });
  };

  const communityPerDay =
    community.carsonRounderCount +
    community.eatonRounderCount +
    community.clintonRounderCount;
  const totalPerDay = totalDailySlots(coverage);
  const numDays = daysInMonth(year, month);
  const projectedAssignments = numDays * (totalPerDay + communityPerDay);

  const onGenerate = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const settings = normalizeCoverage(coverage);
      const communitySettings = normalizeCommunityCoverage(community);
      try {
        window.localStorage.setItem(
          COVERAGE_STORAGE_KEY,
          JSON.stringify(settings)
        );
        for (const h of COMMUNITY_HOSPITALS) {
          window.localStorage.setItem(
            communityKey(h),
            String(communitySettings[COMMUNITY_COUNT_KEY[h]])
          );
        }
      } catch {
        /* ignore */
      }
      const result = await generateMonth(
        year,
        month,
        false,
        settings,
        communitySettings
      );
      setUnfilled(result.unfilledSlots ?? []);
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
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {MONTH_NAMES[month - 1]} {year} coverage overview
          </p>
        </div>
        <div className="text-right">
          <MonthPicker year={year} month={month} onChange={(y, m) => {
            setYear(y);
            setMonth(m);
            setUnfilled([]);
          }} />
          <p className="mt-1 text-xs text-slate-400">
            {numDays} days in {MONTH_NAMES[month - 1]} {year} · projected{" "}
            <strong>{projectedAssignments}</strong> assignments (
            {numDays} × {totalPerDay}/day)
          </p>
        </div>
      </header>

      {unfilled.length > 0 && (
        <div className="mb-6 rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/10 p-4 shadow-[0_0_14px_rgba(217,70,239,0.25)]">
          <p className="mb-2 font-semibold uppercase tracking-wide text-fuchsia-300">
            {unfilled.length} slot{unfilled.length === 1 ? "" : "s"} could not be
            filled — too many physicians off
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-fuchsia-200/90">
            {unfilled.map((s, i) => (
              <li key={i}>
                • {s.date} —{" "}
                {s.shiftType === "ROUNDER" && s.rounderIndex
                  ? `Rounder ${s.rounderIndex}`
                  : s.shiftType.replace(/_/g, " ")}{" "}
                · {getHospitalBadge(s.hospital).label}
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
          sub={`${totalPerDay + communityPerDay} / day · across all hospitals`}
          accent="cyan"
          Icon={GridIcon}
        />
        <StatCard
          label="Filled"
          value={filled}
          sub={total > 0 ? `of ${total} expected` : undefined}
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

      <Card className="mb-6">
        <CardHeader
          title="Daily coverage"
          subtitle="Adjust how many of each shift to fill per day for this month."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <p className="mt-4 text-sm font-medium text-slate-400">
          Total slots per day ={" "}
          <span className="tabular-nums text-slate-200">{totalPerDay}</span>
        </p>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Community hospitals"
          subtitle="Rounding-only locations. Set how many rounders to fill per day at each community hospital (0 disables it). Only physicians flagged eligible are scheduled there."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COMMUNITY_HOSPITALS.map((h) => {
            const badge = getHospitalBadge(h as Hospital);
            return (
              <CountField
                key={h}
                label={badge.label}
                value={community[COMMUNITY_COUNT_KEY[h]]}
                min={0}
                max={20}
                onChange={(v) => setCommunityCount(h, v)}
              />
            );
          })}
        </div>
        <p className="mt-4 text-sm font-medium text-slate-400">
          Community rounders per day ={" "}
          <span className="tabular-nums text-slate-200">{communityPerDay}</span>
        </p>
      </Card>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
              <span className="inline-block h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
              Generate schedule
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Assigns nights first, then day admitting, then rounders — preserving any
              locked or manually edited slots.
            </p>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="w-full min-h-[44px] rounded-lg border border-cyan-400 bg-cyan-500/15 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/25 hover:shadow-[0_0_18px_rgba(34,211,238,0.55)] disabled:opacity-50 md:w-auto md:min-h-0"
          >
            {generating ? "Generating…" : "Generate Schedule"}
          </button>
        </div>
        {message && (
          <p className="mt-3 text-sm text-slate-400">{message}</p>
        )}
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
      </Card>
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
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-300">
        {label}{" "}
        <span className="text-slate-500">
          ({min}–{max})
        </span>
      </span>
      <div className="mt-0.5 flex items-stretch gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - 1))}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-cyan-400/50 bg-cyan-500/10 text-lg font-bold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-40 md:hidden"
          disabled={value <= min}
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(clamp(n));
          }}
          className="w-full min-w-0 rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-center text-sm tabular-nums text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 md:text-left"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(value + 1))}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-cyan-400/50 bg-cyan-500/10 text-lg font-bold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-40 md:hidden"
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </label>
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
      className={`rounded-xl border border-t-2 border-slate-800/80 ${a.border} bg-slate-900/40 backdrop-blur-sm p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.04),0_8px_24px_rgba(0,0,0,0.4)]`}
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
