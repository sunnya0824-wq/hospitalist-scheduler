"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MonthPicker } from "@/components/MonthPicker";
import { MONTH_NAMES, getHospitalBadge } from "@/lib/shift-style";
import { HOSPITALS, HOSPITAL_LABELS } from "@/lib/scheduler/shifts";
import { fetchMonth } from "@/lib/client";
import type {
  MonthScheduleDTO,
  PhysicianStatDTO,
} from "@/lib/api-types";

function AnalyticsContent() {
  const router = useRouter();
  const search = useSearchParams();
  const now = new Date();
  const [year, setYear] = useState(
    Number(search.get("year")) || now.getUTCFullYear()
  );
  const [month, setMonth] = useState(
    Number(search.get("month")) || now.getUTCMonth() + 1
  );
  const [data, setData] = useState<MonthScheduleDTO | null>(null);

  const load = useCallback(async () => {
    setData(await fetchMonth(year, month));
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const changeMonth = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
    router.replace(`/analytics?year=${y}&month=${m}`);
  };

  const stats = data?.lastRun?.summary?.stats ?? [];
  const fairness = data?.lastRun?.summary?.fairnessScore ?? null;
  const warnings = data?.lastRun?.warnings ?? [];
  const maxTotal = Math.max(1, ...stats.map((s) => s.total));
  const maxNights = Math.max(1, ...stats.map((s) => s.nights));

  const dist = (vals: number[]) => {
    if (vals.length === 0) return { stddev: 0, range: 0 };
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    const variance =
      vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    return {
      stddev: Math.sqrt(variance),
      range: Math.max(...vals) - Math.min(...vals),
    };
  };
  const allDist = dist(stats.map((s) => s.total));
  const weekendDist = dist(stats.map((s) => s.weekends));
  const holidayDist = dist(stats.map((s) => s.holidays));

  const assignments = data?.assignments ?? [];
  const hospitalBreakdown = HOSPITALS.map((h) => {
    const slots = assignments.filter((a) => a.hospital === h);
    const filled = slots.filter((a) => a.physicianId);
    return {
      hospital: h,
      total: slots.length,
      filled: filled.length,
      physicians: new Set(filled.map((a) => a.physicianId)).size,
    };
  }).filter((r) => r.total > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">
            {MONTH_NAMES[month - 1]} {year} workload &amp; fairness
          </p>
        </div>
        <MonthPicker year={year} month={month} onChange={changeMonth} />
      </header>

      {stats.length === 0 ? (
        <div className="rounded-xl border border-dashed border-cyan-900/40 bg-slate-900/40 p-12 text-center">
          <svg
            width="120"
            height="72"
            viewBox="0 0 120 72"
            className="mx-auto mb-6"
            aria-hidden
          >
            <rect x="14" y="40" width="16" height="28" rx="2" fill="#22d3ee" opacity="0.7" />
            <rect x="38" y="26" width="16" height="42" rx="2" fill="#e879f9" opacity="0.7" />
            <rect x="62" y="14" width="16" height="54" rx="2" fill="#22d3ee" opacity="0.55" />
            <rect x="86" y="32" width="16" height="36" rx="2" fill="#fbbf24" opacity="0.7" />
            <line x1="8" y1="68" x2="112" y2="68" stroke="#1e293b" strokeWidth="2" />
          </svg>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
            No analytics yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Generate a schedule for this month to see fairness, coverage, and
            workload analytics.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400 bg-cyan-500/15 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/25 hover:shadow-[0_0_18px_rgba(34,211,238,0.55)]"
          >
            Go to dashboard →
          </a>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Physicians" value={stats.length} />
            <Metric
              label="Fairness score"
              value={fairness ?? "—"}
              hint="0–100, higher is fairer"
            />
            <Metric
              label="Total nights"
              value={stats.reduce((a, s) => a + s.nights, 0)}
            />
            <Metric
              label="Violations"
              value={warnings.length}
              accent={warnings.length ? "text-rose-400" : "text-emerald-400"}
            />
          </div>

          {hospitalBreakdown.length > 0 && (
            <Section title="By hospital">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e293b] text-left text-xs uppercase text-cyan-400/70">
                      <th className="px-3 py-2">Hospital</th>
                      <th className="px-3 py-2">Slots</th>
                      <th className="px-3 py-2">Filled</th>
                      <th className="px-3 py-2">Gaps</th>
                      <th className="px-3 py-2">Physicians</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hospitalBreakdown.map((r) => {
                      const badge = getHospitalBadge(r.hospital);
                      const gaps = r.total - r.filled;
                      return (
                        <tr
                          key={r.hospital}
                          className="border-b border-[#1e293b] transition hover:bg-cyan-500/5"
                        >
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-xs font-medium ${badge.badge}`}
                            >
                              {badge.short}
                              <span className="text-slate-200">
                                {HOSPITAL_LABELS[r.hospital]}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2">{r.total}</td>
                          <td className="px-3 py-2 text-emerald-400">{r.filled}</td>
                          <td
                            className={`px-3 py-2 ${
                              gaps > 0 ? "text-rose-400" : "text-emerald-400"
                            }`}
                          >
                            {gaps}
                          </td>
                          <td className="px-3 py-2 text-slate-400">
                            {r.physicians}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section title="Fairness breakdown">
            <p className="mb-3 text-xs text-slate-400">
              Lower spread means a fairer split. Combined fairness score{" "}
              <span className="text-slate-200">{fairness ?? "—"}</span> is the
              headline; the three measures below break it out by shift kind.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FairnessStat
                label="All shifts"
                dist={allDist}
                accent="text-cyan-300"
              />
              <FairnessStat
                label="Weekend shifts"
                dist={weekendDist}
                accent="text-fuchsia-300"
              />
              <FairnessStat
                label="Holiday shifts"
                dist={holidayDist}
                accent="text-amber-300"
              />
            </div>
          </Section>

          <Section title="Assigned / Target">
            <div className="space-y-2">
              {stats.map((s) => {
                const target = s.target || 0;
                const ratio = target > 0 ? s.total / target : 1;
                const status =
                  target === 0
                    ? "none"
                    : s.total > target
                    ? "over"
                    : s.total === target
                    ? "at"
                    : "under";
                const barColor =
                  status === "over"
                    ? "bg-rose-400"
                    : status === "at"
                    ? "bg-amber-400"
                    : "bg-emerald-400";
                return (
                  <div
                    key={s.physicianId}
                    className="flex items-center gap-3"
                  >
                    <div className="w-40 shrink-0 truncate text-sm">
                      {s.fullName}
                    </div>
                    <div className="relative h-5 flex-1 rounded bg-[#0a0e1a]">
                      <div
                        className={`h-5 rounded ${barColor}`}
                        style={{
                          width: `${Math.min(ratio, 1.5) / 1.5 * 100}%`,
                        }}
                      />
                      {target > 0 && (
                        <div
                          className="absolute top-0 h-5 w-0.5 bg-slate-300"
                          style={{ left: `${(1 / 1.5) * 100}%` }}
                          title={`Target ${target}`}
                        />
                      )}
                    </div>
                    <div className="w-16 text-right text-sm font-medium">
                      {s.total}/{target || "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Total shifts per physician">
            <BarList
              stats={stats}
              value={(s) => s.total}
              max={maxTotal}
              color="bg-cyan-400"
              target={(s) => s.target || s.desiredShifts}
            />
          </Section>

          <Section title="Night distribution">
            <BarList
              stats={stats}
              value={(s) => s.nights}
              max={maxNights}
              color="bg-teal-400"
            />
          </Section>

          <Section title="Day admitting & weekend distribution">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e293b] text-left text-xs uppercase text-cyan-400/70">
                    <th className="px-3 py-2">Physician</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Rounding</th>
                    <th className="px-3 py-2">Day Admit</th>
                    <th className="px-3 py-2">Nights</th>
                    <th className="px-3 py-2">Weekends</th>
                    <th className="px-3 py-2">Holidays</th>
                    <th className="px-3 py-2">Nights cap</th>
                    <th className="px-3 py-2">Weekends cap</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.physicianId} className="border-b border-[#1e293b] transition hover:bg-cyan-500/5">
                      <td className="px-3 py-2 font-medium text-slate-200">{s.fullName}</td>
                      <td className="px-3 py-2">{s.total}</td>
                      <td className="px-3 py-2">{s.rounding}</td>
                      <td className="px-3 py-2">{s.admin}</td>
                      <td className="px-3 py-2">{s.nights}</td>
                      <td className="px-3 py-2">{s.weekends}</td>
                      <td className="px-3 py-2 text-amber-300/80">
                        {s.holidays}
                      </td>
                      <td className="px-3 py-2">
                        <CapCell used={s.nights} cap={s.maxNightsPerMonth} />
                      </td>
                      <td className="px-3 py-2">
                        <CapCell used={s.weekends} cap={s.maxWeekendsPerMonth} />
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {s.target || s.desiredShifts}
                      </td>
                      <td className="px-3 py-2">
                        {s.belowMin ? (
                          <span className="text-rose-400">Below min</span>
                        ) : s.aboveMax ? (
                          <span className="text-amber-300">Above max</span>
                        ) : (
                          <span className="text-emerald-400">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Constraint violations (${warnings.length})`}>
            {warnings.length === 0 ? (
              <p className="text-sm text-emerald-400">
                No constraint violations — full coverage achieved.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm text-slate-300">
                {warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading…</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}

function Metric({
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

function CapCell({ used, cap }: { used: number; cap: number | null }) {
  if (cap == null) return <span className="text-slate-600">—</span>;
  const over = used > cap;
  const at = used === cap;
  return (
    <span
      className={`tabular-nums font-medium ${
        over ? "text-rose-400" : at ? "text-amber-300" : "text-emerald-400"
      }`}
      title={over ? "Over soft cap" : at ? "At soft cap" : "Within soft cap"}
    >
      {used}/{cap}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
      <h2 className="mb-3 font-semibold uppercase tracking-wide text-slate-200">{title}</h2>
      {children}
    </div>
  );
}

function FairnessStat({
  label,
  dist,
  accent,
}: {
  label: string;
  dist: { stddev: number; range: number };
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#0a0e1a] p-3">
      <div className={`text-xs font-medium uppercase tracking-wide ${accent}`}>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <div>
          <div className="text-lg font-bold text-slate-100">
            {dist.stddev.toFixed(2)}
          </div>
          <div className="text-[10px] uppercase text-slate-500">Std dev</div>
        </div>
        <div>
          <div className="text-lg font-bold text-slate-100">{dist.range}</div>
          <div className="text-[10px] uppercase text-slate-500">Range</div>
        </div>
      </div>
    </div>
  );
}

function BarList({
  stats,
  value,
  max,
  color,
  target,
}: {
  stats: PhysicianStatDTO[];
  value: (s: PhysicianStatDTO) => number;
  max: number;
  color: string;
  target?: (s: PhysicianStatDTO) => number;
}) {
  return (
    <div className="space-y-2">
      {stats.map((s) => {
        const v = value(s);
        return (
          <div key={s.physicianId} className="flex items-center gap-3">
            <div className="w-40 shrink-0 truncate text-sm">{s.fullName}</div>
            <div className="relative h-5 flex-1 rounded bg-[#0a0e1a]">
              <div
                className={`h-5 rounded ${color} shadow-[0_0_8px_rgba(34,211,238,0.35)]`}
                style={{ width: `${(v / max) * 100}%` }}
              />
              {target && (
                <div
                  className="absolute top-0 h-5 w-0.5 bg-fuchsia-400"
                  style={{ left: `${(target(s) / max) * 100}%` }}
                  title={`Target ${target(s)}`}
                />
              )}
            </div>
            <div className="w-8 text-right text-sm font-medium">{v}</div>
          </div>
        );
      })}
    </div>
  );
}
