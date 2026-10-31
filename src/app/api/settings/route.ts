import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, settingsToDTO } from "@/lib/config";
import { parseSettings } from "@/lib/config-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(settingsToDTO(await getSettings()));
}

export async function PUT(req: Request) {
  const parsed = parseSettings(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await getSettings();
  const s = await prisma.settings.update({ where: { id: 1 }, data: parsed.data });
  return NextResponse.json(settingsToDTO(s));
}
