import type { ShiftType, Hospital } from "@prisma/client";
import type { ShiftSlot } from "./types";
import { addDaysISO, monthDates } from "./dates";

export const ROUNDER_COUNT = 10;

/** Community (rounding-only) hospitals, in display order. MAIN is handled separately. */
export const COMMUNITY_HOSPITALS = ["CARSON", "EATON", "CLINTON"] as const;
export type CommunityHospital = (typeof COMMUNITY_HOSPITALS)[number];

/** All hospitals including MAIN, in display order. */
export const HOSPITALS: Hospital[] = ["MAIN", "CARSON", "EATON", "CLINTON"];

/** Human-friendly hospital names. */
export const HOSPITAL_LABELS: Record<Hospital, string> = {
  MAIN: "Main Hospital",
  CARSON: "Sparrow Carson",
  EATON: "Sparrow Eaton",
  CLINTON: "Sparrow Clinton",
};

/** Per-hospital rounder-count-per-day for the three community hospitals. */
export interface CommunityCoverage {
  carsonRounderCount: number;
  eatonRounderCount: number;
  clintonRounderCount: number;
}

export const DEFAULT_COMMUNITY_COVERAGE: CommunityCoverage = {
  carsonRounderCount: 0,
  eatonRounderCount: 0,
  clintonRounderCount: 0,
};

/** Map a community hospital to its ScheduleMonth count field name. */
export const COMMUNITY_COUNT_KEY: Record<CommunityHospital, keyof CommunityCoverage> = {
  CARSON: "carsonRounderCount",
  EATON: "eatonRounderCount",
  CLINTON: "clintonRounderCount",
};

/** Clamp incoming community rounder counts to 0-20, applying defaults. */
export function normalizeCommunityCoverage(
  input: Partial<CommunityCoverage> | null | undefined
): CommunityCoverage {
  const clamp = (v: unknown, def: number) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return def;
    return Math.min(20, Math.max(0, n));
  };
  return {
    carsonRounderCount: clamp(input?.carsonRounderCount, 0),
    eatonRounderCount: clamp(input?.eatonRounderCount, 0),
    clintonRounderCount: clamp(input?.clintonRounderCount, 0),
  };
}

/** Per-month adjustable daily coverage counts. */
export interface CoverageSettings {
  rounderCount: number;
  dayAdmitCount: number;
  nightAdmit1Count: number;
  nightAdmit2Count: number;
}

/** Defaults matching the original hardcoded template (13 slots/day). */
export const DEFAULT_COVERAGE: CoverageSettings = {
  rounderCount: 10,
  dayAdmitCount: 1,
  nightAdmit1Count: 1,
  nightAdmit2Count: 1,
};

/** Total daily slots implied by a coverage setting. */
export function totalDailySlots(c: CoverageSettings): number {
  return (
    c.rounderCount + c.dayAdmitCount + c.nightAdmit1Count + c.nightAdmit2Count
  );
}

/** Clamp incoming coverage values to their valid ranges, applying defaults. */
export function normalizeCoverage(
  input: Partial<CoverageSettings> | null | undefined
): CoverageSettings {
  const clamp = (v: unknown, lo: number, hi: number, def: number) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    rounderCount: clamp(input?.rounderCount, 1, 20, DEFAULT_COVERAGE.rounderCount),
    dayAdmitCount: clamp(input?.dayAdmitCount, 0, 3, DEFAULT_COVERAGE.dayAdmitCount),
    nightAdmit1Count: clamp(
      input?.nightAdmit1Count,
      0,
      2,
      DEFAULT_COVERAGE.nightAdmit1Count
    ),
    nightAdmit2Count: clamp(
      input?.nightAdmit2Count,
      0,
      2,
      DEFAULT_COVERAGE.nightAdmit2Count
    ),
  };
}

/** Static definition of a single daily shift slot template. */
export interface ShiftDefinition {
  shiftType: ShiftType;
  rounderIndex: number | null;
  startTime: string;
  endTime: string;
  /** Days the shift end date is offset from the start date. */
  endOffset: number;
}

/**
 * Build the per-day list of shift slot templates from the coverage settings.
 * ROUNDER slots are always indexed 1..rounderCount. For ADMIN/NIGHT types the
 * index is stored in rounderIndex only when more than one slot exists, so the
 * common single-slot case keeps a null index (matching the original schema).
 */
export function shiftDefinitions(
  coverage: CoverageSettings
): ShiftDefinition[] {
  const defs: ShiftDefinition[] = [];
  for (let i = 0; i < coverage.rounderCount; i++) {
    defs.push({
      shiftType: "ROUNDER",
      rounderIndex: i + 1,
      startTime: "07:00",
      endTime: "17:00",
      endOffset: 0,
    });
  }
  for (let i = 0; i < coverage.dayAdmitCount; i++) {
    defs.push({
      shiftType: "ADMIN",
      rounderIndex: coverage.dayAdmitCount > 1 ? i + 1 : null,
      startTime: "12:00",
      endTime: "21:00",
      endOffset: 0,
    });
  }
  for (let i = 0; i < coverage.nightAdmit1Count; i++) {
    defs.push({
      shiftType: "NIGHT_ADMIT_1",
      rounderIndex: coverage.nightAdmit1Count > 1 ? i + 1 : null,
      startTime: "17:00",
      endTime: "05:00",
      endOffset: 1,
    });
  }
  for (let i = 0; i < coverage.nightAdmit2Count; i++) {
    defs.push({
      shiftType: "NIGHT_ADMIT_2",
      rounderIndex: coverage.nightAdmit2Count > 1 ? i + 1 : null,
      startTime: "19:00",
      endTime: "07:00",
      endOffset: 1,
    });
  }
  return defs;
}

/** Backwards-compatible default template (10 rounders + 1 admin + 2 nights). */
export const SHIFT_DEFINITIONS: ShiftDefinition[] =
  shiftDefinitions(DEFAULT_COVERAGE);

/** A single tabular column for the by-day schedule / exports. */
export interface ScheduleColumn {
  /** Header label, e.g. "R1", "Day Admit", "Night 1". */
  label: string;
  shiftType: ShiftType;
  /** Slot index to match (rounderIndex); null matches the sole slot of a type. */
  index: number | null;
}

/**
 * Ordered list of table columns derived from coverage settings. Used by the
 * print view, CSV/XLSX exports and the clipboard TSV so every tabular output
 * respects the configured counts.
 */
export function scheduleColumns(coverage: CoverageSettings): ScheduleColumn[] {
  const cols: ScheduleColumn[] = [];
  for (let i = 0; i < coverage.rounderCount; i++) {
    cols.push({ label: `R${i + 1}`, shiftType: "ROUNDER", index: i + 1 });
  }
  for (let i = 0; i < coverage.dayAdmitCount; i++) {
    cols.push({
      label: coverage.dayAdmitCount > 1 ? `Day Admit ${i + 1}` : "Day Admit",
      shiftType: "ADMIN",
      index: coverage.dayAdmitCount > 1 ? i + 1 : null,
    });
  }
  for (let i = 0; i < coverage.nightAdmit1Count; i++) {
    cols.push({
      label: coverage.nightAdmit1Count > 1 ? `Night 1.${i + 1}` : "Night 1",
      shiftType: "NIGHT_ADMIT_1",
      index: coverage.nightAdmit1Count > 1 ? i + 1 : null,
    });
  }
  for (let i = 0; i < coverage.nightAdmit2Count; i++) {
    cols.push({
      label: coverage.nightAdmit2Count > 1 ? `Night 2.${i + 1}` : "Night 2",
      shiftType: "NIGHT_ADMIT_2",
      index: coverage.nightAdmit2Count > 1 ? i + 1 : null,
    });
  }
  return cols;
}

export const NIGHT_TYPES: ShiftType[] = ["NIGHT_ADMIT_1", "NIGHT_ADMIT_2"];

export function isNightType(type: ShiftType): boolean {
  return type === "NIGHT_ADMIT_1" || type === "NIGHT_ADMIT_2";
}

export const SHIFT_LABELS: Record<ShiftType, string> = {
  ROUNDER: "Rounder",
  ADMIN: "Admin",
  NIGHT_ADMIT_1: "Night Admit 1",
  NIGHT_ADMIT_2: "Night Admit 2",
};

/**
 * Generate every empty slot for a month from the coverage settings.
 * Ordering within a day follows the generated definitions (rounders, admin,
 * nights). Defaults to the original 13-slot template when no settings given.
 */
export function generateSlots(
  year: number,
  month: number,
  coverage: CoverageSettings = DEFAULT_COVERAGE
): ShiftSlot[] {
  const defs = shiftDefinitions(coverage);
  const slots: ShiftSlot[] = [];
  for (const date of monthDates(year, month)) {
    for (const def of defs) {
      slots.push({
        date,
        endDate: addDaysISO(date, def.endOffset),
        shiftType: def.shiftType,
        hospital: "MAIN",
        rounderIndex: def.rounderIndex,
        startTime: def.startTime,
        endTime: def.endTime,
        physicianId: null,
        isLocked: false,
        isManual: false,
      });
    }
  }
  return slots;
}

/**
 * Generate rounder-only slots for one community hospital. Each day gets
 * `rounderCount` ROUNDER slots (07:00–17:00), indexed 1..rounderCount.
 */
export function generateCommunitySlots(
  year: number,
  month: number,
  hospital: CommunityHospital,
  rounderCount: number
): ShiftSlot[] {
  const slots: ShiftSlot[] = [];
  if (rounderCount <= 0) return slots;
  for (const date of monthDates(year, month)) {
    for (let i = 0; i < rounderCount; i++) {
      slots.push({
        date,
        endDate: date,
        shiftType: "ROUNDER",
        hospital,
        rounderIndex: i + 1,
        startTime: "07:00",
        endTime: "17:00",
        physicianId: null,
        isLocked: false,
        isManual: false,
      });
    }
  }
  return slots;
}
