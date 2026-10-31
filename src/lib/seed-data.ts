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
  maxConsecutiveNights?: number;
  preferredNightBlock?: number | null;
  prefersNights?: boolean;
  /** Codes of restricted (not open-to-all) demo locations this physician may work. */
  locationCodes?: string[];
  notes?: string;
  unavailableDates?: string[];
  preferredDates?: string[];
}

// Sample unavailable/preferred dates anchored to NEXT month (rolling over the
// year in December) so the generated schedule visibly reacts to them.
const now = new Date();
const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const Y = next.getUTCFullYear();
const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
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
  physician("Dr. Amara Okafor", 14, { locationCodes: ["NORTH"] }),
  physician("Dr. Benjamin Cho", 14, {
    shiftPreference: "MORE",
    locationCodes: ["NORTH", "SOUTH"],
  }),
  physician("Dr. Carla Mendez", 14, {
    preferredDates: [d(5), d(6), d(12)],
    locationCodes: ["SOUTH"],
  }),
  physician("Dr. Daniel Reyes", 14, {
    unavailableDates: [d(2), d(3)],
    locationCodes: ["NORTH"],
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
    locationCodes: ["NORTH", "SOUTH"],
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
    prefersNights: true,
    preferredNightBlock: 7,
  }),
  physician("Dr. Omar Khalil", 24, {
    shiftPreference: "MORE",
    minNights: 6,
    maxNights: 14,
    prefersNights: true,
    preferredNightBlock: 7,
  }),
  physician("Dr. Priya Nair", 24, {
    shiftPreference: "MORE",
    minNights: 6,
    maxNights: 14,
    prefersNights: true,
    preferredNightBlock: 7,
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
    locationCodes: ["SOUTH"],
  }),
  physician("Dr. Tessa Lindqvist", 14, {
    nightEligible: true,
    adminEligible: true,
  }),
];

/** Demo configuration used when seeding an empty install and in tests. */
export interface DemoLocation {
  code: string;
  name: string;
  openToAll: boolean;
  templates: {
    name: string;
    code: string;
    category: "DAY" | "ADMIT" | "NIGHT";
    startTime: string;
    endTime: string;
    dailyCounts: number[];
    holidayCount?: number | null;
    color: string;
  }[];
}

export const DEMO_LOCATIONS: DemoLocation[] = [
  {
    code: "MAIN",
    name: "Main Hospital",
    openToAll: true,
    templates: [
      { name: "Rounder", code: "R", category: "DAY", startTime: "07:00", endTime: "17:00", dailyCounts: [10, 10, 10, 10, 10, 10, 10], color: "cyan" },
      { name: "Day Admitting", code: "DA", category: "ADMIT", startTime: "12:00", endTime: "21:00", dailyCounts: [1, 1, 1, 1, 1, 1, 1], color: "amber" },
      { name: "Night Admit 1", code: "N1", category: "NIGHT", startTime: "17:00", endTime: "05:00", dailyCounts: [1, 1, 1, 1, 1, 1, 1], color: "teal" },
      { name: "Night Admit 2", code: "N2", category: "NIGHT", startTime: "19:00", endTime: "07:00", dailyCounts: [1, 1, 1, 1, 1, 1, 1], color: "fuchsia" },
    ],
  },
  {
    code: "NORTH",
    name: "North Campus",
    openToAll: false,
    templates: [
      { name: "Rounder", code: "R", category: "DAY", startTime: "07:00", endTime: "17:00", dailyCounts: [0, 0, 0, 0, 0, 0, 0], color: "violet" },
    ],
  },
  {
    code: "SOUTH",
    name: "South Campus",
    openToAll: false,
    templates: [
      { name: "Rounder", code: "R", category: "DAY", startTime: "07:00", endTime: "17:00", dailyCounts: [0, 0, 0, 0, 0, 0, 0], color: "lime" },
    ],
  },
];
