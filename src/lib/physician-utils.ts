import { isValidISODate } from "./scheduler/dates";

/** Coerce numeric fields and strip anything not part of the Physician model. */
export function sanitize(fields: Record<string, unknown>) {
  const numeric = [
    "desiredShifts",
    "minShifts",
    "maxShifts",
    "minRounding",
    "maxRounding",
    "minNights",
    "maxNights",
    "minAdmin",
    "maxAdmin",
    "fteMultiplier",
    "maxConsecutiveDays",
    "maxConsecutiveNights",
  ];
  // Numeric fields that may be cleared to null (no value set).
  const nullableNumeric = [
    "monthlyShiftTarget",
    "maxNightsPerMonth",
    "maxWeekendsPerMonth",
    "preferredNightBlock",
  ];
  const booleanPrefs = [
    "prefersNights",
    "avoidsNights",
    "prefersWeekends",
    "avoidsWeekends",
    "prefersDayAdmit",
    "avoidsDayAdmit",
  ];
  const allowed = [
    "fullName",
    "active",
    "shiftPreference",
    "nightEligible",
    "adminEligible",
    "notes",
    ...booleanPrefs,
    ...numeric,
    ...nullableNumeric,
  ];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in fields)) continue;
    if (nullableNumeric.includes(key)) {
      const v = fields[key];
      out[key] = v === null || v === "" || v === undefined ? null : Number(v);
    } else if (numeric.includes(key)) {
      out[key] = Number(fields[key]);
    } else {
      out[key] = fields[key];
    }
  }
  // avoidWeekdays: coerce to a clean { "0".."6": true } object.
  if ("avoidWeekdays" in fields) {
    out.avoidWeekdays = coerceAvoidWeekdays(fields.avoidWeekdays);
  }
  return out;
}

/** Coerce an arbitrary value into a clean weekday→boolean map with keys "0".."6". */
export function coerceAvoidWeekdays(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const dow = Number(key);
      if (Number.isInteger(dow) && dow >= 0 && dow <= 6 && value === true) {
        out[String(dow)] = true;
      }
    }
  }
  return out;
}

/**
 * Validate the preference invariants. Returns an error message string when the
 * payload is invalid, or null when it passes. Applies only to fields present.
 */
export function validatePreferences(
  fields: Record<string, unknown>
): string | null {
  const pairs: [string, string, string][] = [
    ["prefersNights", "avoidsNights", "nights"],
    ["prefersWeekends", "avoidsWeekends", "weekends"],
    ["prefersDayAdmit", "avoidsDayAdmit", "admitting"],
  ];
  for (const [prefKey, avoidKey, label] of pairs) {
    if (fields[prefKey] === true && fields[avoidKey] === true) {
      return `Cannot both prefer and avoid ${label}`;
    }
  }
  for (const key of ["maxNightsPerMonth", "maxWeekendsPerMonth", "preferredNightBlock"]) {
    if (!(key in fields)) continue;
    const v = fields[key];
    if (v === null || v === "" || v === undefined) continue;
    const n = Number(v);
    const min = key === "preferredNightBlock" ? 1 : 0;
    if (!Number.isInteger(n) || n < min || n > 31) {
      return `${key} must be a whole number from ${min} to 31`;
    }
  }
  if ("avoidWeekdays" in fields) {
    const raw = fields.avoidWeekdays;
    if (
      raw !== null &&
      raw !== undefined &&
      (typeof raw !== "object" || Array.isArray(raw))
    ) {
      return "avoidWeekdays must be an object mapping weekday (0-6) to boolean";
    }
  }
  return null;
}

/** Coerce a client-sent location id list (restricted locations). */
export function coerceLocationIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0))];
}

/** Basic numeric sanity checks shared by create and update. */
export function validateNumbers(fields: Record<string, unknown>): string | null {
  const positive = ["maxConsecutiveDays", "maxConsecutiveNights"];
  for (const key of positive) {
    if (!(key in fields)) continue;
    const n = Number(fields[key]);
    if (!Number.isInteger(n) || n < 1 || n > 31) return `${key} must be a whole number from 1 to 31`;
  }
  const nonNegative = ["desiredShifts", "minShifts", "maxShifts", "minRounding", "maxRounding", "minNights", "maxNights", "minAdmin", "maxAdmin"];
  for (const key of nonNegative) {
    if (!(key in fields)) continue;
    const n = Number(fields[key]);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return `${key} must be a whole number, zero or more`;
  }
  if ("monthlyShiftTarget" in fields && fields.monthlyShiftTarget !== null && fields.monthlyShiftTarget !== "") {
    const n = Number(fields.monthlyShiftTarget);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return "Monthly target must be a whole number, zero or more";
  }
  if ("shiftPreference" in fields && !["MORE", "FEWER", "NEUTRAL"].includes(String(fields.shiftPreference))) {
    return "shiftPreference must be MORE, FEWER or NEUTRAL";
  }
  if ("fullName" in fields && (typeof fields.fullName !== "string" || !fields.fullName.trim() || fields.fullName.length > 120)) {
    return "Name is required (up to 120 characters)";
  }
  if ("notes" in fields && fields.notes !== null && (typeof fields.notes !== "string" || fields.notes.length > 5000)) {
    return "Notes must be text (up to 5000 characters)";
  }
  for (const key of ["active", "nightEligible", "adminEligible"]) {
    if (key in fields && typeof fields[key] !== "boolean") return `${key} must be true or false`;
  }
  if ("fteMultiplier" in fields) {
    const n = Number(fields.fteMultiplier);
    if (!Number.isFinite(n) || n < 0 || n > 2) return "FTE must be between 0 and 2";
  }
  return null;
}

/** Validate date arrays sent for availability. Returns an error or null. */
export function validateDateList(name: string, v: unknown): string | null {
  if (v === undefined) return null;
  if (!Array.isArray(v) || !v.every((d) => isValidISODate(d))) return `${name} must be a list of real dates (YYYY-MM-DD)`;
  return null;
}
