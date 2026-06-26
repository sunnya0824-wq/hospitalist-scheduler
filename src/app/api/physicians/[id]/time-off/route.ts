import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fromISODate, toISODate } from "@/lib/scheduler/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const rows = await prisma.timeOffRequest.findMany({
    where: { physicianId: params.id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, date: toISODate(r.date), note: r.note }))
  );
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const dates: string[] = Array.isArray(body.dates) ? body.dates : [];
  const note: string | null =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  for (const iso of dates) {
    const date = fromISODate(iso);
    await prisma.timeOffRequest.upsert({
      where: { physicianId_date: { physicianId: params.id, date } },
      update: { note },
      create: { physicianId: params.id, date, note },
    });
  }

  const rows = await prisma.timeOffRequest.findMany({
    where: { physicianId: params.id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, date: toISODate(r.date), note: r.note }))
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const dates: string[] = Array.isArray(body.dates) ? body.dates : [];

  await prisma.timeOffRequest.deleteMany({
    where: {
      physicianId: params.id,
      date: { in: dates.map((iso) => fromISODate(iso)) },
    },
  });

  const rows = await prisma.timeOffRequest.findMany({
    where: { physicianId: params.id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, date: toISODate(r.date), note: r.note }))
  );
}
