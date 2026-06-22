"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip, ShiftLegend } from "@/components/ShiftChip";
import { MONTH_NAMES } from "@/lib/shift-style";
import { fetchMonth, fetchPhysicians, generateMonth } from "@/lib/client";
import type {
  AssignmentDTO,
  MonthScheduleDTO,
  PhysicianDTO,
} from "@/lib/api-types";

type View = "day" | "physician";

export default function SchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [data, setData] = useState<MonthScheduleDTO | null>(null);
  const [physicians, setPhysicians] = useState<PhysicianDTO[]>([]);
  const [view, setView] = useState<View>("day");
  const [editing, setEditing] = useState<AssignmentDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [m, p] = await Promise.all([
      fetchMonth(year, month),
      fetchPhysicians(),
    ]);
    setData(m);
    setPhysicians(p);
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const regenerate = async () => {
    setBusy(true);
    try {
      await generateMonth(year, month);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copyTSV = async () => {
    if (!data) return;
    const tsv = buildTSV(data);
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const assignments = data?.assignments ?? [];
  const warnings = data?.lastRun?.warnings ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-sm text-slate-500">
            {MONTH_NAMES[month - 1]} {year}
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          <button
            onClick={() => setView("day")}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              view === "day" ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            By day
          </button>
          <button
            onClick={() => setView("physician")}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              view === "physician"
                ? "bg-blue-600 text-white"
                : "text-slate-600"
            }`}
          >
            By physician
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={regenerate}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            onClick={copyTSV}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            {copied ? "Copied!" : "Copy (TSV)"}
          </button>
          <a
            href={`/api/export/csv?year=${year}&month=${month}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            CSV
          </a>
          <a
            href={`/api/export/xlsx?year=${year}&month=${month}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            XLSX
          </a>
          <Link
            href={`/schedule/print?year=${year}&month=${month}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Print
          </Link>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
        <ShiftLegend />
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No schedule for this month yet. Click <strong>Regenerate</strong> to
          build one.
        </div>
      ) : view === "day" ? (
        <DayView assignments={assignments} onEdit={setEditing} />
      ) : (
        <PhysicianView
          assignments={assignments}
          physicians={physicians}
        />
      )}

      {warnings.length > 0 && (
        <WarningsPanel warnings={warnings} />
      )}

      {editing && (
        <EditModal
          assignment={editing}
          physicians={physicians}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function DayView({
  assignments,
  onEdit,
}: {
  assignments: AssignmentDTO[];
  onEdit: (a: AssignmentDTO) => void;
}) {
  const byDate = useMemo(() => groupByDate(assignments), [assignments]);
  return (
    <div className="space-y-3">
      {Array.from(byDate.entries()).map(([date, items]) => (
        <div
          key={date}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{formatDate(date)}</h3>
            <span className="text-xs text-slate-400">
              {items.filter((i) => i.physicianId).length}/{items.length} filled
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {items.map((a) => (
              <button
                key={a.id}
                onClick={() => onEdit(a)}
                className="group relative"
                title="Click to edit"
              >
                <ShiftChip
                  shiftType={a.shiftType}
                  rounderIndex={a.rounderIndex}
                  name={a.physicianName}
                />
                {a.isLocked && (
                  <span className="absolute -right-1 -top-1 text-[10px]">
                    🔒
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PhysicianView({
  assignments,
  physicians,
}: {
  assignments: AssignmentDTO[];
  physicians: PhysicianDTO[];
}) {
  const byPhysician = useMemo(() => {
    const map = new Map<string, AssignmentDTO[]>();
    for (const a of assignments) {
      if (!a.physicianId) continue;
      if (!map.has(a.physicianId)) map.set(a.physicianId, []);
      map.get(a.physicianId)!.push(a);
    }
    return map;
  }, [assignments]);

  const rows = physicians
    .map((p) => ({ p, items: byPhysician.get(p.id) ?? [] }))
    .filter((r) => r.items.length > 0 || r.p.active);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="px-4 py-2">Physician</th>
            <th className="px-4 py-2">Total</th>
            <th className="px-4 py-2">Rounding</th>
            <th className="px-4 py-2">Day Admit</th>
            <th className="px-4 py-2">Nights</th>
            <th className="px-4 py-2">Dates</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, items }) => {
            const rounding = items.filter(
              (i) => i.shiftType === "ROUNDER"
            ).length;
            const admin = items.filter((i) => i.shiftType === "ADMIN").length;
            const nights = items.filter((i) =>
              i.shiftType.startsWith("NIGHT")
            ).length;
            return (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium">{p.fullName}</td>
                <td className="px-4 py-2">{items.length}</td>
                <td className="px-4 py-2">{rounding}</td>
                <td className="px-4 py-2">{admin}</td>
                <td className="px-4 py-2">{nights}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {items
                    .map((i) => i.date.slice(8))
                    .sort()
                    .join(", ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WarningsPanel({ warnings }: { warnings: string[] }) {
  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-2 font-semibold text-amber-800">
        Warnings ({warnings.length})
      </h3>
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-amber-800">
        {warnings.map((w, i) => (
          <li key={i}>• {w}</li>
        ))}
      </ul>
    </div>
  );
}

function EditModal({
  assignment,
  physicians,
  onClose,
  onSaved,
}: {
  assignment: AssignmentDTO;
  physicians: PhysicianDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [physicianId, setPhysicianId] = useState(
    assignment.physicianId ?? ""
  );
  const [isLocked, setIsLocked] = useState(assignment.isLocked);
  const [saving, setSaving] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`/api/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Edit assignment</h3>
        <p className="mb-4 text-sm text-slate-500">
          {formatDate(assignment.date)} ·{" "}
          {assignment.shiftType === "ROUNDER"
            ? `Rounder ${assignment.rounderIndex}`
            : assignment.shiftType.replace(/_/g, " ")}{" "}
          ({assignment.startTime}–{assignment.endTime})
        </p>

        <label className="mb-1 block text-sm font-medium">Physician</label>
        <select
          value={physicianId}
          onChange={(e) => setPhysicianId(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">— Unfilled —</option>
          {physicians.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isLocked}
            onChange={(e) => setIsLocked(e.target.checked)}
          />
          Lock this slot (preserved on regenerate)
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => patch({ clear: true })}
            disabled={saving}
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            Clear slot
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => patch({ physicianId, isLocked })}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function groupByDate(
  assignments: AssignmentDTO[]
): Map<string, AssignmentDTO[]> {
  const map = new Map<string, AssignmentDTO[]>();
  for (const a of assignments) {
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date)!.push(a);
  }
  for (const items of map.values()) {
    items.sort((x, y) => {
      const order = (t: string) =>
        t === "ROUNDER" ? 0 : t === "ADMIN" ? 1 : 2;
      if (order(x.shiftType) !== order(y.shiftType))
        return order(x.shiftType) - order(y.shiftType);
      return (x.rounderIndex ?? 0) - (y.rounderIndex ?? 0);
    });
  }
  return new Map(Array.from(map.entries()).sort());
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function buildTSV(data: MonthScheduleDTO): string {
  const byDate = groupByDate(data.assignments);
  const header = [
    "Date",
    ...Array.from({ length: 10 }, (_, i) => `R${i + 1}`),
    "Day Admit",
    "Night1",
    "Night2",
  ].join("\t");
  const lines = [header];
  for (const [date, items] of byDate) {
    const cell = (type: string, idx?: number) =>
      items.find(
        (i) => i.shiftType === type && (idx ? i.rounderIndex === idx : true)
      )?.physicianName ?? "";
    lines.push(
      [
        date,
        ...Array.from({ length: 10 }, (_, i) => cell("ROUNDER", i + 1)),
        cell("ADMIN"),
        cell("NIGHT_ADMIT_1"),
        cell("NIGHT_ADMIT_2"),
      ].join("\t")
    );
  }
  return lines.join("\n");
}
