"use client";

import { useCallback, useEffect, useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { MONTH_NAMES } from "@/lib/shift-style";
import { fetchMonth } from "@/lib/client";
import type {
  MonthScheduleDTO,
  PhysicianStatDTO,
} from "@/lib/api-types";

export default function AnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [data, setData] = useState<MonthScheduleDTO | null>(null);

  const load = useCallback(async () => {
    setData(await fetchMonth(year, month));
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.lastRun?.summary?.stats ?? [];
  const fairness = data?.lastRun?.summary?.fairnessScore ?? null;
  const warnings = data?.lastRun?.warnings ?? [];
  const maxTotal = Math.max(1, ...stats.map((s) => s.total));
  const maxNights = Math.max(1, ...stats.map((s) => s.nights));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-slate-500">
            {MONTH_NAMES[month - 1]} {year} workload & fairness
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
      </header>

      {stats.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No analytics yet. Generate a schedule for this month first.
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
              accent={warnings.length ? "text-rose-600" : "text-emerald-600"}
            />
          </div>

          <Section title="Total shifts per physician">
            <BarList
              stats={stats}
              value={(s) => s.total}
              max={maxTotal}
              color="bg-blue-500"
              target={(s) => s.desiredShifts}
            />
          </Section>

          <Section title="Night distribution">
            <BarList
              stats={stats}
              value={(s) => s.nights}
              max={maxNights}
              color="bg-indigo-500"
            />
          </Section>

          <Section title="Admin & weekend distribution">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-400">
                    <th className="px-3 py-2">Physician</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Rounding</th>
                    <th className="px-3 py-2">Admin</th>
                    <th className="px-3 py-2">Nights</th>
                    <th className="px-3 py-2">Weekends</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.physicianId} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium">{s.fullName}</td>
                      <td className="px-3 py-2">{s.total}</td>
                      <td className="px-3 py-2">{s.rounding}</td>
                      <td className="px-3 py-2">{s.admin}</td>
                      <td className="px-3 py-2">{s.nights}</td>
                      <td className="px-3 py-2">{s.weekends}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {s.desiredShifts}
                      </td>
                      <td className="px-3 py-2">
                        {s.belowMin ? (
                          <span className="text-rose-600">Below min</span>
                        ) : s.aboveMax ? (
                          <span className="text-amber-600">Above max</span>
                        ) : (
                          <span className="text-emerald-600">OK</span>
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
              <p className="text-sm text-emerald-600">
                No constraint violations — full coverage achieved.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm text-slate-700">
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

function Metric({
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
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
            <div className="relative h-5 flex-1 rounded bg-slate-100">
              <div
                className={`h-5 rounded ${color}`}
                style={{ width: `${(v / max) * 100}%` }}
              />
              {target && (
                <div
                  className="absolute top-0 h-5 w-0.5 bg-slate-700"
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
