import type { ShiftType } from "@prisma/client";

/** Tailwind class sets for each shift type's color-coded chip. */
export const SHIFT_STYLES: Record<
  ShiftType,
  { chip: string; dot: string; label: string }
> = {
  ROUNDER: {
    chip: "bg-[#0e2a33] text-cyan-300 border-cyan-400/60 shadow-[0_0_8px_rgba(34,211,238,0.25)]",
    dot: "bg-cyan-400",
    label: "Rounder",
  },
  ADMIN: {
    chip: "bg-[#2b220a] text-amber-300 border-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.25)]",
    dot: "bg-amber-400",
    label: "Day Admitting",
  },
  NIGHT_ADMIT_1: {
    chip: "bg-[#0c2b29] text-teal-300 border-teal-400/60 shadow-[0_0_8px_rgba(45,212,191,0.25)]",
    dot: "bg-teal-400",
    label: "Night Admit 1",
  },
  NIGHT_ADMIT_2: {
    chip: "bg-[#2a1430] text-fuchsia-300 border-fuchsia-400/60 shadow-[0_0_8px_rgba(232,121,249,0.25)]",
    dot: "bg-fuchsia-400",
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
