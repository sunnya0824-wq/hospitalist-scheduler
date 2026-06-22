import { getMonthSchedule } from "@/lib/schedule-service";
import { buildScheduleTable, tableToCSV } from "@/lib/export";

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
  const csv = tableToCSV(buildScheduleTable(schedule));
  const filename = `schedule-${year}-${String(month).padStart(2, "0")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
