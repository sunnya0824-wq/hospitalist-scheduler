import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHolidayConfig } from "@/lib/config";
import { parseHoliday } from "@/lib/config-validate";
import { holidaysInRange, fromISODate } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET ?year=YYYY → the holidays that apply that year, as [{ date, name }]. */
export async function GET(req: Request) {
  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
  if (year < 1900 || year > 9999) return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  const y = String(year).padStart(4, "0");
  const map = holidaysInRange(`${y}-01-01`, `${y}-12-31`, await getHolidayConfig());
  return NextResponse.json([...map].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, name]) => ({ date, name })));
}

export async function POST(req: Request) {
  const parsed = parseHoliday(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const h = await prisma.holiday.create({
    data: { date: fromISODate(parsed.data.date), name: parsed.data.name, recurring: parsed.data.recurring },
  });
  return NextResponse.json({ id: h.id }, { status: 201 });
}
