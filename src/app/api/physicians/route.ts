import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromISODate, toISODate } from "@/lib/scheduler/dates";
import { sanitize } from "@/lib/physician-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const physicians = await prisma.physician.findMany({
    include: { availability: true },
    orderBy: { fullName: "asc" },
  });
  const shaped = physicians.map((p) => ({
    ...p,
    unavailableDates: p.availability
      .filter((a) => a.type === "UNAVAILABLE")
      .map((a) => toISODate(a.date)),
    preferredDates: p.availability
      .filter((a) => a.type === "PREFERRED")
      .map((a) => toISODate(a.date)),
  }));
  return NextResponse.json(shaped);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { unavailableDates = [], preferredDates = [], ...fields } = body;
  const physician = await prisma.physician.create({
    data: {
      ...sanitize(fields),
      availability: {
        create: buildAvailability(unavailableDates, preferredDates),
      },
    } as Prisma.PhysicianCreateInput,
    include: { availability: true },
  });
  return NextResponse.json(physician, { status: 201 });
}

function buildAvailability(unavailable: string[], preferred: string[]) {
  return [
    ...unavailable.map((date: string) => ({
      date: fromISODate(date),
      type: "UNAVAILABLE" as const,
    })),
    ...preferred.map((date: string) => ({
      date: fromISODate(date),
      type: "PREFERRED" as const,
    })),
  ];
}
