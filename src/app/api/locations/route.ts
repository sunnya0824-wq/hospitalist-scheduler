import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLocations } from "@/lib/config";
import { parseLocation } from "@/lib/config-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getLocations());
}

export async function POST(req: Request) {
  const parsed = parseLocation(await req.json().catch(() => ({})), false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const dup = await prisma.location.findUnique({ where: { name: parsed.data.name as string } });
  if (dup) return NextResponse.json({ error: "A location with that name already exists" }, { status: 400 });
  const max = await prisma.location.aggregate({ _max: { sortOrder: true } });
  const loc = await prisma.location.create({
    data: { sortOrder: (max._max.sortOrder ?? -1) + 1, ...parsed.data } as Prisma.LocationCreateInput,
  });
  return NextResponse.json({ id: loc.id }, { status: 201 });
}
