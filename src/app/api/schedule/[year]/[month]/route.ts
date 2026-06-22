import { NextResponse } from "next/server";
import { getMonthSchedule } from "@/lib/schedule-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { year: string; month: string } }
) {
  const year = Number(params.year);
  const month = Number(params.month);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year/month." }, { status: 400 });
  }
  const schedule = await getMonthSchedule(year, month);
  return NextResponse.json(schedule);
}
