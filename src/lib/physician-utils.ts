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
  const nullableNumeric = ["monthlyShiftTarget"];
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
  return out;
}
