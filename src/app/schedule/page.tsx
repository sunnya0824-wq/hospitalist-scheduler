"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MonthPicker } from "@/components/MonthPicker";
import { ShiftChip, ShiftLegend } from "@/components/ShiftChip";
import { SECONDARY_BTN } from "@/components/Card";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CopyIcon,
  DownloadIcon,
  LockIcon,
  MoreIcon,
  PrinterIcon,
} from "@/components/icons";
import { MONTH_NAMES, colorStyle } from "@/lib/shift-style";
import {
  CATEGORY_LABELS,
  scheduleColumns,
  templateKeyOf,
  type ScheduleColumn,
} from "@/lib/scheduler/shifts";
import { addDaysISO, isWeekend } from "@/lib/scheduler/dates";
import { buildScheduleTable } from "@/lib/export";
import {
  fetchConfig,
  fetchMonth,
  fetchPhysicians,
  generateMonth,
  patchAssignment,
  swapAssignments,
  unlockAll,
  type AssignmentPatchResult,
} from "@/lib/client";
import type {
  AssignmentDTO,
  MonthScheduleDTO,
  PhysicianDTO,
} from "@/lib/api-types";

type View = "day" | "physician";

/** "all" = every location together; otherwise a location key. */
const ALL_TAB = "all";

interface LocationTab {
  key: string;
  name: string;
  code: string;
}

/** Location key for an assignment (falls back to the name if the location was deleted). */
function locationKeyOf(a: Pick<AssignmentDTO, "locationId" | "locationName">): string {
  return a.locationId ?? `name:${a.locationName}`;
}

/** Column lookup data shared by the views: order + label per slot. */
interface ColumnInfo {
  columns: ScheduleColumn[];
  order: Map<string, number>;
  label: Map<string, string>;
}

function columnKey(templateKey: string, slotIndex: number): string {
  return `${templateKey}|${slotIndex}`;
}

function buildColumns(data: MonthScheduleDTO | null): ColumnInfo {
  const empty: ColumnInfo = { columns: [], order: new Map(), label: new Map() };
  if (!data) return empty;
  const locOrder = new Map(data.locations.map((l, i) => [l.id, i]));
  const templates = data.coverage.map((c, i) => ({
    id: c.templateId,
    locationSort: locOrder.get(c.locationId) ?? Number.MAX_SAFE_INTEGER,
    sortOrder: i,
    locationName: c.locationName,
    name: c.name,
  }));
  const columns = scheduleColumns(data.assignments, templates);
  const order = new Map<string, number>();
  const label = new Map<string, string>();
  columns.forEach((c, i) => {
    const k = columnKey(c.templateKey, c.slotIndex);
    order.set(k, i);
    label.set(k, c.label);
  });
  return { columns, order, label };
}

function labelOf(a: AssignmentDTO, info: ColumnInfo): string {
  return info.label.get(columnKey(templateKeyOf(a), a.slotIndex)) ?? a.shiftCode;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [physicians, setPhysicians] = useState<PhysicianDTO[]>([]);
  /** locationId → openToAll; null when settings could not be loaded. */
  const [openToAll, setOpenToAll] = useState<Map<string, boolean> | null>(null);
  const [restDays, setRestDays] = useState<number | null>(null);
  const [view, setView] = useState<View>("day");
  const [locationParam, setLocationParam] = useState<string | null>(
    search.get("location")
  );
  const [editing, setEditing] = useState<AssignmentDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUnfilled, setShowUnfilled] = useState(false);
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirst, setSwapFirst] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" | "warn" } | null>(
    null
  );
  const [recent, setRecent] = useState<Set<string>>(new Set());
  const [unlocking, setUnlocking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([
        fetchMonth(year, month),
        fetchPhysicians(),
      ]);
      setData(m);
      setPhysicians(p);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load schedule.");
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  // Location access rules (open to all vs. listed physicians) live in config.
  useEffect(() => {
    let alive = true;
    fetchConfig()
      .then((c) => {
        if (!alive) return;
        setOpenToAll(new Map(c.locations.map((l) => [l.id, l.openToAll])));
        setRestDays(c.settings.restDaysAfterNights);
      })
      .catch(() => {
        if (alive) setOpenToAll(null);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const flash = (text: string, kind: "ok" | "err" | "warn", ms = 3500) => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), ms);
  };

  /** Mark assignment ids as recently edited so they pulse for ~2s. */
  const markRecent = (ids: string[]) => {
    setRecent(new Set(ids));
    setTimeout(() => setRecent(new Set()), 2200);
  };

  const columnInfo = useMemo(() => buildColumns(data), [data]);

  // Location tabs: configured locations (in order) that have shifts this month,
  // then any leftover locations seen only in older assignments.
  const locationTabs = useMemo<LocationTab[]>(() => {
    if (!data) return [];
    const seen = new Map<string, LocationTab>();
    for (const a of data.assignments) {
      const key = locationKeyOf(a);
      if (!seen.has(key)) seen.set(key, { key, name: a.locationName, code: a.locationCode });
    }
    const tabs: LocationTab[] = [];
    for (const l of data.locations) {
      const t = seen.get(l.id);
      if (t) {
        tabs.push({ key: l.id, name: l.name, code: l.code });
        seen.delete(l.id);
      }
    }
    return [...tabs, ...seen.values()];
  }, [data]);

  const multiLocation = locationTabs.length > 1;
  const activeTab: string = !multiLocation
    ? ALL_TAB
    : locationParam === ALL_TAB
    ? ALL_TAB
    : locationTabs.some((t) => t.key === locationParam)
    ? (locationParam as string)
    : locationTabs[0].key;
  const combined = activeTab === ALL_TAB;
  const activeTabInfo = locationTabs.find((t) => t.key === activeTab);

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

  const syncUrl = (y: number, m: number, loc: string | null) => {
    const q = new URLSearchParams({ year: String(y), month: String(m) });
    if (loc) q.set("location", loc);
    router.replace(`/schedule?${q.toString()}`);
  };

  const changeMonth = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
    syncUrl(y, m, locationParam);
  };

  const changeLocation = (key: string) => {
    setLocationParam(key);
    syncUrl(year, month, key);
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      // No coverage overrides passed: the month's saved overrides are kept.
      await generateMonth(year, month, false);
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed to generate schedule.", "err");
    } finally {
      setBusy(false);
    }
  };

  const copyTSV = async () => {
    if (!data) return;
    const tsv = buildScheduleTable(data)
      .map((row) => row.join("\t"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      flash("Could not copy to the clipboard.", "err");
    }
  };

  /** Apply a PATCH result to the loaded month without a full reload. */
  const applyPatch = (r: AssignmentPatchResult) => {
    setData((d) =>
      d
        ? {
            ...d,
            assignments: d.assignments.map((x) =>
              x.id === r.id
                ? {
                    ...x,
                    physicianId: r.physicianId,
                    physicianName: r.physicianName,
                    isManual: r.isManual,
                    isLocked: r.isLocked,
                    isAutoGenerated: r.isAutoGenerated,
                    warnings: r.warnings,
                  }
                : x
            ),
          }
        : d
    );
  };

  const allAssignments = useMemo(() => data?.assignments ?? [], [data]);
  const unfilled = allAssignments.filter((a) => !a.physicianId);
  const lockedCount = allAssignments.filter((a) => a.isLocked).length;
  const assignments = combined
    ? allAssignments
    : allAssignments.filter((a) => locationKeyOf(a) === activeTab);
  const runWarnings = data?.lastRun?.warnings ?? [];
  const slotWarnings = allAssignments
    .filter((a) => a.warnings.length > 0)
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    .flatMap((a) =>
      a.warnings.map(
        (w) =>
          `${formatDate(a.date)} · ${labelOf(a, columnInfo)}${
            multiLocation ? ` (${a.locationName})` : ""
          } — ${w}`
      )
    );
  const warnings = [...slotWarnings, ...runWarnings];
  const legendItems = assignments.map((a) => ({
    name: a.shiftName,
    color: a.color,
  }));
  const weekendDays = useMemo(
    () => new Set(data?.weekendDays ?? [0, 6]),
    [data]
  );
  const holidays = data?.holidays ?? {};

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      <div className="sticky top-0 z-20 -mx-4 bg-slate-950/95 px-4 pt-1 backdrop-blur-md md:static md:mx-0 md:bg-transparent md:px-0 md:pt-0 md:backdrop-blur-none">
        <header className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          <div>
            <h1 className="page-title">Schedule</h1>
            <p className="mt-1 text-sm text-slate-400">
              {MONTH_NAMES[month - 1]} {year}
            </p>
          </div>
          <div className="w-full md:w-auto">
            <MonthPicker year={year} month={month} onChange={changeMonth} />
          </div>
        </header>

        {multiLocation && (
          <div className="mb-4 flex snap-x flex-nowrap gap-1 overflow-x-auto border-b border-[#1e293b] md:flex-wrap md:overflow-visible">
            {[...locationTabs, { key: ALL_TAB, name: "All locations", code: "" }].map((tab) => (
              <button
                key={tab.key}
                onClick={() => changeLocation(tab.key)}
                className={`-mb-px shrink-0 snap-start whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition min-h-[44px] md:min-h-0 ${
                  activeTab === tab.key
                    ? "border-cyan-400 text-cyan-300 shadow-[0_2px_10px_-4px_rgba(34,211,238,0.6)]"
                    : "border-transparent text-slate-400 hover:text-cyan-200"
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {loadError}
        </div>
      )}

      {unfilled.length > 0 && (
        <UnfilledBanner
          slots={unfilled}
          info={columnInfo}
          showLocation={multiLocation}
          open={showUnfilled}
          onToggle={() => setShowUnfilled((v) => !v)}
        />
      )}

      {toast && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            toast.kind === "ok"
              ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
              : toast.kind === "warn"
              ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
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
            className={`rounded-md px-3 py-1 text-sm font-medium transition min-h-[44px] md:min-h-0 ${
              view === "day"
                ? "bg-cyan-500/15 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                : "text-slate-400 hover:text-cyan-200"
            }`}
          >
            By day
          </button>
          <button
            onClick={() => setView("physician")}
            className={`rounded-md px-3 py-1 text-sm font-medium transition min-h-[44px] md:min-h-0 ${
              view === "physician"
                ? "bg-cyan-500/15 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                : "text-slate-400 hover:text-cyan-200"
            }`}
          >
            By physician
          </button>
        </div>

        {/* Desktop toolbar */}
        <div className="hidden flex-wrap gap-2 md:flex">
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
            title="Locked and hand-edited slots are kept"
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

        {/* Mobile toolbar: primary Regenerate + overflow menu */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={regenerate}
            disabled={busy}
            className="min-h-[44px] rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {busy ? "…" : "Regenerate"}
          </button>
          <ScheduleMenu
            swapMode={swapMode}
            onSwapToggle={() => {
              setSwapMode((v) => !v);
              setSwapFirst(null);
            }}
            lockedCount={lockedCount}
            unlocking={unlocking}
            onUnlockAll={onUnlockAll}
            copied={copied}
            onCopy={copyTSV}
            csvHref={`/api/export/csv?year=${year}&month=${month}`}
            xlsxHref={`/api/export/xlsx?year=${year}&month=${month}`}
            printHref={`/schedule/print?year=${year}&month=${month}`}
          />
        </div>
      </div>

      {legendItems.length > 0 && (
        <div className="mb-4 rounded-lg border border-[#1e293b] bg-[#0f172a] p-3">
          <ShiftLegend items={legendItems} />
        </div>
      )}

      {!data && !loadError ? (
        <div className="p-6 text-sm text-slate-400">Loading…</div>
      ) : assignments.length === 0 ? (
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
            No {activeTabInfo?.name ?? ""} shifts this month. Set its coverage on
            the Dashboard, then regenerate.
          </div>
        )
      ) : view === "day" ? (
        <DayView
          assignments={assignments}
          info={columnInfo}
          holidays={holidays}
          weekendDays={weekendDays}
          onEdit={onChipClick}
          showLocation={combined && multiLocation}
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

      {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

      {editing && (
        <EditModal
          assignment={editing}
          label={labelOf(editing, columnInfo)}
          showLocation={multiLocation}
          physicians={physicians}
          allAssignments={allAssignments}
          openToAll={openToAll}
          restDays={restDays}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            applyPatch(r);
            markRecent([r.id]);
            setEditing(null);
            if (r.warnings.length > 0) {
              flash(`Saved with a warning: ${r.warnings.join(" ")}`, "warn", 7000);
            } else {
              flash("Saved.", "ok", 2000);
            }
          }}
        />
      )}
    </div>
  );
}

function DayView({
  assignments,
  info,
  holidays,
  weekendDays,
  onEdit,
  showLocation,
  swapMode,
  swapFirst,
  recent,
}: {
  assignments: AssignmentDTO[];
  info: ColumnInfo;
  holidays: Record<string, string>;
  weekendDays: ReadonlySet<number>;
  onEdit: (a: AssignmentDTO) => void;
  showLocation: boolean;
  swapMode: boolean;
  swapFirst: string | null;
  recent: Set<string>;
}) {
  const byDate = useMemo(() => groupByDate(assignments, info), [assignments, info]);
  return (
    <div className="space-y-3">
      {Array.from(byDate.entries()).map(([date, items]) => {
        const weekend = isWeekend(date, weekendDays);
        const holName = holidays[date] ?? null;
        const holiday = Boolean(holName);
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
            {/* Desktop: compact wrapped chips */}
            <div className="hidden flex-wrap gap-2 md:flex">
              {items.map((a) => {
                const selected = swapFirst === a.id;
                const glow = recent.has(a.id);
                const label = labelOf(a, info);
                return (
                  <button
                    key={a.id}
                    onClick={() => onEdit(a)}
                    className={`group relative rounded-md ${
                      selected ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-[#0f172a]" : ""
                    } ${glow ? "edit-glow" : ""}`}
                    title={
                      (swapMode ? "Click to swap" : "Click to edit") +
                      ` · ${label} — ${a.shiftName}` +
                      (a.warnings.length ? `\n${a.warnings.join("\n")}` : "")
                    }
                  >
                    <ShiftChip
                      label={label}
                      color={a.color}
                      name={a.physicianName}
                      locationCode={showLocation ? a.locationCode : undefined}
                    />
                    {a.isLocked && (
                      <span className="absolute -right-1 -top-1 text-[10px]">
                        🔒
                      </span>
                    )}
                    {a.warnings.length > 0 && (
                      <AlertTriangleIcon className="absolute -left-1 -top-1 h-3 w-3 text-amber-300" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile: full-width, tap-friendly shift rows */}
            <div className="flex flex-col gap-2 md:hidden">
              {items.map((a) => (
                <MobileChipRow
                  key={a.id}
                  a={a}
                  label={labelOf(a, info)}
                  onEdit={onEdit}
                  showLocation={showLocation}
                  selected={swapFirst === a.id}
                  glow={recent.has(a.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileChipRow({
  a,
  label,
  onEdit,
  showLocation,
  selected,
  glow,
}: {
  a: AssignmentDTO;
  label: string;
  onEdit: (a: AssignmentDTO) => void;
  showLocation: boolean;
  selected: boolean;
  glow: boolean;
}) {
  const style = colorStyle(a.color);
  const unfilled = !a.physicianId;
  return (
    <button
      onClick={() => onEdit(a)}
      className={`flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
        unfilled
          ? "border-dashed border-rose-500/60 bg-rose-500/10 text-rose-300"
          : style.chip
      } ${
        selected ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-[#0f172a]" : ""
      } ${glow ? "edit-glow" : ""}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          unfilled ? "bg-rose-400" : style.dot
        }`}
      />
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-90">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">
        {unfilled ? "Tap to assign" : a.physicianName}
      </span>
      {showLocation && (
        <span
          className={`shrink-0 rounded-sm border px-1 text-[9px] font-semibold uppercase leading-tight ${style.badge}`}
          title={a.locationName}
        >
          {a.locationCode}
        </span>
      )}
      {a.warnings.length > 0 && (
        <AlertTriangleIcon className="h-4 w-4 shrink-0 text-amber-300" />
      )}
      {a.isLocked && <LockIcon className="h-4 w-4 shrink-0 text-amber-300" />}
      {unfilled && (
        <AlertTriangleIcon className="h-4 w-4 shrink-0 text-rose-300" />
      )}
    </button>
  );
}

function ScheduleMenu({
  swapMode,
  onSwapToggle,
  lockedCount,
  unlocking,
  onUnlockAll,
  copied,
  onCopy,
  csvHref,
  xlsxHref,
  printHref,
}: {
  swapMode: boolean;
  onSwapToggle: () => void;
  lockedCount: number;
  unlocking: boolean;
  onUnlockAll: () => void;
  copied: boolean;
  onCopy: () => void;
  csvHref: string;
  xlsxHref: string;
  printHref: string;
}) {
  const [open, setOpen] = useState(false);
  const itemClass =
    "flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-200 transition hover:bg-cyan-500/10 hover:text-cyan-200";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#1e293b] bg-[#0f172a] text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300"
      >
        <MoreIcon className="h-5 w-5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-lg border border-cyan-400/30 bg-[#0f172a] py-1 shadow-[0_0_24px_rgba(34,211,238,0.2)]">
            <button
              className={itemClass}
              onClick={() => {
                onSwapToggle();
                setOpen(false);
              }}
            >
              {swapMode ? "Swap: on" : "Swap mode"}
            </button>
            {lockedCount > 0 && (
              <button
                className={itemClass}
                disabled={unlocking}
                onClick={() => {
                  onUnlockAll();
                  setOpen(false);
                }}
              >
                <LockIcon className="h-4 w-4" />
                {unlocking ? "Unlocking…" : `Unlock all (${lockedCount})`}
              </button>
            )}
            <button
              className={itemClass}
              onClick={() => {
                onCopy();
                setOpen(false);
              }}
            >
              <CopyIcon className="h-4 w-4" />
              {copied ? "Copied!" : "Copy (TSV)"}
            </button>
            <a className={itemClass} href={csvHref} onClick={() => setOpen(false)}>
              <DownloadIcon className="h-4 w-4" />
              CSV
            </a>
            <a className={itemClass} href={xlsxHref} onClick={() => setOpen(false)}>
              <DownloadIcon className="h-4 w-4" />
              XLSX
            </a>
            <Link
              className={itemClass}
              href={printHref}
              onClick={() => setOpen(false)}
            >
              <PrinterIcon className="h-4 w-4" />
              Print
            </Link>
          </div>
        </>
      )}
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
            <th className="px-4 py-2">{CATEGORY_LABELS.DAY}</th>
            <th className="px-4 py-2">{CATEGORY_LABELS.ADMIT}</th>
            <th className="px-4 py-2">{CATEGORY_LABELS.NIGHT}</th>
            <th className="px-4 py-2">Dates</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, items }) => {
            const day = items.filter((i) => i.category === "DAY").length;
            const admit = items.filter((i) => i.category === "ADMIT").length;
            const nights = items.filter((i) => i.category === "NIGHT").length;
            return (
              <tr key={p.id} className="border-b border-[#1e293b] transition hover:bg-cyan-500/5">
                <td className="px-4 py-2 font-medium text-slate-200">{p.fullName}</td>
                <td className="px-4 py-2">{items.length}</td>
                <td className="px-4 py-2">{day}</td>
                <td className="px-4 py-2">{admit}</td>
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
  info,
  showLocation,
  open,
  onToggle,
}: {
  slots: AssignmentDTO[];
  info: ColumnInfo;
  showLocation: boolean;
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
          — not enough physicians available
        </span>
        <span className="text-sm text-fuchsia-300">
          {open ? "Hide ▲" : "View ▼"}
        </span>
      </button>
      {open && (
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm text-fuchsia-200/90">
          {sorted.map((s) => (
            <li key={s.id}>
              • {formatDate(s.date)} — {labelOf(s, info)} ({s.shiftName})
              {showLocation ? ` · ${s.locationName}` : ""}
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
 * Hard reason a physician cannot take a slot at all (wrong shift category or
 * not allowed at the location). These options are greyed out.
 */
function blockReason(
  phys: PhysicianDTO,
  slot: AssignmentDTO,
  openToAll: Map<string, boolean> | null
): string | null {
  if (slot.category === "NIGHT" && !phys.nightEligible) return "doesn't work nights";
  if (slot.category === "ADMIT" && !phys.adminEligible) return "doesn't do admitting";
  if (openToAll && slot.locationId) {
    const open = openToAll.get(slot.locationId);
    // Unknown location (e.g. deleted) → don't filter.
    if (open === false && !phys.locationIds.includes(slot.locationId)) {
      return `not set up for ${slot.locationName}`;
    }
  }
  return null;
}

/**
 * Soft rule a physician would break by taking the slot (best-effort,
 * client-side). Still selectable: the server saves it with a warning.
 */
function cautionReason(
  phys: PhysicianDTO,
  slot: AssignmentDTO,
  allAssignments: AssignmentDTO[],
  restDays: number
): string | null {
  if (phys.timeOffDates.includes(slot.date)) return "time off that day";
  const sameDay = allAssignments.some(
    (x) => x.id !== slot.id && x.physicianId === phys.id && x.date === slot.date
  );
  if (sameDay) return "already works that day";
  const nightOn = (iso: string) =>
    allAssignments.some(
      (x) =>
        x.id !== slot.id &&
        x.physicianId === phys.id &&
        x.date === iso &&
        x.category === "NIGHT"
    );
  // A night the day before continues a night block; otherwise any night in
  // the rest window means the physician should be resting.
  const continuesBlock = slot.category === "NIGHT" && nightOn(addDaysISO(slot.date, -1));
  if (!continuesBlock) {
    for (let i = 1; i <= restDays; i++) {
      if (nightOn(addDaysISO(slot.date, -i))) return "resting after nights";
    }
  }
  return null;
}

function EditModal({
  assignment,
  label,
  showLocation,
  physicians,
  allAssignments,
  openToAll,
  restDays,
  onClose,
  onSaved,
}: {
  assignment: AssignmentDTO;
  label: string;
  showLocation: boolean;
  physicians: PhysicianDTO[];
  allAssignments: AssignmentDTO[];
  openToAll: Map<string, boolean> | null;
  restDays: number | null;
  onClose: () => void;
  onSaved: (r: AssignmentPatchResult) => void;
}) {
  const [physicianId, setPhysicianId] = useState(
    assignment.physicianId ?? ""
  );
  const [isLocked, setIsLocked] = useState(assignment.isLocked);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: { physicianId?: string | null; isLocked?: boolean; clear?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const r = await patchAssignment(assignment.id, body);
      onSaved(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const body: { physicianId?: string | null; isLocked?: boolean } = { isLocked };
    // Only send the physician when it changed, so a lock-only edit doesn't
    // turn an auto-filled slot into a manual one.
    if ((physicianId || null) !== assignment.physicianId) {
      body.physicianId = physicianId || null;
    }
    patch(body);
  };

  const options = physicians
    .filter((p) => p.active || p.id === assignment.physicianId)
    .map((p) => {
      const current = p.id === assignment.physicianId;
      const block = current ? null : blockReason(p, assignment, openToAll);
      const caution =
        current || block
          ? null
          : cautionReason(p, assignment, allAssignments, restDays ?? 2);
      return { p, block, caution };
    });
  const selectedCaution = options.find((o) => o.p.id === physicianId)?.caution;

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
          {formatDate(assignment.date)} · {label} — {assignment.shiftName}
          {showLocation ? ` at ${assignment.locationName}` : ""} (
          {assignment.startTime}–{assignment.endTime})
        </p>

        {assignment.warnings.length > 0 && (
          <div className="mb-4 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {assignment.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium">Physician</label>
        <select
          value={physicianId}
          onChange={(e) => setPhysicianId(e.target.value)}
          className="mb-1 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
        >
          <option value="">— Unfilled —</option>
          {options.map(({ p, block, caution }) => (
            <option key={p.id} value={p.id} disabled={Boolean(block)}>
              {p.fullName}
              {block ? ` — ${block}` : caution ? ` — ⚠ ${caution}` : ""}
            </option>
          ))}
        </select>
        <p className="mb-4 text-xs text-slate-500">
          Physicians who can&apos;t work this kind of shift or this location are
          greyed out. Picks marked ⚠ break a scheduling rule; they&apos;re
          allowed but saved with a warning.
        </p>
        {selectedCaution && (
          <p className="-mt-2 mb-4 text-xs text-amber-300">
            Heads up: {selectedCaution}.
          </p>
        )}

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isLocked}
            onChange={(e) => setIsLocked(e.target.checked)}
          />
          Lock this slot (kept when you regenerate)
        </label>

        {error && (
          <p className="mb-3 rounded-md border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => patch({ clear: true })}
            disabled={saving}
            className="min-h-[44px] rounded-lg border border-rose-400/50 px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 hover:shadow-[0_0_10px_rgba(244,63,94,0.3)] md:min-h-0"
          >
            Clear slot
          </button>
          <button
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-[#1e293b] px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 md:min-h-0"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="min-h-[44px] rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50 md:min-h-0"
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

/** Group by date (sorted), each day's slots in column order. */
function groupByDate(
  assignments: AssignmentDTO[],
  info: ColumnInfo
): Map<string, AssignmentDTO[]> {
  const map = new Map<string, AssignmentDTO[]>();
  for (const a of assignments) {
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date)!.push(a);
  }
  const pos = (a: AssignmentDTO) =>
    info.order.get(columnKey(templateKeyOf(a), a.slotIndex)) ?? Number.MAX_SAFE_INTEGER;
  for (const items of map.values()) {
    items.sort((x, y) => pos(x) - pos(y));
  }
  return new Map(Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
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
