import type {
  AssignmentResult,
  PhysicianStats,
  SchedulerOptions,
  SchedulerPhysician,
  SchedulerResult,
  SchedulerRules,
  ShiftSlot,
  UnfilledSlot,
} from "./types";
import { addDaysISO, isWeekend, weekdayOf, DEFAULT_WEEKEND_DAYS } from "./dates";
import { Ledger, checkAssignment } from "./constraints";
import { holidaysInRange } from "./holidays";
import { slotLabel } from "./shifts";

/**
 * Soft-preference weights. Sized relative to the fairness signals
 * (night/weekend fairness are ±30/±25 per shift off the mean), so a stated
 * preference strongly biases the pick without overriding hard constraints.
 * Higher score = better candidate.
 */
const PREF_DIRECTION_WEIGHT = 50;
const PREF_WEEKDAY_AVOID_WEIGHT = 40;
const CAP_OVER_WEIGHT = 200;
const CAP_APPROACH_WEIGHT = 20;
/**
 * Bonus for working the next night of a block that is shorter than the
 * preferred block length. Large enough to beat night fairness, so nights
 * come in blocks instead of being scattered one at a time.
 */
const NIGHT_BLOCK_CONTINUE_WEIGHT = 800;
/** Penalty for starting a fresh block of one when a block is still forming. */
const LONG_RUN_PENALTY = 200;

export const DEFAULT_RULES: SchedulerRules = {
  restDaysAfterNights: 2,
  preferredNightBlock: 3,
  weekendDays: new Set(DEFAULT_WEEKEND_DAYS),
  holidays: new Set(),
};

/** Fill missing rules; holidays default to US federal for the slots' range. */
export function resolveRules(
  partial: Partial<SchedulerRules> | undefined,
  slots: Pick<ShiftSlot, "date">[]
): SchedulerRules {
  let holidays = partial?.holidays;
  if (!holidays) {
    const dates = slots.map((s) => s.date).sort();
    holidays = dates.length
      ? new Set(holidaysInRange(dates[0], dates[dates.length - 1]).keys())
      : new Set();
  }
  return {
    restDaysAfterNights: Math.max(0, partial?.restDaysAfterNights ?? DEFAULT_RULES.restDaysAfterNights),
    preferredNightBlock: Math.max(1, partial?.preferredNightBlock ?? DEFAULT_RULES.preferredNightBlock),
    weekendDays: partial?.weekendDays ?? new Set(DEFAULT_RULES.weekendDays),
    holidays,
  };
}

/**
 * Soft scoring. Higher = better fit. The greedy loop gives each slot to the
 * eligible physician with the highest score.
 */
function score(
  phys: SchedulerPhysician,
  slot: ShiftSlot,
  led: Ledger,
  avg: { nights: number; weekends: number; holidays: number },
  target: number,
  rules: SchedulerRules
): number {
  let s = 0;
  const night = slot.category === "NIGHT";
  const weekend = isWeekend(slot.date, rules.weekendDays);

  // --- Workload targeting --------------------------------------------------
  if (led.total < phys.minShifts) s += 1000 + (phys.minShifts - led.total) * 40;
  if (led.total >= phys.maxShifts) s -= 600;
  s += (phys.desiredShifts - led.total) * 25;
  s += (target - led.total) * 18;

  // --- Category targeting --------------------------------------------------
  if (night) {
    if (led.nights < phys.minNights) s += 200;
    if (led.nights >= phys.maxNights) s -= 500;
  } else if (slot.category === "ADMIT") {
    if (led.admit < phys.minAdmin) s += 150;
    if (led.admit >= phys.maxAdmin) s -= 400;
  } else {
    if (led.day < phys.minRounding) s += 80;
    if (led.day >= phys.maxRounding) s -= 300;
  }

  // --- Fairness ------------------------------------------------------------
  if (night) s -= (led.nights - avg.nights) * 30;
  if (weekend) s -= (led.weekends - avg.weekends) * 25;
  if (rules.holidays.has(slot.date)) s -= (led.holidays - avg.holidays) * 30;

  // --- Preferences ---------------------------------------------------------
  if (phys.preferredDates.has(slot.date)) s += 120;
  if (phys.shiftPreference === "MORE") s += 30;
  if (phys.shiftPreference === "FEWER") s -= 30;

  if (night) {
    if (phys.prefersNights) s += PREF_DIRECTION_WEIGHT;
    if (phys.avoidsNights) s -= PREF_DIRECTION_WEIGHT;
  }
  if (weekend) {
    if (phys.prefersWeekends) s += PREF_DIRECTION_WEIGHT;
    if (phys.avoidsWeekends) s -= PREF_DIRECTION_WEIGHT;
  }
  if (slot.category === "ADMIT") {
    if (phys.prefersDayAdmit) s += PREF_DIRECTION_WEIGHT;
    if (phys.avoidsDayAdmit) s -= PREF_DIRECTION_WEIGHT;
  }
  if (phys.avoidWeekdays.has(weekdayOf(slot.date))) s -= PREF_WEEKDAY_AVOID_WEIGHT;

  // Soft caps: heavy penalty once over, gentle gradient approaching.
  if (phys.maxNightsPerMonth != null && night) {
    if (led.nights >= phys.maxNightsPerMonth) s -= CAP_OVER_WEIGHT;
    else if (phys.maxNightsPerMonth > 0) s -= (led.nights / phys.maxNightsPerMonth) * CAP_APPROACH_WEIGHT;
  }
  if (phys.maxWeekendsPerMonth != null && weekend) {
    if (led.weekends >= phys.maxWeekendsPerMonth) s -= CAP_OVER_WEIGHT;
    else if (phys.maxWeekendsPerMonth > 0) s -= (led.weekends / phys.maxWeekendsPerMonth) * CAP_APPROACH_WEIGHT;
  }

  // --- Night blocks & rest -------------------------------------------------
  const blockSoFar = night ? led.nightsBefore(slot.date) : 0;
  const blockTarget = phys.preferredNightBlock ?? rules.preferredNightBlock;
  const continuingBlock = blockSoFar > 0 && blockSoFar < blockTarget;
  if (continuingBlock) s += NIGHT_BLOCK_CONTINUE_WEIGHT;
  if (night && blockSoFar === 0 && !led.starts.has(addDaysISO(slot.date, -1))) s += 15;
  // Discourage long runs of working days, except inside a forming night block.
  if (!continuingBlock && led.runEndingAt(slot.date) > 5) s -= LONG_RUN_PENALTY;

  return s;
}

/**
 * Fill order: nights first (hardest to cover, and blocks must be built
 * chronologically), then admitting, then day shifts; within a category by
 * location order, then date, then template order.
 */
function slotPriority(slot: ShiftSlot): number {
  if (slot.category === "NIGHT") return 0;
  if (slot.category === "ADMIT") return 1;
  return 2;
}

function compareForFill(a: ShiftSlot, b: ShiftSlot): number {
  return (
    slotPriority(a) - slotPriority(b) ||
    (a.category === "DAY" ? a.locationSort - b.locationSort : 0) ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    a.locationSort - b.locationSort ||
    a.templateSort - b.templateSort ||
    a.slotIndex - b.slotIndex
  );
}

function compareForDisplay(a: ShiftSlot, b: ShiftSlot): number {
  return (
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    a.locationSort - b.locationSort ||
    a.templateSort - b.templateSort ||
    a.slotIndex - b.slotIndex
  );
}

/**
 * Core scheduling routine. Greedy + scoring:
 *   1. Seed ledgers with shifts from just before the window and with any
 *      locked/manual slots.
 *   2. Walk the open slots in fill order and give each to the best-scoring
 *      physician who passes every hard rule.
 *   3. Slots nobody can take stay empty and are reported as coverage gaps.
 */
export function runScheduler(
  physicians: SchedulerPhysician[],
  slots: ShiftSlot[],
  opts: SchedulerOptions = {}
): SchedulerResult {
  const rules = resolveRules(opts.rules, slots);
  const active = physicians.filter((p) => p.active);
  const byId = new Map(active.map((p) => [p.id, p]));
  const ledgers = new Map<string, Ledger>();
  for (const p of active) ledgers.set(p.id, new Ledger());

  const monthlyAvg = active.length > 0 ? slots.length / active.length : 0;
  const targets = new Map<string, number>();
  for (const p of active) targets.set(p.id, resolveTarget(p, monthlyAvg));

  for (const ps of opts.priorShifts ?? []) {
    ledgers.get(ps.physicianId)?.add(ps, rules, false);
  }

  const warnings: string[] = [];
  const results: AssignmentResult[] = [];
  const unfilledSlots: UnfilledSlot[] = [];

  // Step 1: pre-assigned slots count toward fairness and limits.
  for (const slot of slots.filter((s) => s.physicianId)) {
    const led = ledgers.get(slot.physicianId!);
    const phys = byId.get(slot.physicianId!);
    const slotWarnings: string[] = [];
    if (led && phys) {
      const why = checkAssignment(phys, slot, led, rules, { ignoreMaxShifts: true });
      if (why) {
        slotWarnings.push(`${phys.fullName}: ${why} (kept because it is ${slot.isLocked ? "locked" : "a manual edit"})`);
      }
      led.add(slot, rules);
    }
    warnings.push(...slotWarnings.map((w) => `${slot.date} ${slot.shiftName}: ${w}`));
    results.push({ ...slot, isAutoGenerated: false, warnings: slotWarnings });
  }

  // Step 2: fill the rest.
  const open = slots.filter((s) => !s.physicianId).sort(compareForFill);
  for (const slot of open) {
    const avg = {
      nights: average(active.map((p) => ledgers.get(p.id)!.nights)),
      weekends: average(active.map((p) => ledgers.get(p.id)!.weekends)),
      holidays: average(active.map((p) => ledgers.get(p.id)!.holidays)),
    };

    let best: { phys: SchedulerPhysician; score: number } | null = null;
    for (const phys of active) {
      const led = ledgers.get(phys.id)!;
      if (checkAssignment(phys, slot, led, rules, { allowOverMax: opts.allowOverMax })) continue;
      const sc = score(phys, slot, led, avg, targets.get(phys.id)!, rules);
      if (!best || sc > best.score) best = { phys, score: sc };
    }

    if (!best) {
      const label = slotLabel(slot.shiftCode, slot.slotIndex, slot.slotIndex > 1);
      const gap = `Coverage gap: ${slot.locationName} ${slot.shiftName} (${label}) on ${slot.date}`;
      warnings.push(gap);
      unfilledSlots.push({
        date: slot.date,
        locationId: slot.locationId,
        locationName: slot.locationName,
        shiftTemplateId: slot.shiftTemplateId,
        shiftName: slot.shiftName,
        shiftCode: slot.shiftCode,
        category: slot.category,
        slotIndex: slot.slotIndex,
      });
      results.push({ ...slot, physicianId: null, isAutoGenerated: true, warnings: [gap] });
      continue;
    }

    ledgers.get(best.phys.id)!.add(slot, rules);
    results.push({ ...slot, physicianId: best.phys.id, isAutoGenerated: true, warnings: [] });
  }

  // Step 3: stats and constraint warnings.
  const dates = slots.map((s) => s.date).sort();
  const stats = buildStats(active, ledgers, targets, warnings, dates[0], dates[dates.length - 1]);
  const fairness = computeFairness(stats);

  results.sort(compareForDisplay);
  return {
    assignments: results,
    warnings,
    stats,
    fairnessScore: fairness.score,
    fairnessBreakdown: fairness.breakdown,
    unfilledSlots,
  };
}

/** Monthly target: an explicit override, or the FTE-scaled average. */
export function resolveTarget(phys: SchedulerPhysician, monthlyAvg: number): number {
  if (phys.monthlyShiftTarget != null) return phys.monthlyShiftTarget;
  return Math.round(monthlyAvg * phys.fteMultiplier);
}

function buildStats(
  active: SchedulerPhysician[],
  ledgers: Map<string, Ledger>,
  targets: Map<string, number>,
  warnings: string[],
  start?: string,
  end?: string
): PhysicianStats[] {
  return active.map((p) => {
    const l = ledgers.get(p.id)!;
    const belowMin = l.total < p.minShifts;
    const aboveMax = l.total > p.maxShifts;
    if (belowMin) warnings.push(`${p.fullName} has ${l.total} shifts, below minimum of ${p.minShifts}`);
    if (aboveMax) warnings.push(`${p.fullName} has ${l.total} shifts, above maximum of ${p.maxShifts}`);
    if (p.nightEligible && l.nights < p.minNights) {
      warnings.push(`${p.fullName} has ${l.nights} nights, below minimum of ${p.minNights}`);
    }
    return {
      physicianId: p.id,
      fullName: p.fullName,
      total: l.total,
      rounding: l.day,
      admin: l.admit,
      nights: l.nights,
      weekends: l.weekends,
      holidays: l.holidays,
      desiredShifts: p.desiredShifts,
      target: targets.get(p.id) ?? p.desiredShifts,
      minShifts: p.minShifts,
      maxShifts: p.maxShifts,
      belowMin,
      aboveMax,
      nightEligible: p.nightEligible,
      prefersNights: p.prefersNights,
      longestNightBlock: l.longestNightBlock(start, end),
      maxNightsPerMonth: p.maxNightsPerMonth,
      maxWeekendsPerMonth: p.maxWeekendsPerMonth,
    };
  });
}

/**
 * Fairness score in [0, 100], the mean of three components:
 *   - workload: spread of (shifts / own target), so a part-timer working
 *     fewer shifts by design is not counted as unfair;
 *   - nights: spread of (nights / own target) among night-eligible physicians
 *     who have NOT asked for nights, so dedicated nocturnists don't count as
 *     unfairness against everyone else;
 *   - weekends: spread of weekend shifts relative to each person's workload.
 * Each component is 100 × (1 − coefficient of variation), floored at 0.
 */
export function computeFairness(stats: PhysicianStats[]): {
  score: number;
  breakdown: { workload: number; nights: number; weekends: number };
} {
  const component = (nums: number[]) =>
    nums.length === 0 ? 100 : Math.max(0, Math.round((1 - coefficientOfVariation(nums)) * 100));
  const withTarget = stats.filter((s) => s.target > 0);
  const workload = component(withTarget.map((s) => s.total / s.target));
  const sharers = stats.filter((s) => s.nightEligible && !s.prefersNights && s.target > 0);
  const nights = component(sharers.map((s) => s.nights / s.target));
  const weekends = component(stats.filter((s) => s.total > 0).map((s) => s.weekends / s.total));
  return {
    score: Math.round((workload + nights + weekends) / 3),
    breakdown: { workload, nights, weekends },
  };
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
