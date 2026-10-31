import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTemplate } from "@/lib/config-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = parseTemplate(await req.json().catch(() => ({})), false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const locationId = parsed.data.locationId as string;
  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  const max = await prisma.shiftTemplate.aggregate({ where: { locationId }, _max: { sortOrder: true } });
  const t = await prisma.shiftTemplate.create({
    data: { sortOrder: (max._max.sortOrder ?? -1) + 1, ...parsed.data } as Prisma.ShiftTemplateUncheckedCreateInput,
  });
  return NextResponse.json({ id: t.id }, { status: 201 });
}
