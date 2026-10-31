import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromISODate, toISODate } from "@/lib/scheduler/dates";
import { sanitize, validatePreferences, validateNumbers, coerceLocationIds } from "@/lib/physician-utils";
import type { PhysicianDTO } from "@/lib/api-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const physicians = await prisma.physician.findMany({
    include: { availability: true, timeOffRequests: true, locations: true },
    orderBy: { fullName: "asc" },
  });
  const shaped: PhysicianDTO[] = physicians.map(({ availability, timeOffRequests, locations, ...p }) => ({
    ...p,
    avoidWeekdays: (p.avoidWeekdays ?? {}) as Record<string, boolean>,
    fteMultiplier: Number(p.fteMultiplier),
    locationIds: locations.map((l) => l.locationId),
    unavailableDates: availability.filter((a) => a.type === "UNAVAILABLE").map((a) => toISODate(a.date)),
    preferredDates: availability.filter((a) => a.type === "PREFERRED").map((a) => toISODate(a.date)),
    timeOffDates: timeOffRequests.map((t) => toISODate(t.date)),
  }));
  return NextResponse.json(shaped);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { unavailableDates = [], preferredDates = [], locationIds, ...fields } = body;
  if (!fields.fullName || typeof fields.fullName !== "string" || !fields.fullName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const error = validatePreferences(fields) ?? validateNumbers(fields);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const wanted = coerceLocationIds(locationIds) ?? [];
  const ids = wanted.length
    ? (await prisma.location.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map((l) => l.id)
    : [];
  const physician = await prisma.physician.create({
    data: {
      ...sanitize(fields),
      availability: { create: buildAvailability(unavailableDates, preferredDates) },
      locations: { create: ids.map((locationId) => ({ locationId })) },
    } as Prisma.PhysicianCreateInput,
  });
  return NextResponse.json({ id: physician.id }, { status: 201 });
}

function buildAvailability(unavailable: string[], preferred: string[]) {
  return [
    ...unavailable.map((date: string) => ({ date: fromISODate(date), type: "UNAVAILABLE" as const })),
    ...preferred.map((date: string) => ({ date: fromISODate(date), type: "PREFERRED" as const })),
  ];
}
