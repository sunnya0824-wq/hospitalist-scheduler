import type {
  AssignmentResult,
  PhysicianStats,
  SchedulerOptions,
  SchedulerPhysician,
  SchedulerResult,
  ShiftSlot,
  UnfilledSlot,
} from "./types";
import { addDaysISO, isWeekend } from "./dates";
import { isHoliday } from "../holidays";
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
  holidays: number;
  /** ISO dates the physician is already working (any shift). */
  workingDates: Set<string>;
  /**
   * ISO dates the physician is barred from ANY shift because they worked a
   * night the day(s) before. A night on day D blocks D+1 and D+2.
   */
  blockedDates: Set<string>;
}

function emptyTally(): Tally {
  return {
    total: 0,
    rounding: 0,
    admin: 0,
    nights: 0,
    weekends: 0,
    holidays: 0,
    workingDates: new Set(),
    blockedDates: new Set(),
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
  // No shift in the two days following a night shift (post-night rest).
  if (tally.blockedDates.has(slot.date)) {
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
  // Respect requested time off — a hard block on any shift, any hospital.
  if (phys.timeOffDates.has(slot.date)) {
    return "time off requested";
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
  // Hard cap on consecutive working days (counts the candidate, looking both
  // backward and forward so a new shift can't bridge two runs past the cap).
  if (consecutiveSpanWith(tally, slot.date) > phys.maxConsecutiveDays) {
    return "exceeds max consecutive days";
  }
  // Respect the hard cap unless the run overrides it.
  if (!opts.allowOverMax && tally.total >= phys.maxShifts) {
    return "at max shifts";
  }
  return null;
}

/**
 * Total consecutive working-day streak that would result from adding `date`,
 * spanning both the days before and the days after it.
 */
function consecutiveSpanWith(tally: Tally, date: string): number {
  let back = 0;
  let cursor = addDaysISO(date, -1);
  while (tally.workingDates.has(cursor)) {
    back += 1;
    cursor = addDaysISO(cursor, -1);
  }
  let fwd = 0;
  cursor = addDaysISO(date, 1);
  while (tally.workingDates.has(cursor)) {
    fwd += 1;
    cursor = addDaysISO(cursor, 1);
  }
  return back + fwd + 1;
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
  avgWeekends: number,
  avgHolidays: number,
  target: number
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
  // Soft preference toward the (FTE-scaled) monthly target: favour those still
  // under target, push those already over it down. Never a hard constraint.
  s += (target - tally.total) * 18;

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
  // Holiday fairness: spread holiday duty by favouring the least-burdened.
  if (isHoliday(slot.date)) {
    s -= (tally.holidays - avgHolidays) * 30;
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
  if (isHoliday(slot.date)) tally.holidays += 1;
  if (slot.shiftType === "ROUNDER") tally.rounding += 1;
  else if (slot.shiftType === "ADMIN") tally.admin += 1;
  else if (isNightType(slot.shiftType)) {
    tally.nights += 1;
    // The night ends the next morning, so the end date is occupied. A night on
    // day D bars ANY shift on D+1 and D+2 (two-day post-night rest).
    tally.workingDates.add(slot.endDate);
    tally.blockedDates.add(addDaysISO(slot.date, 1));
    tally.blockedDates.add(addDaysISO(slot.date, 2));
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

  // Resolve each physician's monthly target: an explicit override, or the
  // average shifts-per-physician scaled by their FTE. Used as a soft pull.
  const monthlyAvg = active.length > 0 ? slots.length / active.length : 0;
  const targets = new Map<string, number>();
  for (const p of active) {
    targets.set(p.id, resolveTarget(p, monthlyAvg));
  }

  // Seed post-night rest from nights worked just before the slot window so a
  // night on the prior month's last days still blocks this month's first days.
  for (const pn of opts.priorNights ?? []) {
    const tally = tallies.get(pn.physicianId);
    if (!tally) continue;
    tally.blockedDates.add(addDaysISO(pn.date, 1));
    tally.blockedDates.add(addDaysISO(pn.date, 2));
  }

  const warnings: string[] = [];
  const results: AssignmentResult[] = [];
  const unfilledSlots: UnfilledSlot[] = [];

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
    const avgHolidays = average(active.map((p) => tallies.get(p.id)!.holidays));

    let best: { phys: SchedulerPhysician; score: number } | null = null;
    for (const phys of active) {
      const tally = tallies.get(phys.id)!;
      if (hardConstraintViolation(phys, slot, tally, opts)) continue;
      const sc = score(
        phys,
        slot,
        tally,
        avgNights,
        avgWeekends,
        avgHolidays,
        targets.get(phys.id)!
      );
      if (!best || sc > best.score) best = { phys, score: sc };
    }

    if (!best) {
      const gap = `Coverage gap: ${SHIFT_LABELS[slot.shiftType]}${
        slot.rounderIndex ? ` ${slot.rounderIndex}` : ""
      } on ${slot.date} — no eligible physician`;
      warnings.push(gap);
      unfilledSlots.push({
        date: slot.date,
        hospital: slot.hospital,
        shiftType: slot.shiftType,
        rounderIndex: slot.rounderIndex,
      });
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
  const stats = buildStats(active, tallies, targets, warnings);
  const fairnessScore = computeFairness(stats);

  // Restore deterministic ordering for storage/display (by date then slot).
  results.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const pa = slotPriority(a);
    const pb = slotPriority(b);
    if (pa !== pb) return pb - pa; // rounders before admin/nights in display
    return (a.rounderIndex ?? 0) - (b.rounderIndex ?? 0);
  });

  return { assignments: results, warnings, stats, fairnessScore, unfilledSlots };
}

/** Resolve a physician's monthly target from an override or the FTE-scaled average. */
function resolveTarget(phys: SchedulerPhysician, monthlyAvg: number): number {
  if (phys.monthlyShiftTarget != null) return phys.monthlyShiftTarget;
  return Math.round(monthlyAvg * phys.fteMultiplier);
}

function buildStats(
  active: SchedulerPhysician[],
  tallies: Map<string, Tally>,
  targets: Map<string, number>,
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
      holidays: t.holidays,
      desiredShifts: p.desiredShifts,
      target: targets.get(p.id) ?? p.desiredShifts,
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
