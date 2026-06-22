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
  ];
  const allowed = [
    "fullName",
    "active",
    "shiftPreference",
    "nightEligible",
    "adminEligible",
    "notes",
    ...numeric,
  ];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in fields)) continue;
    out[key] = numeric.includes(key) ? Number(fields[key]) : fields[key];
  }
  return out;
}
