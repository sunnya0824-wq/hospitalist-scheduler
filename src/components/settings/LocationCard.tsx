"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { LocationDTO, ShiftCategory } from "@/lib/api-types";
import {
  createShiftTemplate,
  deleteLocation,
  deleteShiftTemplate,
  updateLocation,
  updateShiftTemplate,
} from "@/lib/client";
import { MAX_SLOTS_PER_DAY, isValidTime } from "@/lib/scheduler/shifts";
import { CATEGORY_DEFAULT_COLOR } from "@/lib/shift-style";
import { CategorySelect, ColorSwatches, ShiftTemplateRow, TimeSummary, WeekdayCounts } from "./ShiftTemplateRow";
import {
  BlurInput,
  DANGER_BTN,
  GHOST_BTN,
  ICON_BTN,
  INPUT,
  LABEL,
  PRIMARY_BTN,
  Toggle,
  fmtSlots,
  moveItem,
  parseIntIn,
} from "./ui";

type Run = (fn: () => Promise<unknown>, saved?: string) => Promise<boolean>;

/** Average slots per day across the week for active shift types. */
export function locationDailyAverage(loc: LocationDTO): number {
  return loc.templates
    .filter((t) => t.active)
    .reduce((sum, t) => sum + t.dailyCounts.reduce((a, b) => a + b, 0) / 7, 0);
}

interface NewShift {
  name: string;
  code: string;
  category: ShiftCategory;
  startTime: string;
  endTime: string;
  dailyCounts: number[];
  color: string;
  colorTouched: boolean;
}

const newShift = (): NewShift => ({
  name: "",
  code: "",
  category: "DAY",
  startTime: "07:00",
  endTime: "17:00",
  dailyCounts: Array(7).fill(1),
  color: CATEGORY_DEFAULT_COLOR.DAY,
  colorTouched: false,
});

function AddShiftForm({
  locationId,
  run,
  fail,
  onDone,
  onCancel,
}: {
  locationId: string;
  run: Run;
  fail: (text: string) => void;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<NewShift>(newShift);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof NewShift>(k: K, v: NewShift[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return fail("Give the shift a name.");
    if (!f.code.trim()) return fail("Give the shift a short label (e.g. D1, NA).");
    if (!isValidTime(f.startTime) || !isValidTime(f.endTime)) return fail("Enter valid start and end times (HH:MM).");
    setBusy(true);
    const ok = await run(
      () =>
        createShiftTemplate({
          locationId,
          name: f.name.trim(),
          code: f.code.trim(),
          category: f.category,
          startTime: f.startTime,
          endTime: f.endTime,
          dailyCounts: f.dailyCounts,
          color: f.color,
          active: true,
        }),
      "Shift added"
    );
    setBusy(false);
    if (ok) {
      setF(newShift());
      await onDone();
    }
  };

  const id = `new-${locationId}`;
  return (
    <form onSubmit={submit} className="rounded-lg border border-dashed border-cyan-900/60 bg-cyan-950/10 p-3 sm:p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">New shift type</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={LABEL} htmlFor={`${id}-name`}>
            Shift name
          </label>
          <input
            id={`${id}-name`}
            className={INPUT}
            value={f.name}
            maxLength={60}
            placeholder="e.g. Day rounder"
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor={`${id}-code`}>
            Short label
          </label>
          <input
            id={`${id}-code`}
            className={INPUT}
            value={f.code}
            maxLength={6}
            placeholder="e.g. D"
            onChange={(e) => set("code", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor={`${id}-cat`}>
            Type
          </label>
          <CategorySelect
            id={`${id}-cat`}
            value={f.category}
            onChange={(c) =>
              setF((p) => ({ ...p, category: c, color: p.colorTouched ? p.color : CATEGORY_DEFAULT_COLOR[c] }))
            }
          />
        </div>
        <div>
          <label className={LABEL} htmlFor={`${id}-start`}>
            Starts
          </label>
          <input
            id={`${id}-start`}
            type="time"
            className={INPUT}
            value={f.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor={`${id}-end`}>
            Ends
          </label>
          <input
            id={`${id}-end`}
            type="time"
            className={INPUT}
            value={f.endTime}
            onChange={(e) => set("endTime", e.target.value)}
          />
          <div className="mt-1">
            <TimeSummary start={f.startTime} end={f.endTime} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <span className={LABEL}>Color</span>
          <ColorSwatches value={f.color} onChange={(c) => setF((p) => ({ ...p, color: c, colorTouched: true }))} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <span className={LABEL}>Physicians needed each day</span>
          <WeekdayCounts
            idPrefix={`${id}-dc`}
            counts={f.dailyCounts}
            onCommit={(d, n) => {
              setF((p) => {
                const next = [...p.dailyCounts];
                next[d] = n;
                return { ...p, dailyCounts: next };
              });
              return true;
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Same every day:</span>
            <BlurInput
              aria-label="Same every day"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SLOTS_PER_DAY}
              value=""
              className={`${INPUT} w-20`}
              onCommit={(v) => {
                const n = parseIntIn(v, 0, MAX_SLOTS_PER_DAY);
                if (n !== null) set("dailyCounts", Array(7).fill(n));
                return false; // clear the quick-fill box after applying
              }}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className={GHOST_BTN} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={PRIMARY_BTN} disabled={busy}>
          {busy ? "Adding…" : "Add shift type"}
        </button>
      </div>
    </form>
  );
}

export function LocationCard({
  loc,
  index,
  count,
  run,
  fail,
  onMove,
  reload,
}: {
  loc: LocationDTO;
  index: number;
  count: number;
  run: Run;
  fail: (text: string) => void;
  onMove: (dir: -1 | 1) => void;
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const templates = [...loc.templates].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const save = async (body: Parameters<typeof updateLocation>[1]) => {
    const ok = await run(() => updateLocation(loc.id, body));
    await reload();
    return ok;
  };

  const remove = async () => {
    if (
      !confirm(
        `Delete ${loc.name} and all ${loc.templates.length} of its shift types?\n\nPast schedules are kept as they are. Future schedules will no longer include this location.`
      )
    )
      return;
    await run(() => deleteLocation(loc.id), "Location deleted");
    await reload();
  };

  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:p-5 ${loc.active ? "" : "opacity-70"}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-100">
            <span className="rounded-sm border border-cyan-400/50 bg-cyan-500/10 px-1.5 text-xs font-semibold uppercase text-cyan-300">
              {loc.code}
            </span>
            <span className="break-words">{loc.name}</span>
            {!loc.active && <span className="text-xs font-normal text-slate-500">(inactive)</span>}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            ~{fmtSlots(locationDailyAverage(loc))} slots/day · {loc.templates.length} shift type
            {loc.templates.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={ICON_BTN} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${loc.name} up`}>
            ↑
          </button>
          <button
            type="button"
            className={ICON_BTN}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${loc.name} down`}
          >
            ↓
          </button>
          <button type="button" className={DANGER_BTN} onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className={LABEL} htmlFor={`${loc.id}-name`}>
            Location name
          </label>
          <BlurInput id={`${loc.id}-name`} value={loc.name} maxLength={80} onCommit={(v) => save({ name: v.trim() })} />
        </div>
        <div>
          <label className={LABEL} htmlFor={`${loc.id}-code`}>
            Short code
          </label>
          <BlurInput
            id={`${loc.id}-code`}
            value={loc.code}
            maxLength={8}
            onCommit={(v) => save({ code: v.trim().toUpperCase() })}
          />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-4">
        <Toggle
          checked={loc.active}
          onChange={(v) => save({ active: v })}
          label="Active"
          description="Inactive locations are left out of new schedules."
        />
        <Toggle
          checked={loc.openToAll}
          onChange={(v) => save({ openToAll: v })}
          label="Open to all physicians"
          description="If off, only physicians you tick on their profile can work here."
        />
      </div>

      <div className="space-y-3">
        {templates.length === 0 && !adding && (
          <p className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">
            No shift types yet. Add the shifts this location needs covered.
          </p>
        )}
        {templates.map((t, i) => (
          <ShiftTemplateRow
            key={t.id}
            t={t}
            index={i}
            count={templates.length}
            run={run}
            fail={fail}
            onChanged={reload}
            onMove={async (dir) => {
              await run(() => moveItem(templates, i, dir, (id, sortOrder) => updateShiftTemplate(id, { sortOrder })), "Order saved");
              await reload();
            }}
            onDelete={async () => {
              if (!confirm(`Delete the "${t.name}" shift type?\n\nPast schedules are kept as they are.`)) return;
              await run(() => deleteShiftTemplate(t.id), "Shift type deleted");
              await reload();
            }}
          />
        ))}
        {adding ? (
          <AddShiftForm locationId={loc.id} run={run} fail={fail} onDone={reload} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" className={GHOST_BTN} onClick={() => setAdding(true)}>
            + Add shift type
          </button>
        )}
      </div>
    </section>
  );
}
