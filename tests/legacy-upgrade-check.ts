/** Run by scripts/test-legacy-upgrade.sh after upgrading a legacy database. */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { generateSchedule, getMonthSchedule } from "../src/lib/schedule-service";
import { getConfig } from "../src/lib/config";

async function main() {
  const cfg = await getConfig();
  assert.deepEqual(cfg.locations.map((l) => l.name), ["Main Hospital", "Sparrow Carson", "Sparrow Eaton"]);
  const june = await getMonthSchedule(2026, 6);
  assert.equal(june.assignments.length, 4);
  assert.equal(june.assignments.find((a) => a.id === "a1")?.isLocked, true);
  assert.equal(june.assignments.find((a) => a.id === "a4")?.locationName, "Sparrow Carson");
  const p6 = await prisma.physicianLocation.findMany({ where: { physicianId: "p6" } });
  assert.equal(p6.length, 2);
  // July inherits June's counts (3 rounders, 1 admit, 2 nights at main, 1 Carson rounder).
  const r = await generateSchedule(2026, 7);
  assert.equal(r.assignments.length, 31 * 7);
  // Dr B ended a night block on June 30 → off July 1 and 2 (unless continuing nights on July 1).
  const b = r.assignments.filter((a) => a.physicianId === "p2" && (a.date === "2026-07-01" || a.date === "2026-07-02"));
  assert.ok(b.every((a) => a.category === "NIGHT" && a.date === "2026-07-01") || b.length === 0, JSON.stringify(b.map((x) => [x.date, x.category])));
  console.log(`legacy upgrade OK: ${r.assignments.filter((a) => a.physicianId).length}/${r.assignments.length} July slots filled`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
