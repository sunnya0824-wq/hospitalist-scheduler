/**
 * End-to-end tests of the service layer against a real PostgreSQL database.
 * Requires DATABASE_URL pointing at a migrated, disposable database:
 *   npx prisma migrate deploy && npm run test:integration
 * Every test starts from a clean slate (all tables emptied).
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { seedDatabase, ensureStarterConfig } from "../src/lib/seed";
import { generateSchedule, getMonthSchedule } from "../src/lib/schedule-service";
import { getConfig, getHolidayMap } from "../src/lib/config";
import { checkManualAssignments } from "../src/lib/assignment-check";
import { buildScheduleTable } from "../src/lib/export";
import { toISODate } from "../src/lib/scheduler";

async function wipe() {
  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany(),
    prisma.scheduleGenerationRun.deleteMany(),
    prisma.scheduleMonth.deleteMany(),
    prisma.physician.deleteMany(),
    prisma.shiftTemplate.deleteMany(),
    prisma.location.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.settings.deleteMany(),
  ]);
}

beforeEach(wipe);
after(async () => {
  await prisma.$disconnect();
});

test("seed + generate + read back a month", async () => {
  const n = await seedDatabase();
  assert.equal(n, 20);
  const cfg = await getConfig();
  assert.equal(cfg.locations.length, 3);
  const result = await generateSchedule(2027, 3);
  assert.equal(result.assignments.length, 31 * 13);
  assert.ok(result.unfilledSlots.length <= 3);
  const month = await getMonthSchedule(2027, 3);
  assert.equal(month.assignments.length, 31 * 13);
  assert.equal(month.status, "GENERATED");
  assert.ok(month.assignments.every((a) => a.shiftName && a.locationName && a.shiftTemplateId));
  assert.ok(month.lastRun?.summary?.fairnessBreakdown);
  const table = buildScheduleTable(month);
  assert.equal(table.length, 32);
  assert.equal(table[0].length, 2 + 13 + 1);
});

test("regenerate keeps locked and manual slots", async () => {
  await seedDatabase();
  await generateSchedule(2027, 4);
  const first = await getMonthSchedule(2027, 4);
  const pick = first.assignments.find((a) => a.category === "ADMIT" && a.physicianId)!;
  const other = (await prisma.physician.findMany()).find((p) => p.id !== pick.physicianId && p.adminEligible)!;
  await prisma.shiftAssignment.update({ where: { id: pick.id }, data: { physicianId: other.id, isManual: true, isLocked: true } });
  await generateSchedule(2027, 4);
  const again = await getMonthSchedule(2027, 4);
  const kept = again.assignments.find((a) => a.date === pick.date && a.shiftTemplateId === pick.shiftTemplateId && a.slotIndex === pick.slotIndex)!;
  assert.equal(kept.physicianId, other.id);
  assert.equal(kept.isLocked, true);
});

test("monthly overrides change slot counts and persist", async () => {
  await seedDatabase();
  const cfg = await getConfig();
  const rounder = cfg.locations[0].templates.find((t) => t.code === "R")!;
  await generateSchedule(2027, 2, false, { [rounder.id]: 4 });
  const m = await getMonthSchedule(2027, 2);
  assert.equal(m.assignments.filter((a) => a.shiftTemplateId === rounder.id).length, 28 * 4);
  assert.equal(m.coverage.find((c) => c.templateId === rounder.id)?.override, 4);
  // Regenerate without overrides keeps them; {} clears them.
  await generateSchedule(2027, 2);
  assert.equal((await getMonthSchedule(2027, 2)).assignments.filter((a) => a.shiftTemplateId === rounder.id).length, 28 * 4);
  await generateSchedule(2027, 2, false, {});
  assert.equal((await getMonthSchedule(2027, 2)).assignments.filter((a) => a.shiftTemplateId === rounder.id).length, 28 * 10);
});

test("night block continues across the month boundary", async () => {
  await seedDatabase();
  await generateSchedule(2027, 5);
  await generateSchedule(2027, 6);
  const may = await getMonthSchedule(2027, 5);
  const june = await getMonthSchedule(2027, 6);
  const all = [...may.assignments, ...june.assignments].filter((a) => a.physicianId);
  const byPhys = new Map<string, Map<string, string>>();
  for (const a of all) {
    const m = byPhys.get(a.physicianId!) ?? new Map();
    m.set(a.date, a.category);
    byPhys.set(a.physicianId!, m);
  }
  const next = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return toISODate(d);
  };
  for (const [, days] of byPhys) {
    for (const [date, cat] of days) {
      if (cat !== "NIGHT" || days.get(next(date, 1)) === "NIGHT") continue;
      for (const k of [1, 2]) assert.ok(!days.has(next(date, k)), `works ${next(date, k)} during rest after ${date}`);
    }
  }
});

test("restricted locations, deleted templates and history", async () => {
  await seedDatabase();
  const cfg = await getConfig();
  const north = cfg.locations.find((l) => l.code === "NORTH")!;
  await prisma.shiftTemplate.update({ where: { id: north.templates[0].id }, data: { dailyCounts: [1, 1, 1, 1, 1, 1, 1] } });
  await generateSchedule(2027, 7);
  const july = await getMonthSchedule(2027, 7);
  const northIds = new Set((await prisma.physicianLocation.findMany({ where: { locationId: north.id } })).map((x) => x.physicianId));
  const northSlots = july.assignments.filter((a) => a.locationId === north.id && a.physicianId);
  assert.ok(northSlots.length > 0);
  assert.ok(northSlots.every((a) => northIds.has(a.physicianId!)));
  // Delete the location: past month still reads with snapshot names.
  await prisma.location.delete({ where: { id: north.id } });
  const after = await getMonthSchedule(2027, 7);
  const orphan = after.assignments.filter((a) => a.locationName === "North Campus");
  assert.equal(orphan.length, northSlots.length + july.assignments.filter((a) => a.locationId === north.id && !a.physicianId).length);
  assert.ok(orphan.every((a) => a.locationId === null && a.shiftTemplateId === null));
  assert.ok(buildScheduleTable(after)[0].some((h) => h.includes("NORTH")));
});

test("manual checks reject a day shift the morning after a night", async () => {
  await seedDatabase();
  await generateSchedule(2027, 8);
  const m = await getMonthSchedule(2027, 8);
  const night = m.assignments.find(
    (a) =>
      a.category === "NIGHT" &&
      a.physicianId &&
      a.date < "2027-08-25" &&
      !m.assignments.some((x) => x.physicianId === a.physicianId && x.date === a.endDate)
  )!;
  const dayAfter = m.assignments.find((a) => a.date === night.endDate && a.category === "DAY")!;
  const [why] = await checkManualAssignments(
    [{ physicianId: night.physicianId!, slot: { id: dayAfter.id, date: dayAfter.date, endDate: dayAfter.endDate, category: "DAY", locationId: dayAfter.locationId } }],
    [dayAfter.id]
  );
  assert.ok(why && /overnight|rest/.test(why), String(why));
});

test("custom and recurring holidays reach the month view", async () => {
  await ensureStarterConfig();
  await prisma.holiday.create({ data: { date: new Date("2000-12-24T00:00:00Z"), name: "Christmas Eve", recurring: true } });
  await prisma.settings.upsert({ where: { id: 1 }, update: { disabledHolidays: ["CHRISTMAS"] }, create: { id: 1, disabledHolidays: ["CHRISTMAS"] } });
  const h = await getHolidayMap("2061-12-01", "2061-12-31");
  assert.equal(h["2061-12-24"], "Christmas Eve");
  assert.equal(h["2061-12-25"], undefined);
  const m = await getMonthSchedule(2061, 12);
  assert.equal(m.holidays["2061-12-24"], "Christmas Eve");
});

test("empty install: no shift types → empty schedule, no crash", async () => {
  const r = await generateSchedule(2030, 1);
  assert.equal(r.assignments.length, 0);
  const m = await getMonthSchedule(2030, 1);
  assert.equal(m.coverage.length, 0);
});
