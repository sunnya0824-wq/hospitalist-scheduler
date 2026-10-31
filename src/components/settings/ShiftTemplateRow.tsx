"use client";

import { useEffect, useState } from "react";
import type { ShiftCategory, ShiftTemplateDTO } from "@/lib/api-types";
import { updateShiftTemplate } from "@/lib/client";
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  MAX_SLOTS_PER_DAY,
  isOvernight,
  isValidTime,
  shiftHours,
} from "@/lib/scheduler/shifts";
import { COLOR_NAMES, WEEKDAY_LETTER, WEEKDAY_SHORT, colorStyle } from "@/lib/shift-style";
import {
  BlurInput,
  DANGER_BTN,
  GHOST_BTN,
  HELP,
  ICON_BTN,
  INPUT,
  LABEL,
  Toggle,
  fmtSlots,
  parseIntIn,
} from "./ui";

export const CATEGORIES: ShiftCategory[] = ["DAY", "ADMIT", "NIGHT"];

type Run = (fn: () => Promise<unknown>, saved?: string) => Promise<boolean>;

export function CategorySelect({
  value,
  onChange,
  id,
}: {
  value: ShiftCategory;
  onChange: (c: ShiftCategory) => void;
  id?: string;
}) {
  return (
    <>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as ShiftCategory)} className={INPUT}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <p className={HELP}>{CATEGORY_DESCRIPTIONS[value]}</p>
    </>
  );
}

export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
      {COLOR_NAMES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition md:h-6 md:w-6 ${
            value === c ? "border-white/80 ring-2 ring-cyan-400/50" : "border-transparent hover:border-slate-500"
          }`}
        >
          <span className={`block h-5 w-5 rounded-full md:h-4 md:w-4 ${colorStyle(c).dot}`} />
        </button>
      ))}
    </div>
  );
}

/** Badge showing shift length and whether it runs overnight. */
export function TimeSummary({ start, end }: { start: string; end: string }) {
  if (!isValidTime(start) || !isValidTime(end)) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
      <span>{fmtSlots(shiftHours(start, end))} h</span>
      {isOvernight(start, end) && (
        <span className="rounded-sm border border-fuchsia-400/50 bg-fuchsia-500/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300">
          overnight
        </span>
      )}
    </span>
  );
}

/** 7 Sun..Sat count inputs that wrap on narrow screens. */
export function WeekdayCounts({
  counts,
  onCommit,
  idPrefix,
}: {
  counts: number[];
  onCommit: (day: number, value: number) => Promise<boolean> | boolean;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 sm:flex sm:flex-wrap">
      {counts.map((n, d) => (
        <div key={d} className="flex min-w-0 flex-col items-center sm:w-12">
          <label htmlFor={`${idPrefix}-${d}`} className="text-[10px] font-semibold text-slate-500" title={WEEKDAY_SHORT[d]}>
            {WEEKDAY_LETTER[d]}
          </label>
          <BlurInput
            id={`${idPrefix}-${d}`}
            aria-label={`${WEEKDAY_SHORT[d]} slots`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SLOTS_PER_DAY}
            value={String(n)}
            onCommit={(v) => {
              const parsed = parseIntIn(v, 0, MAX_SLOTS_PER_DAY);
              return parsed === null ? false : onCommit(d, parsed);
            }}
            className={`${INPUT} px-1 text-center`}
          />
        </div>
      ))}
    </div>
  );
}

export function ShiftTemplateRow({
  t,
  index,
  count,
  run,
  fail,
  onMove,
  onDelete,
  onChanged,
}: {
  t: ShiftTemplateDTO;
  index: number;
  count: number;
  run: Run;
  fail: (text: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onChanged: () => Promise<void>;
}) {
  const [fill, setFill] = useState("");
  const [start, setStart] = useState(t.startTime);
  const [end, setEnd] = useState(t.endTime);
  useEffect(() => setStart(t.startTime), [t.startTime]);
  useEffect(() => setEnd(t.endTime), [t.endTime]);
  const style = colorStyle(t.color);

  const save = async (body: Parameters<typeof updateShiftTemplate>[1]) => {
    const ok = await run(() => updateShiftTemplate(t.id, body));
    await onChanged();
    return ok;
  };

  const commitTime = async (key: "startTime" | "endTime", v: string, reset: () => void) => {
    if (v === t[key]) return;
    if (!isValidTime(v)) {
      fail(`Enter a valid ${key === "startTime" ? "start" : "end"} time (HH:MM, 24-hour).`);
      reset();
      return;
    }
    if (!(await save({ [key]: v }))) reset();
  };

  const avg = t.dailyCounts.reduce((a, b) => a + b, 0) / 7;

  return (
    <div className={`rounded-lg border border-slate-800 bg-[#0a0e1a]/60 p-3 sm:p-4 ${t.active ? "" : "opacity-60"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex min-w-[2.5rem] justify-center rounded border px-1.5 py-0.5 text-xs font-semibold ${style.chip}`}>
            {t.code}
          </span>
          <span className="truncate text-sm font-medium text-slate-200">{t.name}</span>
          <span className="shrink-0 text-xs text-slate-500">~{fmtSlots(avg)}/day</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={ICON_BTN} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${t.name} up`}>
            ↑
          </button>
          <button
            type="button"
            className={ICON_BTN}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${t.name} down`}
          >
            ↓
          </button>
          <button type="button" className={`${DANGER_BTN} md:py-1 md:text-xs`} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={LABEL} htmlFor={`${t.id}-name`}>
            Shift name
          </label>
          <BlurInput id={`${t.id}-name`} value={t.name} maxLength={60} onCommit={(v) => save({ name: v.trim() })} />
        </div>
        <div>
          <label className={LABEL} htmlFor={`${t.id}-code`}>
            Short label
          </label>
          <BlurInput id={`${t.id}-code`} value={t.code} maxLength={6} onCommit={(v) => save({ code: v.trim() })} />
          <p className={HELP}>Shown on the calendar.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor={`${t.id}-cat`}>
            Type
          </label>
          <CategorySelect id={`${t.id}-cat`} value={t.category} onChange={(c) => save({ category: c })} />
        </div>

        <div>
          <label className={LABEL} htmlFor={`${t.id}-start`}>
            Starts
          </label>
          <input
            id={`${t.id}-start`}
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={() => commitTime("startTime", start, () => setStart(t.startTime))}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor={`${t.id}-end`}>
            Ends
          </label>
          <input
            id={`${t.id}-end`}
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onBlur={() => commitTime("endTime", end, () => setEnd(t.endTime))}
            className={INPUT}
          />
          <div className="mt-1">
            <TimeSummary start={start} end={end} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <span className={LABEL}>Color</span>
          <ColorSwatches value={t.color} onChange={(c) => save({ color: c })} />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <span className={LABEL}>Physicians needed each day</span>
          <WeekdayCounts
            idPrefix={`${t.id}-dc`}
            counts={t.dailyCounts}
            onCommit={(d, n) => {
              const next = [...t.dailyCounts];
              next[d] = n;
              return save({ dailyCounts: next });
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor={`${t.id}-fill`} className="text-xs text-slate-500">
              Same every day:
            </label>
            <input
              id={`${t.id}-fill`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SLOTS_PER_DAY}
              value={fill}
              onChange={(e) => setFill(e.target.value)}
              className={`${INPUT} w-20`}
            />
            <button
              type="button"
              className={`${GHOST_BTN} md:py-1 md:text-xs`}
              disabled={fill === ""}
              onClick={async () => {
                const n = parseIntIn(fill, 0, MAX_SLOTS_PER_DAY);
                if (n === null) return fail(`Enter a whole number from 0 to ${MAX_SLOTS_PER_DAY}.`);
                if (await save({ dailyCounts: Array(7).fill(n) })) setFill("");
              }}
            >
              Apply to all 7
            </button>
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor={`${t.id}-hol`}>
            On holidays
          </label>
          <BlurInput
            id={`${t.id}-hol`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SLOTS_PER_DAY}
            placeholder="Same as weekday"
            value={t.holidayCount === null ? "" : String(t.holidayCount)}
            onCommit={(v) => {
              if (v.trim() === "") return save({ holidayCount: null });
              const n = parseIntIn(v, 0, MAX_SLOTS_PER_DAY);
              if (n === null) {
                fail(`Holiday count must be a whole number from 0 to ${MAX_SLOTS_PER_DAY}, or blank.`);
                return false;
              }
              return save({ holidayCount: n });
            }}
          />
          <p className={HELP}>Leave blank to use that weekday&apos;s number.</p>
        </div>
      </div>

      <div className="mt-2 border-t border-slate-800/60 pt-2">
        <Toggle
          checked={t.active}
          onChange={(v) => save({ active: v })}
          label="Active"
          description="Inactive shift types are not scheduled."
        />
      </div>
    </div>
  );
}
