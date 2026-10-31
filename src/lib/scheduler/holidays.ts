/**
 * Holiday calendar, computed for any year — nothing is hard-coded to a
 * particular year. Built-in rules cover US federal holidays; organizations
 * can disable any of them and add their own (one-off or yearly recurring).
 */
import { toISODate, utcDate, weekdayOf, addDaysISO } from "./dates";

export interface BuiltInHoliday {
  key: string;
  name: string;
  /** First year the holiday applies (inclusive). */
  since: number;
  /** ISO date for the given year. */
  dateFor: (year: number) => string;
  /** Fixed-date holidays move to Fri/Mon when they fall on a weekend. */
  fixedDate: boolean;
}

/** nth (1-based) weekday (0 = Sun) of a month; n = -1 → last. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = utcDate(year, month, 1).getUTCDay();
    const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    return toISODate(utcDate(year, month, day));
  }
  const lastDate = new Date(Date.UTC(year, month, 0));
  const diff = (lastDate.getUTCDay() - weekday + 7) % 7;
  return toISODate(utcDate(year, month, lastDate.getUTCDate() - diff));
}

const fixed = (month: number, day: number) => (year: number) =>
  toISODate(utcDate(year, month, day));

export const US_FEDERAL_HOLIDAYS: BuiltInHoliday[] = [
  { key: "NEW_YEAR", name: "New Year's Day", since: 1870, fixedDate: true, dateFor: fixed(1, 1) },
  { key: "MLK", name: "Martin Luther King Jr. Day", since: 1986, fixedDate: false, dateFor: (y) => nthWeekday(y, 1, 1, 3) },
  { key: "PRESIDENTS", name: "Presidents' Day", since: 1971, fixedDate: false, dateFor: (y) => nthWeekday(y, 2, 1, 3) },
  { key: "MEMORIAL", name: "Memorial Day", since: 1971, fixedDate: false, dateFor: (y) => nthWeekday(y, 5, 1, -1) },
  { key: "JUNETEENTH", name: "Juneteenth", since: 2021, fixedDate: true, dateFor: fixed(6, 19) },
  { key: "INDEPENDENCE", name: "Independence Day", since: 1870, fixedDate: true, dateFor: fixed(7, 4) },
  { key: "LABOR", name: "Labor Day", since: 1894, fixedDate: false, dateFor: (y) => nthWeekday(y, 9, 1, 1) },
  { key: "COLUMBUS", name: "Columbus Day / Indigenous Peoples' Day", since: 1971, fixedDate: false, dateFor: (y) => nthWeekday(y, 10, 1, 2) },
  { key: "VETERANS", name: "Veterans Day", since: 1978, fixedDate: true, dateFor: fixed(11, 11) },
  { key: "THANKSGIVING", name: "Thanksgiving Day", since: 1942, fixedDate: false, dateFor: (y) => nthWeekday(y, 11, 4, 4) },
  { key: "CHRISTMAS", name: "Christmas Day", since: 1870, fixedDate: true, dateFor: fixed(12, 25) },
];

/** Federal observed date: Saturday → Friday before, Sunday → Monday after. */
export function observedDate(iso: string): string {
  const dow = weekdayOf(iso);
  if (dow === 6) return addDaysISO(iso, -1);
  if (dow === 0) return addDaysISO(iso, 1);
  return iso;
}

export interface CustomHoliday {
  /** ISO date. For recurring holidays only the month/day are used. */
  date: string;
  name: string;
  recurring: boolean;
}

export interface HolidayConfig {
  observeUSFederalHolidays: boolean;
  includeObservedHolidays: boolean;
  disabledHolidays: string[];
  custom: CustomHoliday[];
}

export const DEFAULT_HOLIDAY_CONFIG: HolidayConfig = {
  observeUSFederalHolidays: true,
  includeObservedHolidays: true,
  disabledHolidays: [],
  custom: [],
};

/**
 * Holidays falling in [startISO, endISO] inclusive, as ISO date → name.
 * Works for any range of years.
 */
export function holidaysInRange(
  startISO: string,
  endISO: string,
  config: HolidayConfig = DEFAULT_HOLIDAY_CONFIG
): Map<string, string> {
  const out = new Map<string, string>();
  const startYear = Number(startISO.slice(0, 4));
  const endYear = Number(endISO.slice(0, 4));
  const add = (iso: string, name: string) => {
    if (iso < startISO || iso > endISO) return;
    const existing = out.get(iso);
    if (existing && existing !== name && !existing.includes(name)) {
      out.set(iso, `${existing} / ${name}`);
    } else if (!existing) {
      out.set(iso, name);
    }
  };
  // Observed dates can spill into the neighboring year (Jan 1 on a Saturday
  // is observed Dec 31), so look one year either side.
  for (let year = startYear - 1; year <= endYear + 1; year++) {
    if (config.observeUSFederalHolidays) {
      const disabled = new Set(config.disabledHolidays);
      for (const h of US_FEDERAL_HOLIDAYS) {
        if (year < h.since || disabled.has(h.key)) continue;
        const actual = h.dateFor(year);
        add(actual, h.name);
        if (h.fixedDate && config.includeObservedHolidays) {
          const obs = observedDate(actual);
          if (obs !== actual) add(obs, `${h.name} (observed)`);
        }
      }
    }
    for (const c of config.custom) {
      if (c.recurring) {
        const md = c.date.slice(5);
        // Feb 29 recurring holidays only occur in leap years.
        const iso = `${String(year).padStart(4, "0")}-${md}`;
        const d = new Date(iso + "T00:00:00Z");
        if (!Number.isNaN(d.getTime()) && toISODate(d) === iso) add(iso, c.name);
      } else if (Number(c.date.slice(0, 4)) === year) {
        add(c.date, c.name);
      }
    }
  }
  return out;
}
