/** Validation + coercion for configuration payloads from the Settings page. */
import { isValidTime, normalizeDailyCounts, clampCount, SHIFT_CATEGORIES, type ShiftCategory } from "./scheduler";
import { COLOR_NAMES } from "./shift-style";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseSettings(body: Record<string, unknown>): Result<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  if ("organizationName" in body) {
    const name = str(body.organizationName, 120);
    if (!name) return { ok: false, error: "Organization name is required" };
    data.organizationName = name;
  }
  if ("restDaysAfterNights" in body) {
    const n = Number(body.restDaysAfterNights);
    if (!Number.isInteger(n) || n < 0 || n > 7) return { ok: false, error: "Rest days must be 0–7" };
    data.restDaysAfterNights = n;
  }
  if ("preferredNightBlock" in body) {
    const n = Number(body.preferredNightBlock);
    if (!Number.isInteger(n) || n < 1 || n > 14) return { ok: false, error: "Night block must be 1–14" };
    data.preferredNightBlock = n;
  }
  if ("weekendDays" in body) {
    if (!Array.isArray(body.weekendDays)) return { ok: false, error: "weekendDays must be a list" };
    const days = [...new Set(body.weekendDays.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    data.weekendDays = days.sort();
  }
  for (const key of ["observeUSFederalHolidays", "includeObservedHolidays"]) {
    if (key in body) data[key] = Boolean(body[key]);
  }
  if ("disabledHolidays" in body) {
    if (!Array.isArray(body.disabledHolidays)) return { ok: false, error: "disabledHolidays must be a list" };
    data.disabledHolidays = body.disabledHolidays.filter((x): x is string => typeof x === "string");
  }
  return { ok: true, data };
}

export function parseLocation(body: Record<string, unknown>, partial: boolean): Result<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  if (!partial || "name" in body) {
    const name = str(body.name);
    if (!name) return { ok: false, error: "Location name is required" };
    data.name = name;
  }
  if (!partial || "code" in body) {
    const code = str(body.code, 8).toUpperCase() || (typeof data.name === "string" ? data.name.slice(0, 4).toUpperCase() : "");
    if (!code) return { ok: false, error: "Short code is required" };
    data.code = code;
  }
  if ("sortOrder" in body) data.sortOrder = Math.round(Number(body.sortOrder) || 0);
  if ("active" in body) data.active = Boolean(body.active);
  if ("openToAll" in body) data.openToAll = Boolean(body.openToAll);
  return { ok: true, data };
}

export function parseTemplate(body: Record<string, unknown>, partial: boolean): Result<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  if (!partial) {
    const locationId = str(body.locationId, 64);
    if (!locationId) return { ok: false, error: "locationId is required" };
    data.locationId = locationId;
  }
  if (!partial || "name" in body) {
    const name = str(body.name);
    if (!name) return { ok: false, error: "Shift name is required" };
    data.name = name;
  }
  if (!partial || "code" in body) {
    const code = str(body.code, 6);
    if (!code) return { ok: false, error: "Short label is required" };
    data.code = code;
  }
  if (!partial || "category" in body) {
    const c = String(body.category ?? "") as ShiftCategory;
    if (!SHIFT_CATEGORIES.includes(c)) return { ok: false, error: "Category must be DAY, ADMIT or NIGHT" };
    data.category = c;
  }
  for (const key of ["startTime", "endTime"]) {
    if (!partial || key in body) {
      const t = str(body[key], 5);
      if (!isValidTime(t)) return { ok: false, error: `${key} must be HH:MM (24-hour)` };
      data[key] = t;
    }
  }
  if (!partial || "dailyCounts" in body) data.dailyCounts = normalizeDailyCounts(body.dailyCounts, 1);
  if ("holidayCount" in body) {
    data.holidayCount = body.holidayCount === null || body.holidayCount === "" ? null : clampCount(body.holidayCount);
  }
  if ("color" in body) {
    const color = str(body.color, 20);
    data.color = COLOR_NAMES.includes(color) ? color : "cyan";
  }
  if ("sortOrder" in body) data.sortOrder = Math.round(Number(body.sortOrder) || 0);
  if ("active" in body) data.active = Boolean(body.active);
  return { ok: true, data };
}

export function parseHoliday(body: Record<string, unknown>): Result<{ date: string; name: string; recurring: boolean }> {
  const date = str(body.date, 10);
  const name = str(body.name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + "T00:00:00Z").getTime())) {
    return { ok: false, error: "Date must be YYYY-MM-DD" };
  }
  if (!name) return { ok: false, error: "Holiday name is required" };
  return { ok: true, data: { date, name, recurring: Boolean(body.recurring) } };
}
