/**
 * Hard scheduling rules, shared by the generator and by manual edits/swaps so
 * both always agree on what is allowed.
 *
 * Night blocks: nights may run back to back (up to a physician's
 * maxConsecutiveNights). The rest days apply after the LAST night of a block:
 * a block ending on night N blocks every shift on N+1 … N+restDays.
 */
import type { SchedulerPhysician, SchedulerRules, ShiftCategory } from "./types";
import { addDaysISO, isWeekend } from "./dates";

export interface LedgerEntry {
  date: string;
  endDate: string;
  category: ShiftCategory;
}

/** Everything one physician is already committed to. */
export class Ledger {
  /** Start date → category of the shift starting that day. */
  readonly starts = new Map<string, ShiftCategory>();
  /** Start dates of night shifts (kept separately so a same-day double booking can't hide a night). */
  readonly nightDates = new Set<string>();
  /** Start date → true when that shift runs past midnight. */
  readonly overnight = new Set<string>();
  total = 0;
  day = 0;
  admit = 0;
  nights = 0;
  weekends = 0;
  holidays = 0;

  /**
   * Record a shift. `counts` = false for shifts outside the period being
   * tallied (prior month): they constrain but don't add to totals.
   */
  add(entry: LedgerEntry, rules: Pick<SchedulerRules, "weekendDays" | "holidays">, counts = true): void {
    if (!this.starts.has(entry.date) || entry.category === "NIGHT") this.starts.set(entry.date, entry.category);
    if (entry.category === "NIGHT") this.nightDates.add(entry.date);
    if (entry.endDate !== entry.date) this.overnight.add(entry.date);
    if (!counts) return;
    this.total += 1;
    if (entry.category === "DAY") this.day += 1;
    else if (entry.category === "ADMIT") this.admit += 1;
    else this.nights += 1;
    if (isWeekend(entry.date, rules.weekendDays)) this.weekends += 1;
    if (rules.holidays.has(entry.date)) this.holidays += 1;
  }

  isNight(date: string): boolean {
    return this.nightDates.has(date);
  }

  /** Consecutive nights immediately before `date`. */
  nightsBefore(date: string): number {
    let n = 0;
    let d = addDaysISO(date, -1);
    while (this.isNight(d)) {
      n += 1;
      d = addDaysISO(d, -1);
    }
    return n;
  }

  /** Consecutive nights immediately after `date`. */
  nightsAfter(date: string): number {
    let n = 0;
    let d = addDaysISO(date, 1);
    while (this.isNight(d)) {
      n += 1;
      d = addDaysISO(d, 1);
    }
    return n;
  }

  /** Working-day streak that would result from adding `date`. */
  spanWith(date: string): number {
    let back = 0;
    let d = addDaysISO(date, -1);
    while (this.starts.has(d)) {
      back += 1;
      d = addDaysISO(d, -1);
    }
    let fwd = 0;
    d = addDaysISO(date, 1);
    while (this.starts.has(d)) {
      fwd += 1;
      d = addDaysISO(d, 1);
    }
    return back + fwd + 1;
  }

  /** Working-day streak ending on the day before `date`, plus `date`. */
  runEndingAt(date: string): number {
    let run = 1;
    let d = addDaysISO(date, -1);
    while (this.starts.has(d)) {
      run += 1;
      d = addDaysISO(d, -1);
    }
    return run;
  }

  /** Longest night block among the given dates' nights. */
  longestNightBlock(withinStart?: string, withinEnd?: string): number {
    let best = 0;
    for (const date of this.nightDates) {
      if (withinStart && date < withinStart) continue;
      if (withinEnd && date > withinEnd) continue;
      if (this.isNight(addDaysISO(date, -1))) continue; // not a block start
      best = Math.max(best, 1 + this.nightsAfter(date));
    }
    return best;
  }
}

export interface CandidateSlot {
  date: string;
  endDate: string;
  category: ShiftCategory;
  /** null/empty for slots whose location was deleted: no location check. */
  locationId: string | null;
}

export interface CheckOptions {
  allowOverMax?: boolean;
  /** Skip the maxShifts check entirely (manual edits warn instead). */
  ignoreMaxShifts?: boolean;
}

/**
 * Returns a short reason when the physician cannot take the slot, or null.
 * Checks both directions in time, so it is valid for out-of-order manual
 * edits as well as the chronological generator.
 */
export function checkAssignment(
  phys: SchedulerPhysician,
  slot: CandidateSlot,
  ledger: Ledger,
  rules: Pick<SchedulerRules, "restDaysAfterNights">,
  opts: CheckOptions = {}
): string | null {
  const { date, endDate, category } = slot;
  const isNight = category === "NIGHT";
  const prev = addDaysISO(date, -1);

  if (!phys.active) return "inactive";
  if (ledger.starts.has(date)) return "already working that day";
  if (phys.timeOffDates.has(date)) return "time off requested";
  if (phys.unavailableDates.has(date)) return "unavailable on that date";
  if (isNight && !phys.nightEligible) return "not night eligible";
  if (category === "ADMIT" && !phys.adminEligible) return "not admit eligible";
  if (slot.locationId && !phys.eligibleLocations.has(slot.locationId)) return "not eligible for this location";

  // An overnight from yesterday is still running this morning. Only another
  // night (continuing the block) may follow it.
  if (ledger.overnight.has(prev) && !(isNight && ledger.isNight(prev))) {
    return "still on an overnight shift that morning";
  }
  // This shift runs into tomorrow: tomorrow must be free, or a block night.
  if (endDate !== date && ledger.starts.has(endDate)) {
    if (!(isNight && ledger.isNight(endDate))) return "next-day conflict for overnight shift";
  }

  const rest = Math.max(0, rules.restDaysAfterNights);
  if (rest > 0) {
    // Looking back: a block that ended on day D-k (k ≤ rest) bars this day,
    // unless this is the next night of that same block (k = 1, night).
    for (let k = 1; k <= rest; k++) {
      const d = addDaysISO(date, -k);
      if (!ledger.isNight(d)) continue;
      const after = addDaysISO(d, 1);
      const blockEnded = k === 1 ? !isNight : !ledger.isNight(after);
      if (blockEnded) return "resting after night shifts";
    }
    // Looking forward: a night here must not cut into existing work during
    // its rest days, unless tomorrow is a night continuing the block.
    if (isNight) {
      for (let k = 1; k <= rest; k++) {
        const d = addDaysISO(date, k);
        if (!ledger.starts.has(d)) continue;
        if (k === 1 && ledger.isNight(d)) break;
        return "would work during the rest days after this night";
      }
    }
  }

  if (isNight) {
    const block = ledger.nightsBefore(date) + 1 + ledger.nightsAfter(date);
    if (block > phys.maxConsecutiveNights) {
      return `exceeds ${phys.maxConsecutiveNights} nights in a row`;
    }
  }
  if (ledger.spanWith(date) > phys.maxConsecutiveDays) {
    return `exceeds ${phys.maxConsecutiveDays} days in a row`;
  }
  if (!opts.ignoreMaxShifts && !opts.allowOverMax && ledger.total >= phys.maxShifts) {
    return "at max shifts";
  }
  return null;
}
