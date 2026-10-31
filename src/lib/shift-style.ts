import type { ShiftCategory } from "./scheduler/types";

/**
 * Neon chip styles keyed by a template's color name. Templates store one of
 * these names; unknown names fall back to cyan.
 */
export interface ColorStyle {
  chip: string;
  dot: string;
  badge: string;
}

export const SHIFT_COLORS: Record<string, ColorStyle> = {
  cyan: {
    chip: "bg-[#0e2a33] text-cyan-300 border-cyan-400/60 shadow-[0_0_8px_rgba(34,211,238,0.25)]",
    dot: "bg-cyan-400",
    badge: "bg-cyan-500/10 text-cyan-300 border-cyan-400/60",
  },
  amber: {
    chip: "bg-[#2b220a] text-amber-300 border-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.25)]",
    dot: "bg-amber-400",
    badge: "bg-amber-500/10 text-amber-300 border-amber-400/60",
  },
  teal: {
    chip: "bg-[#0c2b29] text-teal-300 border-teal-400/60 shadow-[0_0_8px_rgba(45,212,191,0.25)]",
    dot: "bg-teal-400",
    badge: "bg-teal-500/10 text-teal-300 border-teal-400/60",
  },
  fuchsia: {
    chip: "bg-[#2a1430] text-fuchsia-300 border-fuchsia-400/60 shadow-[0_0_8px_rgba(232,121,249,0.25)]",
    dot: "bg-fuchsia-400",
    badge: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-400/60",
  },
  violet: {
    chip: "bg-[#1e1636] text-violet-300 border-violet-400/60 shadow-[0_0_8px_rgba(167,139,250,0.25)]",
    dot: "bg-violet-400",
    badge: "bg-violet-500/10 text-violet-300 border-violet-400/60",
  },
  lime: {
    chip: "bg-[#1c2a0c] text-lime-300 border-lime-400/60 shadow-[0_0_8px_rgba(163,230,53,0.25)]",
    dot: "bg-lime-400",
    badge: "bg-lime-500/10 text-lime-300 border-lime-400/60",
  },
  rose: {
    chip: "bg-[#2e1218] text-rose-300 border-rose-400/60 shadow-[0_0_8px_rgba(251,113,133,0.25)]",
    dot: "bg-rose-400",
    badge: "bg-rose-500/10 text-rose-300 border-rose-400/60",
  },
  sky: {
    chip: "bg-[#0c2236] text-sky-300 border-sky-400/60 shadow-[0_0_8px_rgba(56,189,248,0.25)]",
    dot: "bg-sky-400",
    badge: "bg-sky-500/10 text-sky-300 border-sky-400/60",
  },
  orange: {
    chip: "bg-[#2e1a0a] text-orange-300 border-orange-400/60 shadow-[0_0_8px_rgba(251,146,60,0.25)]",
    dot: "bg-orange-400",
    badge: "bg-orange-500/10 text-orange-300 border-orange-400/60",
  },
  slate: {
    chip: "bg-slate-800/60 text-slate-200 border-slate-500/60",
    dot: "bg-slate-400",
    badge: "bg-slate-500/10 text-slate-300 border-slate-500/40",
  },
};

export const COLOR_NAMES = Object.keys(SHIFT_COLORS);

export function colorStyle(name: string | null | undefined): ColorStyle {
  return SHIFT_COLORS[name ?? ""] ?? SHIFT_COLORS.cyan;
}

/** Default color per category, used when creating templates. */
export const CATEGORY_DEFAULT_COLOR: Record<ShiftCategory, string> = {
  DAY: "cyan",
  ADMIT: "amber",
  NIGHT: "fuchsia",
};

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
