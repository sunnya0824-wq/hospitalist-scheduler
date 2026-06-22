import { prisma } from "./prisma";
import { SEED_PHYSICIANS } from "./seed-data";
import { fromISODate } from "./scheduler/dates";

/** Remove every scheduling record. Used by the "Clear all data" action. */
export async function clearAllData(): Promise<void> {
  // Order matters because of FK constraints; cascade handles children but we
  // delete explicitly for clarity and to satisfy databases without cascade.
  await prisma.shiftAssignment.deleteMany();
  await prisma.scheduleGenerationRun.deleteMany();
  await prisma.scheduleMonth.deleteMany();
  await prisma.physicianAvailability.deleteMany();
  await prisma.physicianPreference.deleteMany();
  await prisma.physician.deleteMany();
}

/**
 * Seed the database with the 20 demo physicians. Wipes existing data first so
 * the action is idempotent. Returns the number of physicians created.
 */
export async function seedDatabase(): Promise<number> {
  await clearAllData();

  for (const p of SEED_PHYSICIANS) {
    const { unavailableDates = [], preferredDates = [], ...fields } = p;
    await prisma.physician.create({
      data: {
        ...fields,
        availability: {
          create: [
            ...unavailableDates.map((date) => ({
              date: fromISODate(date),
              type: "UNAVAILABLE" as const,
            })),
            ...preferredDates.map((date) => ({
              date: fromISODate(date),
              type: "PREFERRED" as const,
            })),
          ],
        },
      },
    });
  }

  return SEED_PHYSICIANS.length;
}
