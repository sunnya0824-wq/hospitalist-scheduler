/**
 * US federal holidays used for weekend/holiday fairness. Hardcoded for the
 * scheduling horizon (2026 + the 2027 New Year rollover). Dates are ISO
 * date-only strings (YYYY-MM-DD) matching the scheduler's UTC convention.
 */
export const HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Presidents' Day",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-07-04": "Independence Day",
  "2026-09-07": "Labor Day",
  "2026-10-12": "Columbus Day / Indigenous Peoples' Day",
  "2026-11-11": "Veterans Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
};

/** True when the ISO date is a recognised holiday. */
export function isHoliday(iso: string): boolean {
  return iso in HOLIDAYS;
}

/** Holiday name for an ISO date, or null. */
export function holidayName(iso: string): string | null {
  return HOLIDAYS[iso] ?? null;
}

/** True when the ISO date falls on Saturday or Sunday (UTC). */
export function isWeekend(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}
