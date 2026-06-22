import * as XLSX from "xlsx";
import { getMonthSchedule } from "@/lib/schedule-service";
import { buildScheduleTable } from "@/lib/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!year || !month) {
    return new Response("Invalid year/month", { status: 400 });
  }

  const schedule = await getMonthSchedule(year, month);
  const table = buildScheduleTable(schedule);

  const worksheet = XLSX.utils.aoa_to_sheet(table);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule");

  const buffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
  const filename = `schedule-${year}-${String(month).padStart(2, "0")}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
