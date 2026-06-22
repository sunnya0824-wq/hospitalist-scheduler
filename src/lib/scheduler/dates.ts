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

/** True when the ISO date falls on Saturday or Sunday (UTC). */
export function isWeekend(iso: string): boolean {
  const day = fromISODate(iso).getUTCDay();
  return day === 0 || day === 6;
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
