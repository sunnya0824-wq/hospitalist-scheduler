import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseLocation } from "@/lib/config-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const parsed = parseLocation(await req.json().catch(() => ({})), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (typeof parsed.data.name === "string") {
    const dup = await prisma.location.findUnique({ where: { name: parsed.data.name } });
    if (dup && dup.id !== params.id) {
      return NextResponse.json({ error: "A location with that name already exists" }, { status: 400 });
    }
  }
  const updated = await prisma.location.update({ where: { id: params.id }, data: parsed.data }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * Deletes the location and its shift templates. Past schedules keep their
 * assignments (they store a snapshot of the location and shift names).
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.location.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
