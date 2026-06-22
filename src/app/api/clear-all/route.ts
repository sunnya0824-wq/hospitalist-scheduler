import { NextResponse } from "next/server";
import { clearAllData } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  await clearAllData();
  return NextResponse.json({ ok: true });
}
