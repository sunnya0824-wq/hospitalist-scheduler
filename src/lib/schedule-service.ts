import type { Prisma, Hospital } from "@prisma/client";
import type { AssignmentDTO } from "./api-types";
import { prisma } from "./prisma";
import {
  generateSlots,
  generateCommunitySlots,
  runScheduler,
  toISODate,
  fromISODate,
  normalizeCoverage,
  normalizeCommunityCoverage,
  DEFAULT_COVERAGE,
  DEFAULT_COMMUNITY_COVERAGE,
  COMMUNITY_HOSPITALS,
  COMMUNITY_COUNT_KEY,
  type CoverageSettings,
  type CommunityCoverage,
  type SchedulerPhysician,
  type ShiftSlot,
  type SchedulerResult,
} from "./scheduler";

/** Load active physicians and shape them for the scheduler engine. */
export async function loadSchedulerPhysicians(): Promise<SchedulerPhysician[]> {
  const physicians = await prisma.physician.findMany({
    include: { availability: true },
    orderBy: { fullName: "asc" },
  });

  return physicians.map((p) => {
    const unavailableDates = new Set<string>();
    const preferredDates = new Set<string>();
    for (const a of p.availability) {
      const iso = toISODate(a.date);
      if (a.type === "UNAVAILABLE") unavailableDates.add(iso);
      else preferredDates.add(iso);
    }
    return {
      id: p.id,
      fullName: p.fullName,
      active: p.active,
      desiredShifts: p.desiredShifts,
      minShifts: p.minShifts,
      maxShifts: p.maxShifts,
      minRounding: p.minRounding,
      maxRounding: p.maxRounding,
      minNights: p.minNights,
      maxNights: p.maxNights,
      minAdmin: p.minAdmin,
      maxAdmin: p.maxAdmin,
      shiftPreference: p.shiftPreference,
      nightEligible: p.nightEligible,
      adminEligible: p.adminEligible,
      eligibleHospitals: new Set<Hospital>([
        ...(p.canWorkCarson ? (["CARSON"] as const) : []),
        ...(p.canWorkEaton ? (["EATON"] as const) : []),
        ...(p.canWorkClinton ? (["CLINTON"] as const) : []),
      ]),
      unavailableDates,
      preferredDates,
    };
  });
}

/**
 * Get or create the ScheduleMonth row for a year/month. When coverage settings
 * are supplied they are persisted (updating an existing row before generation).
 */
export async function getOrCreateMonth(
  year: number,
  month: number,
  coverage?: CoverageSettings,
  community?: CommunityCoverage
) {
  const data = { ...(coverage ?? {}), ...(community ?? {}) };
  return prisma.scheduleMonth.upsert({
    where: { year_month: { year, month } },
    update: data,
    create: { year, month, ...data },
  });
}

/**
 * Generate (or regenerate) a month's schedule. Existing locked or manual
 * assignments are preserved and fed back into the scheduler as fixed slots.
 * Coverage settings, when provided, are saved on the month before generating.
 */
export async function generateSchedule(
  year: number,
  month: number,
  allowOverMax = false,
  coverage?: Partial<CoverageSettings>,
  community?: Partial<CommunityCoverage>
): Promise<SchedulerResult> {
  const settings = coverage ? normalizeCoverage(coverage) : undefined;
  const communitySettings = community
    ? normalizeCommunityCoverage(community)
    : undefined;
  const scheduleMonth = await getOrCreateMonth(
    year,
    month,
    settings,
    communitySettings
  );
  const activeCoverage: CoverageSettings = {
    rounderCount: scheduleMonth.rounderCount,
    dayAdmitCount: scheduleMonth.dayAdmitCount,
    nightAdmit1Count: scheduleMonth.nightAdmit1Count,
    nightAdmit2Count: scheduleMonth.nightAdmit2Count,
  };
  const activeCommunity: CommunityCoverage = {
    carsonRounderCount: scheduleMonth.carsonRounderCount,
    eatonRounderCount: scheduleMonth.eatonRounderCount,
    clintonRounderCount: scheduleMonth.clintonRounderCount,
  };
  const run = await prisma.scheduleGenerationRun.create({
    data: { scheduleMonthId: scheduleMonth.id },
  });

  const physicians = await loadSchedulerPhysicians();

  // Preserve locked + manual assignments from any prior run.
  const existing = await prisma.shiftAssignment.findMany({
    where: { scheduleMonthId: scheduleMonth.id },
  });
  const preserved = new Map<string, (typeof existing)[number]>();
  for (const a of existing) {
    if (a.isLocked || a.isManual) {
      preserved.set(
        slotKey(toISODate(a.date), a.hospital, a.shiftType, a.rounderIndex),
        a
      );
    }
  }

  // Build the slot grid: main hospital + each community hospital's rounders.
  const rawSlots: ShiftSlot[] = [
    ...generateSlots(year, month, activeCoverage),
    ...COMMUNITY_HOSPITALS.flatMap((h) =>
      generateCommunitySlots(year, month, h, activeCommunity[COMMUNITY_COUNT_KEY[h]])
    ),
  ];

  // Seed preserved assignments onto matching slots.
  const slots: ShiftSlot[] = rawSlots.map((slot) => {
    const keep = preserved.get(
      slotKey(slot.date, slot.hospital, slot.shiftType, slot.rounderIndex)
    );
    if (keep) {
      return {
        ...slot,
        physicianId: keep.physicianId,
        isLocked: keep.isLocked,
        isManual: keep.isManual,
      };
    }
    return slot;
  });

  const result = runScheduler(physicians, slots, { allowOverMax });

  // Persist: wipe old auto-generated rows, then recreate the full grid.
  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({
      where: { scheduleMonthId: scheduleMonth.id },
    }),
    prisma.shiftAssignment.createMany({
      data: result.assignments.map((a) => ({
        scheduleMonthId: scheduleMonth.id,
        date: fromISODate(a.date),
        endDate: fromISODate(a.endDate),
        shiftType: a.shiftType,
        hospital: a.hospital,
        rounderIndex: a.rounderIndex,
        startTime: a.startTime,
        endTime: a.endTime,
        physicianId: a.physicianId,
        isManual: a.isManual,
        isLocked: a.isLocked,
        isAutoGenerated: a.isAutoGenerated,
        warnings: a.warnings,
      })),
    }),
    prisma.scheduleMonth.update({
      where: { id: scheduleMonth.id },
      data: { status: "GENERATED", generatedAt: new Date() },
    }),
    prisma.scheduleGenerationRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        success: true,
        warnings: result.warnings,
        summary: {
          fairnessScore: result.fairnessScore,
          stats: result.stats,
        } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return result;
}

/**
 * Read a month's full schedule with physician names attached, plus the most
 * recent generation run summary (stats + warnings). Returns null assignments
 * as an empty array when the month has never been generated.
 */
export async function getMonthSchedule(year: number, month: number) {
  const scheduleMonth = await prisma.scheduleMonth.findUnique({
    where: { year_month: { year, month } },
    include: {
      assignments: {
        include: { physician: { select: { id: true, fullName: true } } },
        orderBy: [{ date: "asc" }, { shiftType: "asc" }, { rounderIndex: "asc" }],
      },
      runs: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });

  if (!scheduleMonth) {
    return {
      year,
      month,
      status: "DRAFT" as const,
      generatedAt: null,
      rounderCount: DEFAULT_COVERAGE.rounderCount,
      dayAdmitCount: DEFAULT_COVERAGE.dayAdmitCount,
      nightAdmit1Count: DEFAULT_COVERAGE.nightAdmit1Count,
      nightAdmit2Count: DEFAULT_COVERAGE.nightAdmit2Count,
      carsonRounderCount: DEFAULT_COMMUNITY_COVERAGE.carsonRounderCount,
      eatonRounderCount: DEFAULT_COMMUNITY_COVERAGE.eatonRounderCount,
      clintonRounderCount: DEFAULT_COMMUNITY_COVERAGE.clintonRounderCount,
      assignments: [] as AssignmentDTO[],
      lastRun: null,
    };
  }

  const assignments: AssignmentDTO[] = scheduleMonth.assignments.map((a) => ({
    id: a.id,
    date: toISODate(a.date),
    endDate: toISODate(a.endDate),
    shiftType: a.shiftType,
    hospital: a.hospital,
    rounderIndex: a.rounderIndex,
    startTime: a.startTime,
    endTime: a.endTime,
    physicianId: a.physicianId,
    physicianName: a.physician?.fullName ?? null,
    isManual: a.isManual,
    isLocked: a.isLocked,
    isAutoGenerated: a.isAutoGenerated,
    warnings: a.warnings,
  }));

  return {
    year,
    month,
    status: scheduleMonth.status,
    generatedAt: scheduleMonth.generatedAt,
    rounderCount: scheduleMonth.rounderCount,
    dayAdmitCount: scheduleMonth.dayAdmitCount,
    nightAdmit1Count: scheduleMonth.nightAdmit1Count,
    nightAdmit2Count: scheduleMonth.nightAdmit2Count,
    carsonRounderCount: scheduleMonth.carsonRounderCount,
    eatonRounderCount: scheduleMonth.eatonRounderCount,
    clintonRounderCount: scheduleMonth.clintonRounderCount,
    assignments,
    lastRun: scheduleMonth.runs[0] ?? null,
  };
}

export type MonthSchedule = Awaited<ReturnType<typeof getMonthSchedule>>;

function slotKey(
  date: string,
  hospital: string,
  shiftType: string,
  rounderIndex: number | null
): string {
  return `${date}|${hospital}|${shiftType}|${rounderIndex ?? 0}`;
}
