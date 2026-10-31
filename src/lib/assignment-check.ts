/**
 * Validate a manual change (edit or swap) with the same rules the generator
 * uses, looking at the physician's other work around the date.
 */
import { prisma } from "./prisma";
import { loadSchedulerPhysicians } from "./schedule-service";
import { getRules } from "./config";
import { Ledger, checkAssignment, addDaysISO, fromISODate, toISODate, type ShiftCategory } from "./scheduler";

export interface SlotRef {
  id: string;
  date: string;
  endDate: string;
  category: ShiftCategory;
  locationId: string | null;
}

/**
 * For each proposed (physicianId → slot) pair, returns a reason it breaks a
 * rule, or null. `ignoreIds` are assignments being vacated by the change.
 */
export async function checkManualAssignments(
  proposals: { physicianId: string; slot: SlotRef }[],
  ignoreIds: string[]
): Promise<(string | null)[]> {
  if (proposals.length === 0) return [];
  const physicians = await loadSchedulerPhysicians();
  const byId = new Map(physicians.map((p) => [p.id, p]));
  const dates = proposals.map((p) => p.slot.date).sort();
  const windowStart = addDaysISO(dates[0], -40);
  const windowEnd = addDaysISO(dates[dates.length - 1], 40);
  const rules = await getRules(windowStart, windowEnd);
  const ids = [...new Set(proposals.map((p) => p.physicianId))];
  const others = await prisma.shiftAssignment.findMany({
    where: {
      physicianId: { in: ids },
      id: { notIn: ignoreIds },
      date: { gte: fromISODate(windowStart), lte: fromISODate(windowEnd) },
    },
    select: { physicianId: true, date: true, endDate: true, category: true },
  });
  const ledgers = new Map<string, Ledger>();
  for (const id of ids) ledgers.set(id, new Ledger());
  for (const o of others) {
    ledgers.get(o.physicianId!)?.add({ date: toISODate(o.date), endDate: toISODate(o.endDate), category: o.category }, rules);
  }
  return proposals.map(({ physicianId, slot }) => {
    const phys = byId.get(physicianId);
    if (!phys) return "physician not found";
    const why = checkAssignment(
      phys,
      { date: slot.date, endDate: slot.endDate, category: slot.category, locationId: slot.locationId },
      ledgers.get(physicianId)!,
      rules,
      { ignoreMaxShifts: true }
    );
    return why ? `${phys.fullName}: ${why}` : null;
  });
}
