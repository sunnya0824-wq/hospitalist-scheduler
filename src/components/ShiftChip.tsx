import { colorStyle } from "@/lib/shift-style";

/**
 * A color-coded chip for one assignment. `label` is the slot label (e.g.
 * "R3", "N1"); `locationCode` adds a small site badge when given.
 */
export function ShiftChip({
  label,
  color,
  name,
  empty,
  locationCode,
  title,
}: {
  label: string;
  color: string;
  name?: string | null;
  empty?: boolean;
  locationCode?: string | null;
  title?: string;
}) {
  if (empty || !name) {
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-rose-500/60 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-300"
      >
        {label}: unfilled
      </span>
    );
  }
  const style = colorStyle(color);
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${style.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {name}
      {locationCode && (
        <span className="ml-1 rounded-sm border border-slate-500/40 bg-slate-500/10 px-1 text-[9px] font-semibold uppercase leading-tight text-slate-300">
          {locationCode}
        </span>
      )}
    </span>
  );
}

/** Legend of shift types: one entry per distinct name + color. */
export function ShiftLegend({ items }: { items: { name: string; color: string }[] }) {
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    const k = `${i.name}|${i.color}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
      {unique.map((i) => (
        <span key={`${i.name}|${i.color}`} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-3 w-3 rounded ${colorStyle(i.color).dot}`} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
