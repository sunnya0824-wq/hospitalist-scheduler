/**
 * Date helpers. All scheduling math is done on UTC date-only values so a
 * physician's "day" is unambiguous regardless of server timezone.
 */

/** Format a Date as an ISO date-only string (YYYY-MM-DD) in UTC. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Build a UTC midnight Date from year/month(1-12)/day. */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Parse an ISO date-only string into a UTC midnight Date. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Number of days in a given month (1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Add N days to an ISO date string, returning a new ISO date string. */
export function addDaysISO(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Default weekend: Saturday and Sunday. */
export const DEFAULT_WEEKEND_DAYS: ReadonlySet<number> = new Set([0, 6]);

/** True when the ISO date falls on a weekend day (Sat/Sun unless configured). */
export function isWeekend(
  iso: string,
  weekendDays: ReadonlySet<number> = DEFAULT_WEEKEND_DAYS
): boolean {
  return weekendDays.has(fromISODate(iso).getUTCDay());
}

/** All ISO date strings within a month, in order. */
export function monthDates(year: number, month: number): string[] {
  const count = daysInMonth(year, month);
  const dates: string[] = [];
  for (let day = 1; day <= count; day++) {
    dates.push(toISODate(utcDate(year, month, day)));
  }
  return dates;
}

/** Weekday of an ISO date: 0 = Sunday … 6 = Saturday (UTC). */
export function weekdayOf(iso: string): number {
  return fromISODate(iso).getUTCDay();
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isValidISODate(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}
