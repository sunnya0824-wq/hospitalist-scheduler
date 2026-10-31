import { NextResponse } from "next/server";
import { generateSchedule } from "@/lib/schedule-service";
import type { GenerateResultDTO } from "@/lib/api-types";
import { asObject } from "@/lib/config-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Body: { year, month, allowOverMax?, coverageOverrides? }
 * coverageOverrides = { [shiftTemplateId]: slotsPerDay } replaces the month's
 * saved overrides (send {} to go back to template defaults).
 */
export async function POST(req: Request) {
  const body = asObject(await req.json().catch(() => ({})));
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Valid year and month (1-12) are required." }, { status: 400 });
  }
  if (body.coverageOverrides !== undefined && (body.coverageOverrides === null || typeof body.coverageOverrides !== "object" || Array.isArray(body.coverageOverrides))) {
    return NextResponse.json({ error: "coverageOverrides must be an object of { shiftTypeId: slotsPerDay }" }, { status: 400 });
  }
  const overrides = body.coverageOverrides as Record<string, number> | undefined;
  const result = await generateSchedule(year, month, Boolean(body.allowOverMax), overrides);
  const dto: GenerateResultDTO = {
    warnings: result.warnings,
    fairnessScore: result.fairnessScore,
    fairnessBreakdown: result.fairnessBreakdown,
    unfilledSlots: result.unfilledSlots,
  };
  return NextResponse.json(dto);
}
