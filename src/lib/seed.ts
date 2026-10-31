import { prisma } from "./prisma";
import { SEED_PHYSICIANS, DEMO_LOCATIONS } from "./seed-data";
import { fromISODate } from "./scheduler/dates";

/**
 * Remove every schedule and physician. Organization configuration
 * (settings, locations, shift templates, holidays) is kept.
 */
export async function clearAllData(): Promise<void> {
  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany(),
    prisma.scheduleGenerationRun.deleteMany(),
    prisma.scheduleMonth.deleteMany(),
    prisma.physicianAvailability.deleteMany(),
    prisma.physicianPreference.deleteMany(),
    prisma.timeOffRequest.deleteMany(),
    prisma.physicianLocation.deleteMany(),
    prisma.physician.deleteMany(),
  ]);
}

/** Create the demo locations and shift templates when none exist yet. */
export async function ensureStarterConfig(): Promise<void> {
  const count = await prisma.location.count();
  if (count > 0) return;
  for (const [i, loc] of DEMO_LOCATIONS.entries()) {
    await prisma.location.create({
      data: {
        name: loc.name,
        code: loc.code,
        sortOrder: i,
        openToAll: loc.openToAll,
        shiftTemplates: {
          create: loc.templates.map((t, j) => ({
            name: t.name,
            code: t.code,
            category: t.category,
            startTime: t.startTime,
            endTime: t.endTime,
            dailyCounts: t.dailyCounts,
            holidayCount: t.holidayCount ?? null,
            color: t.color,
            sortOrder: j,
          })),
        },
      },
    });
  }
}

/**
 * Replace all physicians and schedules with the 20 demo physicians. Demo
 * physicians are linked to restricted locations whose code matches. Returns
 * the number of physicians created.
 */
export async function seedDatabase(): Promise<number> {
  await clearAllData();
  await ensureStarterConfig();
  const locations = await prisma.location.findMany({ select: { id: true, code: true } });
  const byCode = new Map(locations.map((l) => [l.code.toUpperCase(), l.id]));

  for (const p of SEED_PHYSICIANS) {
    const { unavailableDates = [], preferredDates = [], locationCodes = [], ...fields } = p;
    const locationIds = locationCodes.map((c) => byCode.get(c.toUpperCase())).filter((x): x is string => Boolean(x));
    await prisma.physician.create({
      data: {
        ...fields,
        availability: {
          create: [
            ...unavailableDates.map((date) => ({ date: fromISODate(date), type: "UNAVAILABLE" as const })),
            ...preferredDates.map((date) => ({ date: fromISODate(date), type: "PREFERRED" as const })),
          ],
        },
        locations: { create: locationIds.map((locationId) => ({ locationId })) },
      },
    });
  }
  return SEED_PHYSICIANS.length;
}
