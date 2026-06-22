import type { ShiftType } from "@prisma/client";
import { SHIFT_STYLES } from "@/lib/shift-style";

export function ShiftChip({
  shiftType,
  rounderIndex,
  name,
  empty,
}: {
  shiftType: ShiftType;
  rounderIndex?: number | null;
  name?: string | null;
  empty?: boolean;
}) {
  const style = SHIFT_STYLES[shiftType];
  const label =
    shiftType === "ROUNDER" && rounderIndex
      ? `R${rounderIndex}`
      : style.label;

  if (empty || !name) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
        {label}: unfilled
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {name}
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
        <span key={t} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className={`h-3 w-3 rounded ${SHIFT_STYLES[t].dot}`} />
          {SHIFT_STYLES[t].label}
        </span>
      ))}
    </div>
  );
}
