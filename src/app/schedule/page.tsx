"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip, ShiftLegend } from "@/components/ShiftChip";
import { MONTH_NAMES, getHospitalBadge } from "@/lib/shift-style";
import { scheduleColumns, HOSPITALS } from "@/lib/scheduler/shifts";
import { fetchMonth, fetchPhysicians, generateMonth } from "@/lib/client";
import type {
  AssignmentDTO,
  MonthScheduleDTO,
  PhysicianDTO,
} from "@/lib/api-types";
import type { Hospital } from "@prisma/client";

type View = "day" | "physician";
type HospitalTab = Hospital | "COMBINED";

const HOSPITAL_TABS: HospitalTab[] = [...HOSPITALS, "COMBINED"];

/** Parse the ?hospital= URL param into a tab value (defaults to MAIN). */
function parseHospitalTab(raw: string | null): HospitalTab {
  switch ((raw ?? "").toLowerCase()) {
    case "carson":
      return "CARSON";
    case "eaton":
      return "EATON";
    case "clinton":
      return "CLINTON";
    case "combined":
      return "COMBINED";
    default:
      return "MAIN";
  }
}

function hospitalTabLabel(tab: HospitalTab): string {
  return tab === "COMBINED" ? "Combined" : getHospitalBadge(tab).label;
}

function ScheduleContent() {
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
  const [physicians, setPhysicians] = useState<PhysicianDTO[]>([]);
  const [view, setView] = useState<View>("day");
  const [hospitalTab, setHospitalTab] = useState<HospitalTab>(
    parseHospitalTab(search.get("hospital"))
  );
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

  const syncUrl = (y: number, m: number, tab: HospitalTab) => {
    router.replace(
      `/schedule?year=${y}&month=${m}&hospital=${tab.toLowerCase()}`
    );
  };

  const changeMonth = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
    syncUrl(y, m, hospitalTab);
  };

  const changeHospital = (tab: HospitalTab) => {
    setHospitalTab(tab);
    syncUrl(year, month, tab);
  };

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

  const allAssignments = data?.assignments ?? [];
  const combined = hospitalTab === "COMBINED";
  const assignments = combined
    ? allAssignments
    : allAssignments.filter((a) => a.hospital === hospitalTab);
  const warnings = data?.lastRun?.warnings ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-100 neon-text-cyan">
            Schedule
          </h1>
          <p className="text-sm text-slate-400">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <MonthPicker year={year} month={month} onChange={changeMonth} />
      </header>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[#1e293b]">
        {HOSPITAL_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => changeHospital(tab)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition ${
              hospitalTab === tab
                ? "border-cyan-400 text-cyan-300 shadow-[0_2px_10px_-4px_rgba(34,211,238,0.6)]"
                : "border-transparent text-slate-400 hover:text-cyan-200"
            }`}
          >
            {hospitalTabLabel(tab)}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-[#1e293b] bg-[#0f172a] p-0.5">
          <button
            onClick={() => setView("day")}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${
              view === "day"
                ? "bg-cyan-500/15 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                : "text-slate-400 hover:text-cyan-200"
            }`}
          >
            By day
          </button>
          <button
            onClick={() => setView("physician")}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${
              view === "physician"
                ? "bg-cyan-500/15 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                : "text-slate-400 hover:text-cyan-200"
            }`}
          >
            By physician
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={regenerate}
            disabled={busy}
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50"
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            onClick={copyTSV}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            {copied ? "Copied!" : "Copy (TSV)"}
          </button>
          <a
            href={`/api/export/csv?year=${year}&month=${month}`}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            CSV
          </a>
          <a
            href={`/api/export/xlsx?year=${year}&month=${month}`}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            XLSX
          </a>
          <Link
            href={`/schedule/print?year=${year}&month=${month}`}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            Print
          </Link>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-[#1e293b] bg-[#0f172a] p-3">
        <ShiftLegend />
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1e293b] bg-[#0f172a] p-10 text-center text-slate-400">
          {allAssignments.length === 0 ? (
            <>
              No schedule for this month yet. Click <strong>Regenerate</strong>{" "}
              to build one.
            </>
          ) : (
            <>
              No {hospitalTabLabel(hospitalTab)} shifts this month. Set its
              rounder count on the Dashboard, then regenerate.
            </>
          )}
        </div>
      ) : view === "day" ? (
        <DayView
          assignments={assignments}
          onEdit={setEditing}
          showHospital={combined}
        />
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
  showHospital,
}: {
  assignments: AssignmentDTO[];
  onEdit: (a: AssignmentDTO) => void;
  showHospital: boolean;
}) {
  const byDate = useMemo(() => groupByDate(assignments), [assignments]);
  return (
    <div className="space-y-3">
      {Array.from(byDate.entries()).map(([date, items]) => (
        <div
          key={date}
          className="rounded-xl border border-[#1e293b] bg-[#0f172a] p-4"
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
                  hospital={showHospital ? a.hospital : undefined}
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
    <div className="overflow-x-auto rounded-xl border border-[#1e293b] bg-[#0f172a]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e293b] text-left text-xs uppercase text-cyan-400/70">
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
              <tr key={p.id} className="border-b border-[#1e293b] transition hover:bg-cyan-500/5">
                <td className="px-4 py-2 font-medium text-slate-200">{p.fullName}</td>
                <td className="px-4 py-2">{items.length}</td>
                <td className="px-4 py-2">{rounding}</td>
                <td className="px-4 py-2">{admin}</td>
                <td className="px-4 py-2">{nights}</td>
                <td className="px-4 py-2 text-xs text-slate-400">
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
    <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 shadow-[0_0_12px_rgba(251,191,36,0.2)]">
      <h3 className="mb-2 font-semibold uppercase tracking-wide text-amber-300">
        Warnings ({warnings.length})
      </h3>
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-amber-200/90">
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-cyan-400/30 bg-[#0f172a] p-5 shadow-[0_0_30px_rgba(34,211,238,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Edit assignment</h3>
        <p className="mb-4 text-sm text-slate-400">
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
          className="mb-4 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
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
            className="rounded-lg border border-rose-400/50 px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 hover:shadow-[0_0_10px_rgba(244,63,94,0.3)]"
          >
            Clear slot
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#1e293b] px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={() => patch({ physicianId, isLocked })}
            disabled={saving}
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading…</div>}>
      <ScheduleContent />
    </Suspense>
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
  const mainAssignments = data.assignments.filter((a) => a.hospital === "MAIN");
  const byDate = groupByDate(mainAssignments);
  const columns = scheduleColumns({
    rounderCount: data.rounderCount,
    dayAdmitCount: data.dayAdmitCount,
    nightAdmit1Count: data.nightAdmit1Count,
    nightAdmit2Count: data.nightAdmit2Count,
  });
  const header = ["Date", ...columns.map((c) => c.label)].join("\t");
  const lines = [header];
  for (const [date, items] of byDate) {
    const cell = (type: string, idx: number | null) =>
      items.find(
        (i) => i.shiftType === type && (idx ? i.rounderIndex === idx : true)
      )?.physicianName ?? "";
    lines.push(
      [date, ...columns.map((c) => cell(c.shiftType, c.index))].join("\t")
    );
  }
  return lines.join("\n");
}
