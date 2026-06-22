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
    chip: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
    label: "Admin",
  },
  NIGHT_ADMIT_1: {
    chip: "bg-indigo-100 text-indigo-800 border-indigo-300",
    dot: "bg-indigo-500",
    label: "Night Admit 1",
  },
  NIGHT_ADMIT_2: {
    chip: "bg-purple-100 text-purple-800 border-purple-300",
    dot: "bg-purple-500",
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
