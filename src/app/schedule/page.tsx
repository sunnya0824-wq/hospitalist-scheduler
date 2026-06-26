"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip, ShiftLegend } from "@/components/ShiftChip";
import { SECONDARY_BTN } from "@/components/Card";
import {
  CalendarIcon,
  CopyIcon,
  DownloadIcon,
  PrinterIcon,
} from "@/components/icons";
import { MONTH_NAMES, getHospitalBadge } from "@/lib/shift-style";
import { scheduleColumns, HOSPITALS } from "@/lib/scheduler/shifts";
import { addDaysISO, isWeekend } from "@/lib/scheduler/dates";
import { isHoliday, holidayName } from "@/lib/holidays";
import {
  fetchMonth,
  fetchPhysicians,
  generateMonth,
  swapAssignments,
  unlockAll,
} from "@/lib/client";
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
  const [showUnfilled, setShowUnfilled] = useState(false);
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirst, setSwapFirst] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" } | null>(
    null
  );
  const [recent, setRecent] = useState<Set<string>>(new Set());
  const [unlocking, setUnlocking] = useState(false);

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

  // Escape exits swap mode.
  useEffect(() => {
    if (!swapMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSwapMode(false);
        setSwapFirst(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swapMode]);

  const flash = (text: string, kind: "ok" | "err") => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3500);
  };

  /** Mark assignment ids as recently edited so they pulse for ~2s. */
  const markRecent = (ids: string[]) => {
    setRecent(new Set(ids));
    setTimeout(() => setRecent(new Set()), 2200);
  };

  const onChipClick = async (a: AssignmentDTO) => {
    if (!swapMode) {
      setEditing(a);
      return;
    }
    if (!swapFirst) {
      setSwapFirst(a.id);
      return;
    }
    if (swapFirst === a.id) {
      setSwapFirst(null);
      return;
    }
    const first = swapFirst;
    setSwapFirst(null);
    try {
      await swapAssignments(first, a.id);
      markRecent([first, a.id]);
      await load();
      flash("Shifts swapped.", "ok");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Swap failed.", "err");
    }
  };

  const onUnlockAll = async () => {
    if (!window.confirm("Unlock every locked slot this month?")) return;
    setUnlocking(true);
    try {
      const n = await unlockAll(year, month);
      await load();
      flash(`Unlocked ${n} slot${n === 1 ? "" : "s"}.`, "ok");
    } catch {
      flash("Failed to unlock.", "err");
    } finally {
      setUnlocking(false);
    }
  };

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
  const unfilled = allAssignments.filter((a) => !a.physicianId);
  const lockedCount = allAssignments.filter((a) => a.isLocked).length;
  const combined = hospitalTab === "COMBINED";
  const assignments = combined
    ? allAssignments
    : allAssignments.filter((a) => a.hospital === hospitalTab);
  const warnings = data?.lastRun?.warnings ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="mt-1 text-sm text-slate-400">
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

      {unfilled.length > 0 && (
        <UnfilledBanner
          slots={unfilled}
          open={showUnfilled}
          onToggle={() => setShowUnfilled((v) => !v)}
        />
      )}

      {toast && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            toast.kind === "ok"
              ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
              : "border-rose-400/50 bg-rose-500/10 text-rose-300"
          }`}
        >
          {toast.text}
        </div>
      )}

      {swapMode && (
        <div className="mb-4 rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
          Swap mode: click two shifts to exchange their physicians.{" "}
          {swapFirst ? "Pick the second shift…" : "Pick the first shift…"} Press{" "}
          <kbd className="rounded bg-[#0a0e1a] px-1">Esc</kbd> to exit.
        </div>
      )}

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
            onClick={() => {
              setSwapMode((v) => !v);
              setSwapFirst(null);
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold uppercase tracking-wide transition ${
              swapMode
                ? "border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.5)]"
                : "border-[#1e293b] bg-[#0f172a] text-slate-300 hover:border-cyan-400/60 hover:text-cyan-300"
            }`}
          >
            {swapMode ? "Swap: on" : "Swap mode"}
          </button>
          {lockedCount > 0 && (
            <button
              onClick={onUnlockAll}
              disabled={unlocking}
              className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              {unlocking ? "Unlocking…" : `Unlock all (${lockedCount})`}
            </button>
          )}
          <button
            onClick={regenerate}
            disabled={busy}
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50"
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
          <button onClick={copyTSV} className={SECONDARY_BTN}>
            <CopyIcon className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy (TSV)"}
          </button>
          <a
            href={`/api/export/csv?year=${year}&month=${month}`}
            className={SECONDARY_BTN}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            CSV
          </a>
          <a
            href={`/api/export/xlsx?year=${year}&month=${month}`}
            className={SECONDARY_BTN}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            XLSX
          </a>
          <Link
            href={`/schedule/print?year=${year}&month=${month}`}
            className={SECONDARY_BTN}
          >
            <PrinterIcon className="h-3.5 w-3.5" />
            Print
          </Link>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-[#1e293b] bg-[#0f172a] p-3">
        <ShiftLegend />
      </div>

      {assignments.length === 0 ? (
        allAssignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cyan-900/40 bg-slate-900/40 p-12 text-center">
            <CalendarIcon
              className="mx-auto mb-5 h-20 w-20 text-cyan-400/70"
              strokeWidth={1}
            />
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
              No schedule for {MONTH_NAMES[month - 1]} {year}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Set your coverage on the Dashboard, then generate.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={regenerate}
                disabled={busy}
                className="rounded-lg border border-cyan-400 bg-cyan-500/15 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/25 hover:shadow-[0_0_18px_rgba(34,211,238,0.55)] disabled:opacity-50"
              >
                {busy ? "Generating…" : "Generate now"}
              </button>
              <Link href="/" className={SECONDARY_BTN}>
                ← Go to dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#1e293b] bg-slate-900/40 p-10 text-center text-slate-400">
            No {hospitalTabLabel(hospitalTab)} shifts this month. Set its rounder
            count on the Dashboard, then regenerate.
          </div>
        )
      ) : view === "day" ? (
        <DayView
          assignments={assignments}
          onEdit={onChipClick}
          showHospital={combined}
          swapMode={swapMode}
          swapFirst={swapFirst}
          recent={recent}
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
          allAssignments={allAssignments}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            markRecent([editing.id]);
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
  swapMode,
  swapFirst,
  recent,
}: {
  assignments: AssignmentDTO[];
  onEdit: (a: AssignmentDTO) => void;
  showHospital: boolean;
  swapMode: boolean;
  swapFirst: string | null;
  recent: Set<string>;
}) {
  const byDate = useMemo(() => groupByDate(assignments), [assignments]);
  return (
    <div className="space-y-3">
      {Array.from(byDate.entries()).map(([date, items]) => {
        const weekend = isWeekend(date);
        const holiday = isHoliday(date);
        const holName = holidayName(date);
        return (
          <div
            key={date}
            className={`rounded-xl border bg-[#0f172a] p-4 ${
              holiday
                ? "border-fuchsia-500/40"
                : weekend
                ? "border-[#243049]"
                : "border-[#1e293b]"
            }`}
          >
            <div
              className={`-mx-4 -mt-4 mb-2 flex items-center justify-between rounded-t-xl px-4 py-2 ${
                holiday
                  ? "bg-fuchsia-500/10"
                  : weekend
                  ? "bg-slate-500/10"
                  : ""
              }`}
            >
              <h3
                className={`font-semibold ${
                  holiday
                    ? "text-fuchsia-300 underline decoration-fuchsia-400 decoration-2 underline-offset-4"
                    : ""
                }`}
                title={holName ?? undefined}
              >
                {formatDate(date)}
                {holName && (
                  <span className="ml-2 text-xs font-normal text-fuchsia-300/80">
                    {holName}
                  </span>
                )}
              </h3>
              <span className="text-xs text-slate-400">
                {items.filter((i) => i.physicianId).length}/{items.length} filled
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((a) => {
                const selected = swapFirst === a.id;
                const glow = recent.has(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => onEdit(a)}
                    className={`group relative rounded-md ${
                      selected ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-[#0f172a]" : ""
                    } ${glow ? "edit-glow" : ""}`}
                    title={swapMode ? "Click to swap" : "Click to edit"}
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
                );
              })}
            </div>
          </div>
        );
      })}
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

function UnfilledBanner({
  slots,
  open,
  onToggle,
}: {
  slots: AssignmentDTO[];
  open: boolean;
  onToggle: () => void;
}) {
  const sorted = [...slots].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
  return (
    <div className="mb-4 rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/10 p-4 shadow-[0_0_14px_rgba(217,70,239,0.25)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-semibold uppercase tracking-wide text-fuchsia-300">
          {slots.length} slot{slots.length === 1 ? "" : "s"} could not be filled
          — too many physicians off
        </span>
        <span className="text-sm text-fuchsia-300">
          {open ? "Hide ▲" : "View ▼"}
        </span>
      </button>
      {open && (
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm text-fuchsia-200/90">
          {sorted.map((s) => (
            <li key={s.id}>
              • {formatDate(s.date)} —{" "}
              {s.shiftType === "ROUNDER" && s.rounderIndex
                ? `Rounder ${s.rounderIndex}`
                : s.shiftType.replace(/_/g, " ")}{" "}
              · {getHospitalBadge(s.hospital).label}
            </li>
          ))}
        </ul>
      )}
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

/**
 * Reason a physician cannot take a slot (best-effort, client-side). Used to
 * grey out ineligible options in the edit dropdown. The server re-validates
 * swaps; manual single-slot edits trust this hint.
 */
function eligibilityReason(
  phys: PhysicianDTO,
  slot: AssignmentDTO,
  allAssignments: AssignmentDTO[]
): string | null {
  const night =
    slot.shiftType === "NIGHT_ADMIT_1" || slot.shiftType === "NIGHT_ADMIT_2";
  if (night && !phys.nightEligible) return "not night eligible";
  if (slot.shiftType === "ADMIN" && !phys.adminEligible)
    return "not day-admit eligible";
  if (slot.hospital !== "MAIN") {
    const ok =
      slot.hospital === "CARSON"
        ? phys.canWorkCarson
        : slot.hospital === "EATON"
        ? phys.canWorkEaton
        : phys.canWorkClinton;
    if (!ok) return "hospital-ineligible";
  }
  if (phys.timeOffDates.includes(slot.date)) return "time off that day";
  const sameDay = allAssignments.some(
    (x) => x.id !== slot.id && x.physicianId === phys.id && x.date === slot.date
  );
  if (sameDay) return "already works that day";
  const prev1 = addDaysISO(slot.date, -1);
  const prev2 = addDaysISO(slot.date, -2);
  const recentNight = allAssignments.some(
    (x) =>
      x.physicianId === phys.id &&
      (x.date === prev1 || x.date === prev2) &&
      (x.shiftType === "NIGHT_ADMIT_1" || x.shiftType === "NIGHT_ADMIT_2")
  );
  if (recentNight) return "post-night rest";
  return null;
}

function EditModal({
  assignment,
  physicians,
  allAssignments,
  onClose,
  onSaved,
}: {
  assignment: AssignmentDTO;
  physicians: PhysicianDTO[];
  allAssignments: AssignmentDTO[];
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
          className="mb-1 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
        >
          <option value="">— Unfilled —</option>
          {physicians.map((p) => {
            const reason =
              p.id === assignment.physicianId
                ? null
                : eligibilityReason(p, assignment, allAssignments);
            return (
              <option key={p.id} value={p.id} disabled={Boolean(reason)}>
                {p.fullName}
                {reason ? ` — ${reason}` : ""}
              </option>
            );
          })}
        </select>
        <p className="mb-4 text-xs text-slate-500">
          Ineligible physicians (same-day shift, post-night rest, time off, or
          hospital-ineligible) are greyed out.
        </p>

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
