import type { ShiftPreference } from "@prisma/client";

/**
 * Shape of a seed physician. `unavailableDates` / `preferredDates` are ISO
 * date strings (YYYY-MM-DD) and get expanded into PhysicianAvailability rows.
 */
export interface SeedPhysician {
  fullName: string;
  active: boolean;
  desiredShifts: number;
  minShifts: number;
  maxShifts: number;
  minRounding: number;
  maxRounding: number;
  minNights: number;
  maxNights: number;
  minAdmin: number;
  maxAdmin: number;
  shiftPreference: ShiftPreference;
  nightEligible: boolean;
  adminEligible: boolean;
  canWorkCarson?: boolean;
  canWorkEaton?: boolean;
  canWorkClinton?: boolean;
  notes?: string;
  unavailableDates?: string[];
  preferredDates?: string[];
}

// Sample unavailable/preferred dates anchored to a representative month so the
// generated schedule visibly reacts to them. Adjust freely after seeding.
const Y = new Date().getUTCFullYear();
const nextMonth = ((new Date().getUTCMonth() + 1) % 12) + 1;
const mm = String(nextMonth).padStart(2, "0");
const d = (day: number) => `${Y}-${mm}-${String(day).padStart(2, "0")}`;

function physician(
  fullName: string,
  desired: number,
  overrides: Partial<SeedPhysician> = {}
): SeedPhysician {
  const nightEligible = overrides.nightEligible ?? true;
  return {
    fullName,
    active: true,
    desiredShifts: desired,
    minShifts: Math.max(0, desired - 3),
    maxShifts: desired + 7,
    minRounding: 0,
    maxRounding: desired,
    minNights: nightEligible ? 2 : 0,
    maxNights: nightEligible ? 8 : 0,
    minAdmin: 0,
    maxAdmin: overrides.adminEligible === false ? 0 : 6,
    shiftPreference: "NEUTRAL",
    nightEligible,
    adminEligible: overrides.adminEligible ?? true,
    ...overrides,
  };
}

export const SEED_PHYSICIANS: SeedPhysician[] = [
  // --- 5 standard @ 14 shifts/mo ------------------------------------------
  physician("Dr. Amara Okafor", 14, { canWorkCarson: true }),
  physician("Dr. Benjamin Cho", 14, {
    shiftPreference: "MORE",
    canWorkCarson: true,
    canWorkEaton: true,
  }),
  physician("Dr. Carla Mendez", 14, {
    preferredDates: [d(5), d(6), d(12)],
    canWorkEaton: true,
  }),
  physician("Dr. Daniel Reyes", 14, {
    unavailableDates: [d(2), d(3)],
    canWorkClinton: true,
  }),
  physician("Dr. Elena Vasquez", 14, {
    shiftPreference: "FEWER",
    adminEligible: false,
  }),

  // --- 4 part-time @ 12 shifts/mo -----------------------------------------
  physician("Dr. Farah Haidari", 12, {
    shiftPreference: "FEWER",
    nightEligible: false,
  }),
  physician("Dr. George Whitman", 12, { adminEligible: false }),
  physician("Dr. Hana Suzuki", 12, {
    adminEligible: false,
    unavailableDates: [d(8), d(9), d(10)],
  }),
  physician("Dr. Idris Mohamed", 12, {
    canWorkCarson: true,
    canWorkClinton: true,
  }),

  // --- 4 high-load @ 18 shifts/mo -----------------------------------------
  physician("Dr. Julia Novak", 18, { shiftPreference: "MORE" }),
  physician("Dr. Kevin Park", 18),
  physician("Dr. Lena Fischer", 18, {
    preferredDates: [d(20), d(21), d(22)],
  }),
  physician("Dr. Marcus Bryant", 18, { shiftPreference: "MORE" }),

  // --- 3 nocturnist-heavy @ 24 shifts/mo ----------------------------------
  physician("Dr. Nadia Petrova", 24, {
    shiftPreference: "MORE",
    minNights: 6,
    maxNights: 14,
  }),
  physician("Dr. Omar Khalil", 24, {
    shiftPreference: "MORE",
    minNights: 6,
    maxNights: 14,
  }),
  physician("Dr. Priya Nair", 24, {
    shiftPreference: "MORE",
    minNights: 6,
    maxNights: 14,
  }),

  // --- 4 @ 14 shifts/mo with varied eligibility ---------------------------
  physician("Dr. Quentin Ross", 14, {
    nightEligible: false,
    notes: "Day shifts only — no overnight coverage.",
  }),
  physician("Dr. Rebecca Stone", 14, {
    nightEligible: false,
    adminEligible: false,
    notes: "Not credentialed for admin or overnight shifts.",
  }),
  physician("Dr. Samuel Tan", 14, {
    nightEligible: false,
    adminEligible: false,
    notes: "Rounding only.",
    unavailableDates: [d(15), d(16)],
    canWorkEaton: true,
    canWorkClinton: true,
  }),
  physician("Dr. Tessa Lindqvist", 14, {
    nightEligible: true,
    adminEligible: true,
  }),
];
