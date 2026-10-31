import type { ShiftCategory, ShiftSlot } from "./types";
import { addDaysISO, monthDates, weekdayOf } from "./dates";

/** A configured shift template, flattened with its location's details. */
export interface ShiftTemplateDef {
  id: string;
  locationId: string;
  locationName: string;
  locationCode: string;
  locationSort: number;
  name: string;
  code: string;
  category: ShiftCategory;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM"; at or before startTime means the shift ends the next day. */
  endTime: string;
  /** Slots needed Sunday … Saturday. */
  dailyCounts: number[];
  /** Slots needed on holidays; null = use the weekday count. */
  holidayCount: number | null;
  color: string;
  sortOrder: number;
}

export const CATEGORY_LABELS: Record<ShiftCategory, string> = {
  DAY: "Day",
  ADMIT: "Admitting",
  NIGHT: "Night",
};

export const CATEGORY_DESCRIPTIONS: Record<ShiftCategory, string> = {
  DAY: "Regular daytime work (e.g. rounding). Anyone can take these.",
  ADMIT: "Admitting shifts. Only admit-eligible physicians.",
  NIGHT: "Overnight shifts. Only night-eligible physicians; rest days follow each block.",
};

export const MAX_SLOTS_PER_DAY = 50;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(t: string): boolean {
  return TIME_RE.test(t);
}

/** True when a shift ends on the calendar day after it starts. */
export function isOvernight(startTime: string, endTime: string): boolean {
  return endTime <= startTime;
}

/** Shift length in hours (handles overnight). */
export function shiftHours(startTime: string, endTime: string): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let diff = toMin(endTime) - toMin(startTime);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

/** Clamp a count to a sane non-negative integer. */
export function clampCount(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_SLOTS_PER_DAY, n);
}

/** Normalize a dailyCounts array to exactly 7 clamped values. */
export function normalizeDailyCounts(raw: unknown, fallback = 1): number[] {
  if (Array.isArray(raw)) {
    const out = raw.slice(0, 7).map(clampCount);
    while (out.length < 7) out.push(out.length ? out[out.length - 1] : fallback);
    return out;
  }
  if (raw !== undefined && raw !== null && raw !== "") {
    return Array(7).fill(clampCount(raw));
  }
  return Array(7).fill(fallback);
}

/** Per-month overrides: template id → slots per day (every day). */
export type CoverageOverrides = Record<string, number>;

export function normalizeOverrides(raw: unknown): CoverageOverrides {
  const out: CoverageOverrides = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === null || v === undefined || v === "") continue;
      out[k] = clampCount(v);
    }
  }
  return out;
}

/** Slots a template needs on a given date. */
export function countFor(
  t: ShiftTemplateDef,
  iso: string,
  holidays: ReadonlySet<string>,
  overrides: CoverageOverrides = {}
): number {
  if (t.id in overrides) return overrides[t.id];
  if (t.holidayCount != null && holidays.has(iso)) return t.holidayCount;
  return t.dailyCounts[weekdayOf(iso)] ?? 0;
}

/** Order templates the way they should appear (location, then template). */
export function sortTemplates<T extends Pick<ShiftTemplateDef, "locationSort" | "sortOrder" | "locationName" | "name">>(
  templates: T[]
): T[] {
  return [...templates].sort(
    (a, b) =>
      a.locationSort - b.locationSort ||
      a.locationName.localeCompare(b.locationName) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name)
  );
}

/** Build every empty slot for the given dates. */
export function generateSlotsForDates(
  dates: string[],
  templates: ShiftTemplateDef[],
  holidays: ReadonlySet<string> = new Set(),
  overrides: CoverageOverrides = {}
): ShiftSlot[] {
  const slots: ShiftSlot[] = [];
  const ordered = sortTemplates(templates);
  for (const date of dates) {
    for (const t of ordered) {
      const n = countFor(t, date, holidays, overrides);
      const endDate = isOvernight(t.startTime, t.endTime) ? addDaysISO(date, 1) : date;
      for (let i = 1; i <= n; i++) {
        slots.push({
          date,
          endDate,
          shiftTemplateId: t.id,
          locationId: t.locationId,
          category: t.category,
          slotIndex: i,
          startTime: t.startTime,
          endTime: t.endTime,
          shiftName: t.name,
          shiftCode: t.code,
          locationName: t.locationName,
          locationCode: t.locationCode,
          color: t.color,
          locationSort: t.locationSort,
          templateSort: t.sortOrder,
          physicianId: null,
          isLocked: false,
          isManual: false,
        });
      }
    }
  }
  return slots;
}

/** Build every empty slot for a month. */
export function generateSlots(
  year: number,
  month: number,
  templates: ShiftTemplateDef[],
  holidays: ReadonlySet<string> = new Set(),
  overrides: CoverageOverrides = {}
): ShiftSlot[] {
  return generateSlotsForDates(monthDates(year, month), templates, holidays, overrides);
}

/** Label for one slot, e.g. "R3" when a template has several that day. */
export function slotLabel(code: string, slotIndex: number, multiple: boolean): string {
  return multiple ? `${code}${slotIndex}` : code;
}

/** Stable key identifying a slot within a day. */
export function slotKey(date: string, templateKey: string, slotIndex: number): string {
  return `${date}|${templateKey}|${slotIndex}`;
}

/** A tabular column for by-day schedule views and exports. */
export interface ScheduleColumn {
  /** Template id, or a name-based key for deleted templates. */
  templateKey: string;
  slotIndex: number;
  label: string;
  locationName: string;
  locationCode: string;
  shiftName: string;
  category: ShiftCategory;
  color: string;
}

interface ColumnSource {
  shiftTemplateId: string | null;
  shiftName: string;
  shiftCode: string;
  locationName: string;
  locationCode: string;
  category: ShiftCategory;
  color: string;
  slotIndex: number;
}

/** Key an assignment by template (falls back to snapshot for deleted templates). */
export function templateKeyOf(a: Pick<ColumnSource, "shiftTemplateId" | "locationName" | "shiftName">): string {
  return a.shiftTemplateId ?? `deleted:${a.locationName}:${a.shiftName}`;
}

/**
 * Columns for a month, derived from the assignments actually stored (so past
 * months render correctly even after templates change). Templates supply the
 * ordering; anything unknown is appended in first-seen order.
 */
export function scheduleColumns(
  assignments: ColumnSource[],
  templates: Pick<ShiftTemplateDef, "id" | "locationSort" | "sortOrder" | "locationName" | "name">[] = []
): ScheduleColumn[] {
  const maxIndex = new Map<string, number>();
  const sample = new Map<string, ColumnSource>();
  for (const a of assignments) {
    const key = templateKeyOf(a);
    maxIndex.set(key, Math.max(maxIndex.get(key) ?? 0, a.slotIndex));
    if (!sample.has(key)) sample.set(key, a);
  }
  const order = new Map<string, number>();
  sortTemplates(templates).forEach((t, i) => order.set(t.id, i));
  const keys = [...sample.keys()].sort((a, b) => {
    const oa = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });
  const cols: ScheduleColumn[] = [];
  for (const key of keys) {
    const s = sample.get(key)!;
    const n = maxIndex.get(key)!;
    for (let i = 1; i <= n; i++) {
      cols.push({
        templateKey: key,
        slotIndex: i,
        label: slotLabel(s.shiftCode, i, n > 1),
        locationName: s.locationName,
        locationCode: s.locationCode,
        shiftName: s.shiftName,
        category: s.category,
        color: s.color,
      });
    }
  }
  return cols;
}
