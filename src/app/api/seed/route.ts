import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const count = await seedDatabase();
  return NextResponse.json({ ok: true, count });
}
