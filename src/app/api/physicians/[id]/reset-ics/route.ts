import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Rotate a physician's ICS token, invalidating any previously shared URL. */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const updated = await prisma.physician.update({
    where: { id: params.id },
    data: { icsToken: `ics_${randomUUID()}` },
    select: { icsToken: true },
  });
  return NextResponse.json({ icsToken: updated.icsToken });
}
