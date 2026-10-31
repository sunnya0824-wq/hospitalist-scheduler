import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runScheduler,
  generateSlots,
  holidaysInRange,
  nthWeekday,
  observedDate,
  checkAssignment,
  Ledger,
  resolveRules,
  countFor,
  monthDates,
  type AssignmentResult,
} from "../src/lib/scheduler";
import { demoPhysicians, demoTemplates, validateSchedule, nightBlocks } from "./helpers";

const NOV = () => generateSlots(2026, 11, demoTemplates());

test("default month: every hard rule holds and coverage is near complete", () => {
  const phys = demoPhysicians();
  const r = runScheduler(phys, NOV());
  assert.deepEqual(validateSchedule(phys, r.assignments), []);
  assert.equal(r.assignments.length, 30 * 13);
  assert.ok(r.unfilledSlots.length <= 3, `gaps: ${r.unfilledSlots.length}`);
});

test("nights come in blocks, back to back, never over the cap", () => {
  const phys = demoPhysicians();
  const r = runScheduler(phys, NOV());
  const blocks = nightBlocks(r.assignments);
  const all = [...blocks.values()].flat();
  assert.ok(all.some((b) => b >= 2), "expected at least one multi-night block");
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(avg >= 2.5, `average block length too short: ${avg.toFixed(2)}`);
  for (const p of phys) {
    for (const b of blocks.get(p.id) ?? []) assert.ok(b <= p.maxConsecutiveNights);
  }
});

test("nocturnists can now reach their workload (was capped at ~15)", () => {
  const phys = demoPhysicians();
  const r = runScheduler(phys, NOV());
  const noct = r.stats.filter((s) => s.desiredShifts === 24);
  assert.equal(noct.length, 3);
  for (const s of noct) assert.ok(s.total >= 19, `${s.fullName} only got ${s.total}`);
});

test("fairness score reflects a fair schedule", () => {
  const r = runScheduler(demoPhysicians(), NOV());
  assert.ok(r.fairnessScore >= 70, `fairness ${r.fairnessScore} ${JSON.stringify(r.fairnessBreakdown)}`);
  assert.ok(r.fairnessBreakdown.workload >= 75);
});

test("configurable rest days and night caps are enforced", () => {
  for (const restDays of [0, 1, 3]) {
    for (const cap of [1, 3, 7]) {
      const phys = demoPhysicians(() => ({ maxConsecutiveNights: cap }));
      const r = runScheduler(phys, NOV(), { rules: { restDaysAfterNights: restDays, preferredNightBlock: 4 } });
      assert.deepEqual(validateSchedule(phys, r.assignments, { restDays }), [], `rest=${restDays} cap=${cap}`);
    }
  }
});

test("time off, unavailability, locks, inactive physicians", () => {
  const phys = demoPhysicians((p, i) =>
    i === 0 ? { timeOffDates: new Set(["2026-11-10", "2026-11-11", "2026-11-12"]) } : i === 4 ? { active: false } : {}
  );
  const slots = NOV();
  const idx = slots.findIndex((s) => s.date === "2026-11-05" && s.category === "ADMIT");
  slots[idx] = { ...slots[idx], physicianId: "p2", isLocked: true };
  const r = runScheduler(phys, slots);
  assert.deepEqual(validateSchedule(phys, r.assignments), []);
  const locked = r.assignments.find((a) => a.date === "2026-11-05" && a.category === "ADMIT")!;
  assert.equal(locked.physicianId, "p2");
  assert.equal(r.stats.find((s) => s.physicianId === "p4"), undefined);
});

test("a locked slot that breaks a rule is kept and flagged", () => {
  const phys = demoPhysicians();
  const slots = NOV();
  const n = slots.findIndex((s) => s.date === "2026-11-05" && s.category === "NIGHT");
  const d = slots.findIndex((s) => s.date === "2026-11-06" && s.category === "DAY");
  slots[n] = { ...slots[n], physicianId: "p0", isLocked: true };
  slots[d] = { ...slots[d], physicianId: "p0", isLocked: true };
  const r = runScheduler(phys, slots);
  const kept = r.assignments.find((a) => a.date === "2026-11-06" && a.physicianId === "p0")!;
  assert.ok(kept.warnings.length > 0);
  assert.ok(r.warnings.some((w) => w.includes("kept because it is locked")));
});

test("night block from the previous month carries over", () => {
  const phys = demoPhysicians();
  const prior = [
    { physicianId: "p13", date: "2026-10-30", endDate: "2026-10-31", category: "NIGHT" as const },
    { physicianId: "p13", date: "2026-10-31", endDate: "2026-11-01", category: "NIGHT" as const },
  ];
  const r = runScheduler(phys, NOV(), { priorShifts: prior });
  assert.deepEqual(validateSchedule(phys, r.assignments, { prior }), []);
  const nov1 = r.assignments.filter((a) => a.physicianId === "p13" && a.date === "2026-11-01");
  // Nov 1 may only be a continuation night, never a day shift.
  for (const a of nov1) assert.equal(a.category, "NIGHT");
});

test("per-weekday counts, holiday counts and monthly overrides", () => {
  const t = demoTemplates({ "MAIN:R": [6, 10, 10, 10, 10, 10, 6] });
  t[0].holidayCount = 4;
  const holidays = new Set(["2026-11-26"]);
  assert.equal(countFor(t[0], "2026-11-01", holidays), 6); // Sunday
  assert.equal(countFor(t[0], "2026-11-02", holidays), 10); // Monday
  assert.equal(countFor(t[0], "2026-11-26", holidays), 4); // Thanksgiving
  assert.equal(countFor(t[0], "2026-11-26", holidays, { "MAIN:R": 8 }), 8);
  const slots = generateSlots(2026, 11, t, holidays);
  assert.equal(slots.filter((s) => s.date === "2026-11-26" && s.shiftTemplateId === "MAIN:R").length, 4);
});

test("restricted locations only get eligible physicians", () => {
  const t = demoTemplates({ "NORTH:R": [2, 2, 2, 2, 2, 2, 2], "SOUTH:R": [1, 1, 1, 1, 1, 1, 1] });
  const phys = demoPhysicians();
  const r = runScheduler(phys, generateSlots(2026, 11, t));
  assert.deepEqual(validateSchedule(phys, r.assignments), []);
  assert.ok(r.assignments.some((a) => a.locationId === "NORTH" && a.physicianId));
});

test("custom weekend days (Fri/Sat) drive weekend fairness", () => {
  const phys = demoPhysicians();
  const r = runScheduler(phys, NOV(), { rules: { weekendDays: new Set([5, 6]) } });
  assert.deepEqual(validateSchedule(phys, r.assignments), []);
  const total = r.stats.reduce((a, s) => a + s.weekends, 0);
  const friSat = r.assignments.filter((a) => a.physicianId && [5, 6].includes(new Date(a.date + "T00:00:00Z").getUTCDay())).length;
  assert.equal(total, friSat);
});

test("24-hour shift counts as overnight and blocks the next morning", () => {
  const t = demoTemplates();
  t.push({ ...t[0], id: "MAIN:CALL", name: "24h Call", code: "C", category: "DAY", startTime: "08:00", endTime: "08:00", dailyCounts: [1, 1, 1, 1, 1, 1, 1], sortOrder: 9 });
  const phys = demoPhysicians();
  const r = runScheduler(phys, generateSlots(2026, 11, t));
  assert.deepEqual(validateSchedule(phys, r.assignments), []);
  assert.ok(r.assignments.filter((a) => a.shiftTemplateId === "MAIN:CALL").every((a) => a.endDate > a.date));
});

test("understaffed and empty rosters degrade gracefully", () => {
  const few = demoPhysicians().slice(0, 6);
  const r = runScheduler(few, NOV());
  assert.deepEqual(validateSchedule(few, r.assignments), []);
  assert.ok(r.unfilledSlots.length > 0);
  const none = runScheduler([], NOV());
  assert.equal(none.unfilledSlots.length, 390);
  assert.equal(runScheduler(demoPhysicians(), []).assignments.length, 0);
});

test("allowOverMax fills more but stays within every other rule", () => {
  const t = demoTemplates({ "NORTH:R": [3, 3, 3, 3, 3, 3, 3] });
  const phys = demoPhysicians();
  const strict = runScheduler(phys, generateSlots(2026, 12, t));
  const over = runScheduler(phys, generateSlots(2026, 12, t), { allowOverMax: true });
  assert.ok(over.unfilledSlots.length <= strict.unfilledSlots.length);
  assert.deepEqual(validateSchedule(phys, over.assignments, { allowOverMax: true }), []);
});

test("deterministic output", () => {
  const a = runScheduler(demoPhysicians(), NOV()).assignments.map((x) => x.physicianId);
  const b = runScheduler(demoPhysicians(), NOV()).assignments.map((x) => x.physicianId);
  assert.deepEqual(a, b);
});

test("checkAssignment handles out-of-order manual edits", () => {
  const [p] = demoPhysicians();
  const rules = resolveRules({}, []);
  const led = new Ledger();
  led.add({ date: "2026-11-10", endDate: "2026-11-11", category: "NIGHT" }, rules);
  const night = (date: string) => ({ date, endDate: date.slice(0, 8) + String(Number(date.slice(8)) + 1).padStart(2, "0"), category: "NIGHT" as const, locationId: "MAIN" });
  const day = (date: string) => ({ date, endDate: date, category: "DAY" as const, locationId: "MAIN" });
  assert.equal(checkAssignment(p, night("2026-11-09"), led, rules), null); // block before
  assert.equal(checkAssignment(p, night("2026-11-11"), led, rules), null); // block after
  assert.ok(checkAssignment(p, day("2026-11-11"), led, rules)); // morning after night
  assert.ok(checkAssignment(p, day("2026-11-12"), led, rules)); // rest day
  assert.equal(checkAssignment(p, day("2026-11-13"), led, rules), null); // rest done
  assert.ok(checkAssignment(p, night("2026-11-12"), led, rules)); // one-day gap
  assert.ok(checkAssignment(p, night("2026-11-08"), led, rules)); // rest would hit the 10th
  assert.equal(checkAssignment(p, day("2026-11-09"), led, rules), null); // day before a night
});

// --- Holidays: computed for any year ------------------------------------

test("holidays match the old hard-coded 2026 list", () => {
  const h = holidaysInRange("2026-01-01", "2026-12-31");
  for (const iso of [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03",
    "2026-07-04", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
  ]) assert.ok(h.has(iso), `missing ${iso}`);
  assert.equal(h.size, 12);
});

test("holiday rules: nth weekdays, observed dates, disabling, custom", () => {
  assert.equal(nthWeekday(2050, 11, 4, 4), "2050-11-24"); // Thanksgiving 2050
  assert.equal(nthWeekday(2076, 5, 1, -1), "2076-05-25"); // Memorial Day 2076
  assert.equal(observedDate("2028-01-01"), "2027-12-31"); // Saturday → Friday
  assert.equal(observedDate("2033-12-25"), "2033-12-26"); // Sunday → Monday
  const h = holidaysInRange("2027-12-01", "2027-12-31");
  assert.ok(h.get("2027-12-31")?.includes("observed"));
  const off = holidaysInRange("2030-01-01", "2030-12-31", {
    observeUSFederalHolidays: true,
    includeObservedHolidays: false,
    disabledHolidays: ["COLUMBUS"],
    custom: [
      { date: "2000-12-24", name: "Christmas Eve", recurring: true },
      { date: "2000-02-29", name: "Leap Day", recurring: true },
      { date: "2030-03-17", name: "One-off", recurring: false },
    ],
  });
  assert.ok(!off.has(nthWeekday(2030, 10, 1, 2)));
  assert.equal(off.get("2030-12-24"), "Christmas Eve");
  assert.ok(off.has("2030-03-17"));
  assert.ok(!off.has("2030-02-28") && !off.has("2030-03-01"));
  assert.ok(holidaysInRange("2032-01-01", "2032-12-31", { observeUSFederalHolidays: false, includeObservedHolidays: false, disabledHolidays: [], custom: [{ date: "2000-02-29", name: "Leap Day", recurring: true }] }).has("2032-02-29"));
});

test("every year 2026–2076 has all 11 federal holidays", () => {
  for (let y = 2026; y <= 2076; y++) {
    const h = holidaysInRange(`${y}-01-01`, `${y}-12-31`, { observeUSFederalHolidays: true, includeObservedHolidays: false, disabledHolidays: [], custom: [] });
    assert.equal(h.size, 11, `${y}: ${[...h.keys()]}`);
  }
});

// --- 50-year sweep ---------------------------------------------------------

test("schedules every month from 2026 through 2076 without breaking a rule", () => {
  const phys = demoPhysicians();
  const t = demoTemplates({ "NORTH:R": [1, 1, 1, 1, 1, 1, 1] });
  let months = 0;
  let prior: AssignmentResult[] = [];
  for (let y = 2026; y <= 2076; y++) {
    for (let m = 1; m <= 12; m++) {
      const dates = monthDates(y, m);
      const holidays = new Set(holidaysInRange(dates[0], dates[dates.length - 1]).keys());
      const priorShifts = prior
        .filter((a) => a.physicianId && a.date > addDaysLocal(dates[0], -14))
        .map((a) => ({ physicianId: a.physicianId!, date: a.date, endDate: a.endDate, category: a.category }));
      const r = runScheduler(phys, generateSlots(y, m, t, holidays), { priorShifts, rules: { holidays } });
      const errs = validateSchedule(phys, r.assignments, { prior: priorShifts });
      assert.deepEqual(errs, [], `${y}-${m}`);
      assert.equal(r.assignments.length, dates.length * 14);
      prior = r.assignments;
      months++;
    }
  }
  assert.equal(months, 612);
});

function addDaysLocal(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
