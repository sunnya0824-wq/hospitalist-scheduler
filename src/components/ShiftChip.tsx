import type { ShiftType, Hospital } from "@prisma/client";
import { SHIFT_STYLES, getHospitalBadge } from "@/lib/shift-style";

export function ShiftChip({
  shiftType,
  rounderIndex,
  name,
  empty,
  hospital,
}: {
  shiftType: ShiftType;
  rounderIndex?: number | null;
  name?: string | null;
  empty?: boolean;
  /** When provided (and not MAIN), shows a small hospital badge on the chip. */
  hospital?: Hospital;
}) {
  const style = SHIFT_STYLES[shiftType];
  const label =
    shiftType === "ROUNDER" && rounderIndex
      ? `R${rounderIndex}`
      : style.label;

  if (empty || !name) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-rose-500/60 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-300">
        {label}: unfilled
      </span>
    );
  }

  const badge =
    hospital && hospital !== "MAIN" ? getHospitalBadge(hospital) : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {name}
      {badge && (
        <span
          className={`ml-1 rounded-sm border px-1 text-[9px] font-semibold uppercase leading-tight ${badge.badge}`}
          title={badge.label}
        >
          {badge.short}
        </span>
      )}
    </span>
  );
}

export function ShiftLegend() {
  const types: ShiftType[] = [
    "ROUNDER",
    "ADMIN",
    "NIGHT_ADMIT_1",
    "NIGHT_ADMIT_2",
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {types.map((t) => (
        <span key={t} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-3 w-3 rounded ${SHIFT_STYLES[t].dot}`} />
          {SHIFT_STYLES[t].label}
        </span>
      ))}
    </div>
  );
}
