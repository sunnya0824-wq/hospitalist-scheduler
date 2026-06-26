import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Clear the lock flag on every assignment in a given month. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const year = Number(body.year);
  const month = Number(body.month);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "Valid year and month (1-12) are required." },
      { status: 400 }
    );
  }

  const scheduleMonth = await prisma.scheduleMonth.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  if (!scheduleMonth) {
    return NextResponse.json({ unlocked: 0 });
  }

  const result = await prisma.shiftAssignment.updateMany({
    where: { scheduleMonthId: scheduleMonth.id, isLocked: true },
    data: { isLocked: false },
  });
  return NextResponse.json({ unlocked: result.count });
}
