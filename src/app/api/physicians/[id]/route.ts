import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fromISODate } from "@/lib/scheduler/dates";
import { sanitize, validatePreferences } from "@/lib/physician-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { unavailableDates, preferredDates, ...fields } = body;

  const prefError = validatePreferences(fields);
  if (prefError) {
    return NextResponse.json({ error: prefError }, { status: 400 });
  }

  // Replace availability rows when the client sends date arrays.
  if (Array.isArray(unavailableDates) || Array.isArray(preferredDates)) {
    await prisma.physicianAvailability.deleteMany({
      where: { physicianId: params.id },
    });
    await prisma.physicianAvailability.createMany({
      data: [
        ...(unavailableDates ?? []).map((date: string) => ({
          physicianId: params.id,
          date: fromISODate(date),
          type: "UNAVAILABLE" as const,
        })),
        ...(preferredDates ?? []).map((date: string) => ({
          physicianId: params.id,
          date: fromISODate(date),
          type: "PREFERRED" as const,
        })),
      ],
    });
  }

  const physician = await prisma.physician.update({
    where: { id: params.id },
    data: sanitize(fields),
    include: { availability: true },
  });
  return NextResponse.json(physician);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.physician.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
