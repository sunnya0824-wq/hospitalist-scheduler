import { NextResponse } from "next/server";
import { generateSchedule } from "@/lib/schedule-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const year = Number(body.year);
  const month = Number(body.month);
  const allowOverMax = Boolean(body.allowOverMax);

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "Valid year and month (1-12) are required." },
      { status: 400 }
    );
  }

  const result = await generateSchedule(year, month, allowOverMax);
  return NextResponse.json(result);
}
