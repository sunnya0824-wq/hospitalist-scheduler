import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fromISODate } from "@/lib/scheduler/dates";
import { sanitize, validatePreferences, validateNumbers, coerceLocationIds } from "@/lib/physician-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const { unavailableDates, preferredDates, locationIds, ...fields } = body;

  const error = validatePreferences(fields) ?? validateNumbers(fields);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const exists = await prisma.physician.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Physician not found" }, { status: 404 });

  const ops = [];
  // Replace availability rows when the client sends date arrays.
  if (Array.isArray(unavailableDates) || Array.isArray(preferredDates)) {
    ops.push(prisma.physicianAvailability.deleteMany({ where: { physicianId: params.id } }));
    ops.push(
      prisma.physicianAvailability.createMany({
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
        skipDuplicates: true,
      })
    );
  }
  const wanted = coerceLocationIds(locationIds);
  const ids = wanted
    ? (await prisma.location.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map((l) => l.id)
    : undefined;
  if (ids) {
    ops.push(prisma.physicianLocation.deleteMany({ where: { physicianId: params.id } }));
    ops.push(prisma.physicianLocation.createMany({ data: ids.map((locationId) => ({ physicianId: params.id, locationId })), skipDuplicates: true }));
  }
  ops.push(prisma.physician.update({ where: { id: params.id }, data: sanitize(fields) }));
  await prisma.$transaction(ops);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.physician.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
