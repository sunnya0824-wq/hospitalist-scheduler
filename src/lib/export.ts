import type { MonthSchedule } from "./schedule-service";
import { scheduleColumns } from "./scheduler/shifts";

/**
 * Flatten a month schedule into a header row + data rows, one row per
 * calendar day, with one column per configured shift slot. Shared by the CSV,
 * XLSX, and copy-to-clipboard exporters so every format is consistent.
 */
export function buildScheduleTable(schedule: MonthSchedule): string[][] {
  const columns = scheduleColumns({
    rounderCount: schedule.rounderCount,
    dayAdmitCount: schedule.dayAdmitCount,
    nightAdmit1Count: schedule.nightAdmit1Count,
    nightAdmit2Count: schedule.nightAdmit2Count,
  });

  const header = ["Date", "Day", ...columns.map((c) => c.label)];

  // Group MAIN-hospital assignments by date (community rounders are a
  // separate per-hospital grid and would otherwise collide with R columns).
  const byDate = new Map<string, MonthSchedule["assignments"]>();
  for (const a of schedule.assignments) {
    if (a.hospital !== "MAIN") continue;
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date)!.push(a);
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows: string[][] = [];

  for (const date of Array.from(byDate.keys()).sort()) {
    const dayAssignments = byDate.get(date)!;
    const cellFor = (type: string, idx: number | null) => {
      const a = dayAssignments.find(
        (x) => x.shiftType === type && (idx ? x.rounderIndex === idx : true)
      );
      return a?.physicianName ?? "";
    };

    const dow = dayNames[new Date(date + "T00:00:00Z").getUTCDay()];
    rows.push([
      date,
      dow,
      ...columns.map((c) => cellFor(c.shiftType, c.index)),
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
