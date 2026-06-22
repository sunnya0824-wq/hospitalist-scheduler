import type { MonthSchedule } from "./schedule-service";
import { ROUNDER_COUNT } from "./scheduler/shifts";

/**
 * Flatten a month schedule into a header row + data rows, one row per
 * calendar day, columns for each of the 13 shift slots. Shared by the CSV,
 * XLSX, and copy-to-clipboard exporters so every format is consistent.
 */
export function buildScheduleTable(schedule: MonthSchedule): string[][] {
  const header = [
    "Date",
    "Day",
    ...Array.from({ length: ROUNDER_COUNT }, (_, i) => `Rounder ${i + 1}`),
    "Admin",
    "Night Admit 1",
    "Night Admit 2",
  ];

  // Group assignments by date.
  const byDate = new Map<string, MonthSchedule["assignments"]>();
  for (const a of schedule.assignments) {
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date)!.push(a);
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows: string[][] = [];

  for (const date of Array.from(byDate.keys()).sort()) {
    const dayAssignments = byDate.get(date)!;
    const cellFor = (type: string, idx?: number) => {
      const a = dayAssignments.find(
        (x) => x.shiftType === type && (idx ? x.rounderIndex === idx : true)
      );
      return a?.physicianName ?? "";
    };

    const dow = dayNames[new Date(date + "T00:00:00Z").getUTCDay()];
    rows.push([
      date,
      dow,
      ...Array.from({ length: ROUNDER_COUNT }, (_, i) =>
        cellFor("ROUNDER", i + 1)
      ),
      cellFor("ADMIN"),
      cellFor("NIGHT_ADMIT_1"),
      cellFor("NIGHT_ADMIT_2"),
    ]);
  }

  return [header, ...rows];
}

/** Serialise a table to CSV with basic field escaping. */
export function tableToCSV(table: string[][]): string {
  return table
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
          return cell;
        })
        .join(",")
    )
    .join("\n");
}
