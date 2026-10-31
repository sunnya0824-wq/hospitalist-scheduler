import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTemplate } from "@/lib/config-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const parsed = parseTemplate(await req.json().catch(() => ({})), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const updated = await prisma.shiftTemplate.update({ where: { id: params.id }, data: parsed.data }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Shift type not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Past schedules keep their assignments (snapshot of name, times, location). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.shiftTemplate.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
