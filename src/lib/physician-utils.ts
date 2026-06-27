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
  ];
  // Numeric fields that may be cleared to null (no value set).
  const nullableNumeric = [
    "monthlyShiftTarget",
    "maxNightsPerMonth",
    "maxWeekendsPerMonth",
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
    "canWorkCarson",
    "canWorkEaton",
    "canWorkClinton",
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
    ["prefersDayAdmit", "avoidsDayAdmit", "day admitting"],
  ];
  for (const [prefKey, avoidKey, label] of pairs) {
    if (fields[prefKey] === true && fields[avoidKey] === true) {
      return `Cannot both prefer and avoid ${label}`;
    }
  }
  for (const key of ["maxNightsPerMonth", "maxWeekendsPerMonth"]) {
    if (!(key in fields)) continue;
    const v = fields[key];
    if (v === null || v === "" || v === undefined) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      return `${key} must be a non-negative integer`;
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
