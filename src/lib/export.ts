import type { MonthScheduleDTO } from "./api-types";
import { scheduleColumns, templateKeyOf, slotKey } from "./scheduler/shifts";
import { WEEKDAY_SHORT } from "./shift-style";

/**
 * Flatten a month into a header row + one row per day, one column per slot
 * (grouped by location). Shared by CSV, XLSX and copy-to-clipboard.
 */
export function buildScheduleTable(schedule: MonthScheduleDTO): string[][] {
  const order = new Map(schedule.locations.map((l, i) => [l.id, i]));
  const templates = schedule.coverage.map((c) => ({
    id: c.templateId,
    locationSort: order.get(c.locationId) ?? 0,
    sortOrder: 0,
    locationName: c.locationName,
    name: c.name,
  }));
  // Coverage rows arrive in configured order; keep it.
  templates.forEach((t, i) => (t.sortOrder = i));
  const columns = scheduleColumns(schedule.assignments, templates);
  const multiLocation = new Set(columns.map((c) => c.locationName)).size > 1;
  const header = [
    "Date",
    "Day",
    ...columns.map((c) => (multiLocation ? `${c.locationCode} ${c.label}` : c.label)),
    "Holiday",
  ];

  const cell = new Map<string, string>();
  const dates = new Set<string>();
  for (const a of schedule.assignments) {
    dates.add(a.date);
    cell.set(slotKey(a.date, templateKeyOf(a), a.slotIndex), a.physicianName ?? "");
  }
  const rows = [...dates].sort().map((date) => [
    date,
    WEEKDAY_SHORT[new Date(date + "T00:00:00Z").getUTCDay()],
    ...columns.map((c) => cell.get(slotKey(date, c.templateKey, c.slotIndex)) ?? ""),
    schedule.holidays[date] ?? "",
  ]);
  return [header, ...rows];
}

/** Serialise a table to CSV with basic field escaping. */
export function tableToCSV(table: string[][]): string {
  return table
    .map((row) =>
      row
        .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(",")
    )
    .join("\n");
}
