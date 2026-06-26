import type {
  AssignmentResult,
  PhysicianStats,
  SchedulerOptions,
  SchedulerPhysician,
  SchedulerResult,
  ShiftSlot,
} from "./types";
import { addDaysISO, isWeekend } from "./dates";
import { SHIFT_LABELS, isNightType } from "./shifts";

/**
 * Mutable per-physician tally maintained while the greedy assignment runs.
 * Used by both the hard-constraint checks and the soft scoring function.
 */
interface Tally {
  total: number;
  rounding: number;
  admin: number;
  nights: number;
  weekends: number;
  /** ISO dates the physician is already working (any shift). */
  workingDates: Set<string>;
  /** ISO dates the physician must rest (day after a night shift). */
  restDates: Set<string>;
}

function emptyTally(): Tally {
  return {
    total: 0,
    rounding: 0,
    admin: 0,
    nights: 0,
    weekends: 0,
    workingDates: new Set(),
    restDates: new Set(),
  };
}

/**
 * Hard constraints. Returns a reason string when the physician CANNOT take
 * the slot, or null when the assignment is permissible.
 */
function hardConstraintViolation(
  phys: SchedulerPhysician,
  slot: ShiftSlot,
  tally: Tally,
  opts: SchedulerOptions
): string | null {
  // No double-booking on the same calendar day.
  if (tally.workingDates.has(slot.date)) {
    return "already working that day";
  }
  // No day shift the day after a night shift (rest day).
  if (tally.restDates.has(slot.date)) {
    return "resting after a night shift";
  }
  // A night shift's end date must not collide with existing work.
  if (tally.workingDates.has(slot.endDate)) {
    return "next-day conflict for overnight shift";
  }
  // Respect explicit unavailable dates.
  if (phys.unavailableDates.has(slot.date)) {
    return "unavailable on that date";
  }
  // Eligibility for specialised shifts.
  if (isNightType(slot.shiftType) && !phys.nightEligible) {
    return "not night eligible";
  }
  if (slot.shiftType === "ADMIN" && !phys.adminEligible) {
    return "not admin eligible";
  }
  // Community-hospital eligibility (MAIN is implicit for all active physicians).
  if (slot.hospital !== "MAIN" && !phys.eligibleHospitals.has(slot.hospital)) {
    return "not eligible for this hospital";
  }
  // Respect the hard cap unless the run overrides it.
  if (!opts.allowOverMax && tally.total >= phys.maxShifts) {
    return "at max shifts";
  }
  return null;
}

/**
 * Soft scoring. Higher score = better fit. The greedy loop assigns each slot
 * to the eligible physician with the highest score. The weights below encode
 * the spec's fairness goals; tweak them to bias the schedule.
 */
function score(
  phys: SchedulerPhysician,
  slot: ShiftSlot,
  tally: Tally,
  avgNights: number,
  avgWeekends: number
): number {
  let s = 0;

  // --- Workload targeting --------------------------------------------------
  // Strong boost while below the contractual minimum so everyone gets work.
  if (tally.total < phys.minShifts) {
    s += 1000 + (phys.minShifts - tally.total) * 40;
  }
  // Penalise going above the soft max (only reachable with allowOverMax).
  if (tally.total >= phys.maxShifts) {
    s -= 600;
  }
  // Pull toward the desired number of shifts; penalty grows with distance.
  const distanceToDesired = phys.desiredShifts - tally.total;
  s += distanceToDesired * 25;

  // --- Category targeting --------------------------------------------------
  if (isNightType(slot.shiftType)) {
    if (tally.nights < phys.minNights) s += 200;
    if (tally.nights >= phys.maxNights) s -= 500;
  }
  if (slot.shiftType === "ADMIN") {
    if (tally.admin < phys.minAdmin) s += 150;
    if (tally.admin >= phys.maxAdmin) s -= 400;
  }
  if (slot.shiftType === "ROUNDER") {
    if (tally.rounding < phys.minRounding) s += 80;
    if (tally.rounding >= phys.maxRounding) s -= 300;
  }

  // --- Fairness ------------------------------------------------------------
  // Night fairness: discourage piling nights on someone already above avg.
  if (isNightType(slot.shiftType)) {
    s -= (tally.nights - avgNights) * 30;
  }
  // Weekend fairness.
  if (isWeekend(slot.date)) {
    s -= (tally.weekends - avgWeekends) * 25;
  }

  // --- Preferences ---------------------------------------------------------
  if (phys.preferredDates.has(slot.date)) {
    s += 120;
  }
  if (phys.shiftPreference === "MORE") s += 30;
  if (phys.shiftPreference === "FEWER") s -= 30;

  // --- Rest / consecutive days --------------------------------------------
  // Bonus when a night lands such that the prior day was free (well rested).
  if (isNightType(slot.shiftType) && !tally.workingDates.has(addDaysISO(slot.date, -1))) {
    s += 15;
  }
  // Penalise long runs of consecutive working days (>5 in a row).
  s -= consecutiveRunLength(tally, slot.date) > 5 ? 200 : 0;

  return s;
}

/** Length of the consecutive working streak ending the day before `date`. */
function consecutiveRunLength(tally: Tally, date: string): number {
  let run = 0;
  let cursor = addDaysISO(date, -1);
  while (tally.workingDates.has(cursor)) {
    run += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return run + 1; // include the candidate day itself
}

/** Apply an assignment to a physician's running tally. */
function applyAssignment(tally: Tally, slot: ShiftSlot): void {
  tally.total += 1;
  tally.workingDates.add(slot.date);
  if (isWeekend(slot.date)) tally.weekends += 1;
  if (slot.shiftType === "ROUNDER") tally.rounding += 1;
  else if (slot.shiftType === "ADMIN") tally.admin += 1;
  else if (isNightType(slot.shiftType)) {
    tally.nights += 1;
    // The night ends the next morning, so the end date is blocked and the
    // following calendar day is a rest day (no day shift allowed).
    tally.workingDates.add(slot.endDate);
    tally.restDates.add(slot.endDate);
  }
}

/**
 * Order slots so the most constrained shift types are filled first. The main
 * hospital is fully scheduled (nights → admin → rounders) before community
 * hospital rounders, so a physician's main-hospital duty takes precedence.
 */
function slotPriority(slot: ShiftSlot): number {
  if (slot.hospital !== "MAIN") return 3; // community rounders last
  if (isNightType(slot.shiftType)) return 0;
  if (slot.shiftType === "ADMIN") return 1;
  return 2; // main ROUNDER
}

/**
 * Core scheduling routine. Greedy + scoring:
 *   1. Seed tallies with any pre-assigned (locked/manual) slots.
 *   2. Walk the remaining empty slots in priority order (nights → admin →
 *      rounders, then chronologically) and assign each to the best-scoring
 *      eligible physician.
 *   3. Slots with no eligible physician are left empty and recorded as
 *      coverage gaps in the warnings list.
 */
export function runScheduler(
  physicians: SchedulerPhysician[],
  slots: ShiftSlot[],
  opts: SchedulerOptions = {}
): SchedulerResult {
  const active = physicians.filter((p) => p.active);
  const tallies = new Map<string, Tally>();
  for (const p of active) tallies.set(p.id, emptyTally());

  const warnings: string[] = [];
  const results: AssignmentResult[] = [];

  // Step 1: lock in pre-assigned slots so they count toward fairness/limits.
  const preassigned = slots.filter((s) => s.physicianId);
  for (const slot of preassigned) {
    const tally = tallies.get(slot.physicianId!);
    if (tally) applyAssignment(tally, slot);
    results.push({
      ...slot,
      isAutoGenerated: false,
      warnings: [],
    });
  }

  // Step 2: order the open slots — most constrained first, then by date.
  const open = slots
    .filter((s) => !s.physicianId)
    .sort((a, b) => {
      const pa = slotPriority(a);
      const pb = slotPriority(b);
      if (pa !== pb) return pa - pb;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.rounderIndex ?? 0) - (b.rounderIndex ?? 0);
    });

  for (const slot of open) {
    const avgNights = average(active.map((p) => tallies.get(p.id)!.nights));
    const avgWeekends = average(active.map((p) => tallies.get(p.id)!.weekends));

    let best: { phys: SchedulerPhysician; score: number } | null = null;
    for (const phys of active) {
      const tally = tallies.get(phys.id)!;
      if (hardConstraintViolation(phys, slot, tally, opts)) continue;
      const sc = score(phys, slot, tally, avgNights, avgWeekends);
      if (!best || sc > best.score) best = { phys, score: sc };
    }

    if (!best) {
      const gap = `Coverage gap: ${SHIFT_LABELS[slot.shiftType]}${
        slot.rounderIndex ? ` ${slot.rounderIndex}` : ""
      } on ${slot.date} — no eligible physician`;
      warnings.push(gap);
      results.push({
        ...slot,
        physicianId: null,
        isAutoGenerated: true,
        warnings: [gap],
      });
      continue;
    }

    const tally = tallies.get(best.phys.id)!;
    applyAssignment(tally, slot);
    results.push({
      ...slot,
      physicianId: best.phys.id,
      isAutoGenerated: true,
      warnings: [],
    });
  }

  // Step 3: build per-physician stats and constraint warnings.
  const stats = buildStats(active, tallies, warnings);
  const fairnessScore = computeFairness(stats);

  // Restore deterministic ordering for storage/display (by date then slot).
  results.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const pa = slotPriority(a);
    const pb = slotPriority(b);
    if (pa !== pb) return pb - pa; // rounders before admin/nights in display
    return (a.rounderIndex ?? 0) - (b.rounderIndex ?? 0);
  });

  return { assignments: results, warnings, stats, fairnessScore };
}

function buildStats(
  active: SchedulerPhysician[],
  tallies: Map<string, Tally>,
  warnings: string[]
): PhysicianStats[] {
  return active.map((p) => {
    const t = tallies.get(p.id)!;
    const belowMin = t.total < p.minShifts;
    const aboveMax = t.total > p.maxShifts;
    if (belowMin) {
      warnings.push(
        `${p.fullName} has ${t.total} shifts, below minimum of ${p.minShifts}`
      );
    }
    if (aboveMax) {
      warnings.push(
        `${p.fullName} has ${t.total} shifts, above maximum of ${p.maxShifts}`
      );
    }
    if (t.nights < p.minNights && p.nightEligible) {
      warnings.push(
        `${p.fullName} has ${t.nights} nights, below minimum of ${p.minNights}`
      );
    }
    return {
      physicianId: p.id,
      fullName: p.fullName,
      total: t.total,
      rounding: t.rounding,
      admin: t.admin,
      nights: t.nights,
      weekends: t.weekends,
      desiredShifts: p.desiredShifts,
      minShifts: p.minShifts,
      maxShifts: p.maxShifts,
      belowMin,
      aboveMax,
    };
  });
}

/**
 * Fairness score in [0, 100]. Derived from the coefficient of variation of
 * total shifts and nights across physicians — lower spread => higher score.
 */
function computeFairness(stats: PhysicianStats[]): number {
  if (stats.length === 0) return 100;
  const totalCV = coefficientOfVariation(stats.map((s) => s.total));
  const nightCV = coefficientOfVariation(stats.map((s) => s.nights));
  const combined = (totalCV + nightCV) / 2;
  return Math.max(0, Math.round((1 - combined) * 100));
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function coefficientOfVariation(nums: number[]): number {
  const mean = average(nums);
  if (mean === 0) return 0;
  const variance = average(nums.map((n) => (n - mean) ** 2));
  return Math.sqrt(variance) / mean;
}
