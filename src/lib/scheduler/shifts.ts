import type { ShiftType } from "@prisma/client";
import type { ShiftSlot } from "./types";
import { addDaysISO, monthDates } from "./dates";

export const ROUNDER_COUNT = 10;

/** Static definition of the daily shift template (13 slots/day). */
export interface ShiftDefinition {
  shiftType: ShiftType;
  rounderIndex: number | null;
  startTime: string;
  endTime: string;
  /** Days the shift end date is offset from the start date. */
  endOffset: number;
}

export const SHIFT_DEFINITIONS: ShiftDefinition[] = [
  ...Array.from({ length: ROUNDER_COUNT }, (_, i) => ({
    shiftType: "ROUNDER" as ShiftType,
    rounderIndex: i + 1,
    startTime: "07:00",
    endTime: "17:00",
    endOffset: 0,
  })),
  {
    shiftType: "ADMIN",
    rounderIndex: null,
    startTime: "12:00",
    endTime: "21:00",
    endOffset: 0,
  },
  {
    shiftType: "NIGHT_ADMIT_1",
    rounderIndex: null,
    startTime: "17:00",
    endTime: "05:00",
    endOffset: 1,
  },
  {
    shiftType: "NIGHT_ADMIT_2",
    rounderIndex: null,
    startTime: "19:00",
    endTime: "07:00",
    endOffset: 1,
  },
];

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
 * Generate every empty slot for a month: 13 slots per calendar day.
 * Ordering within a day follows SHIFT_DEFINITIONS (rounders, admin, nights).
 */
export function generateSlots(year: number, month: number): ShiftSlot[] {
  const slots: ShiftSlot[] = [];
  for (const date of monthDates(year, month)) {
    for (const def of SHIFT_DEFINITIONS) {
      slots.push({
        date,
        endDate: addDaysISO(date, def.endOffset),
        shiftType: def.shiftType,
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
