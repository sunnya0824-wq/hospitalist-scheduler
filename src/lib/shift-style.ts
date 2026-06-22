import type { ShiftType } from "@prisma/client";

/** Tailwind class sets for each shift type's color-coded chip. */
export const SHIFT_STYLES: Record<
  ShiftType,
  { chip: string; dot: string; label: string }
> = {
  ROUNDER: {
    chip: "bg-blue-100 text-blue-800 border-blue-300",
    dot: "bg-blue-500",
    label: "Rounder",
  },
  ADMIN: {
    chip: "bg-amber-100 text-amber-900 border-amber-300",
    dot: "bg-amber-500",
    label: "Day Admitting",
  },
  NIGHT_ADMIT_1: {
    chip: "bg-teal-100 text-teal-900 border-teal-400",
    dot: "bg-teal-500",
    label: "Night Admit 1",
  },
  NIGHT_ADMIT_2: {
    chip: "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-400",
    dot: "bg-fuchsia-600",
    label: "Night Admit 2",
  },
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
