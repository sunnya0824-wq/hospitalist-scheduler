import type { Prisma } from "@prisma/client";
import type { AssignmentDTO, MonthCoverageDTO, MonthScheduleDTO, RunDTO } from "./api-types";
import { prisma } from "./prisma";
import {
  generateSlots,
  runScheduler,
  toISODate,
  fromISODate,
  utcDate,
  addDaysISO,
  daysInMonth,
  normalizeOverrides,
  templateKeyOf,
  slotKey,
  type CoverageOverrides,
  type SchedulerPhysician,
  type ShiftSlot,
  type SchedulerResult,
  type PriorShift,
} from "./scheduler";
import { getLocations, getRules, getSettings, getHolidayMap, toTemplateDefs } from "./config";

/** Load physicians and shape them for the scheduler engine. */
export async function loadSchedulerPhysicians(): Promise<SchedulerPhysician[]> {
  const [physicians, openLocations] = await Promise.all([
    prisma.physician.findMany({
      include: { availability: true, timeOffRequests: true, locations: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.location.findMany({ where: { openToAll: true }, select: { id: true } }),
  ]);
  const openIds = openLocations.map((l) => l.id);

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
      fteMultiplier: Number(p.fteMultiplier),
      monthlyShiftTarget: p.monthlyShiftTarget,
      maxConsecutiveDays: p.maxConsecutiveDays,
      maxConsecutiveNights: p.maxConsecutiveNights,
      preferredNightBlock: p.preferredNightBlock,
      eligibleLocations: new Set([...openIds, ...p.locations.map((l) => l.locationId)]),
      unavailableDates,
      preferredDates,
      timeOffDates: new Set(p.timeOffRequests.map((t) => toISODate(t.date))),
      prefersNights: p.prefersNights,
      avoidsNights: p.avoidsNights,
      prefersWeekends: p.prefersWeekends,
      avoidsWeekends: p.avoidsWeekends,
      prefersDayAdmit: p.prefersDayAdmit,
      avoidsDayAdmit: p.avoidsDayAdmit,
      avoidWeekdays: parseAvoidWeekdays(p.avoidWeekdays),
      maxNightsPerMonth: p.maxNightsPerMonth,
      maxWeekendsPerMonth: p.maxWeekendsPerMonth,
    };
  });
}

/** Convert stored avoidWeekdays Json ({ "0": true, … }) into a Set. */
function parseAvoidWeekdays(raw: unknown): Set<number> {
  const out = new Set<number>();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const dow = Number(key);
      if (value === true && Number.isInteger(dow) && dow >= 0 && dow <= 6) out.add(dow);
    }
  }
  return out;
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: toISODate(utcDate(year, month, 1)),
    end: toISODate(utcDate(year, month, daysInMonth(year, month))),
  };
}

/**
 * Shifts in the days before a date that still constrain it: rest after a
 * night block, block length, and days-in-a-row all look back.
 */
export async function loadPriorShifts(beforeISO: string, lookbackDays = 21): Promise<PriorShift[]> {
  const start = fromISODate(addDaysISO(beforeISO, -lookbackDays));
  const rows = await prisma.shiftAssignment.findMany({
    where: { date: { gte: start, lt: fromISODate(beforeISO) }, physicianId: { not: null } },
    select: { physicianId: true, date: true, endDate: true, category: true },
  });
  return rows.map((r) => ({
    physicianId: r.physicianId!,
    date: toISODate(r.date),
    endDate: toISODate(r.endDate),
    category: r.category,
  }));
}

/**
 * Generate (or regenerate) a month. Locked and manually edited slots are kept
 * and fed back in as fixed. When `overrides` is given it replaces the month's
 * saved coverage overrides first.
 */
export async function generateSchedule(
  year: number,
  month: number,
  allowOverMax = false,
  overrides?: CoverageOverrides
): Promise<SchedulerResult> {
  const scheduleMonth = await prisma.scheduleMonth.upsert({
    where: { year_month: { year, month } },
    update: overrides ? { coverageOverrides: normalizeOverrides(overrides) } : {},
    create: { year, month, coverageOverrides: normalizeOverrides(overrides ?? {}) },
  });
  const activeOverrides = normalizeOverrides(scheduleMonth.coverageOverrides);
  const run = await prisma.scheduleGenerationRun.create({ data: { scheduleMonthId: scheduleMonth.id } });

  const { start, end } = monthRange(year, month);
  const [physicians, locations, rules, priorShifts, existing] = await Promise.all([
    loadSchedulerPhysicians(),
    getLocations(),
    getRules(start, end),
    loadPriorShifts(start),
    prisma.shiftAssignment.findMany({ where: { scheduleMonthId: scheduleMonth.id } }),
  ]);

  // Locked + manual assignments from a prior run, keyed by slot.
  const preserved = new Map<string, (typeof existing)[number]>();
  for (const a of existing) {
    if ((a.isLocked || a.isManual) && a.physicianId) {
      preserved.set(slotKey(toISODate(a.date), templateKeyOf(a), a.slotIndex), a);
    }
  }

  const templates = toTemplateDefs(locations);
  const slots: ShiftSlot[] = generateSlots(year, month, templates, rules.holidays, activeOverrides).map((slot) => {
    const keep = preserved.get(slotKey(slot.date, slot.shiftTemplateId, slot.slotIndex));
    if (!keep) return slot;
    preserved.delete(slotKey(slot.date, slot.shiftTemplateId, slot.slotIndex));
    return { ...slot, physicianId: keep.physicianId, isLocked: keep.isLocked, isManual: keep.isManual };
  });

  const result = runScheduler(physicians, slots, { allowOverMax, priorShifts, rules });

  // Locked/manual slots whose template no longer needs them this month.
  for (const orphan of preserved.values()) {
    result.warnings.push(
      `${toISODate(orphan.date)} ${orphan.locationName} ${orphan.shiftName}: locked assignment dropped because that slot no longer exists`
    );
  }

  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { scheduleMonthId: scheduleMonth.id } }),
    prisma.shiftAssignment.createMany({
      data: result.assignments.map((a) => ({
        scheduleMonthId: scheduleMonth.id,
        date: fromISODate(a.date),
        endDate: fromISODate(a.endDate),
        shiftTemplateId: a.shiftTemplateId,
        locationId: a.locationId,
        shiftName: a.shiftName,
        shiftCode: a.shiftCode,
        category: a.category,
        locationName: a.locationName,
        locationCode: a.locationCode,
        color: a.color,
        slotIndex: a.slotIndex,
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
          fairnessBreakdown: result.fairnessBreakdown,
          stats: result.stats,
        } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return result;
}

/** Coverage rows (defaults + this month's overrides) for every active template. */
async function monthCoverage(overridesRaw: unknown): Promise<MonthCoverageDTO[]> {
  const overrides = normalizeOverrides(overridesRaw);
  const locations = await getLocations();
  const rows: MonthCoverageDTO[] = [];
  for (const l of locations) {
    if (!l.active) continue;
    for (const t of l.templates) {
      if (!t.active) continue;
      rows.push({
        templateId: t.id,
        locationId: l.id,
        locationName: l.name,
        name: t.name,
        code: t.code,
        category: t.category,
        dailyCounts: t.dailyCounts,
        holidayCount: t.holidayCount,
        color: t.color,
        override: t.id in overrides ? overrides[t.id] : null,
      });
    }
  }
  return rows;
}

/** A month's schedule with names attached, coverage, holidays and the last run. */
export async function getMonthSchedule(year: number, month: number): Promise<MonthScheduleDTO> {
  const { start, end } = monthRange(year, month);
  const [scheduleMonth, holidays, settings, locationRows] = await Promise.all([
    prisma.scheduleMonth.findUnique({
      where: { year_month: { year, month } },
      include: {
        assignments: {
          include: { physician: { select: { id: true, fullName: true } } },
          orderBy: [{ date: "asc" }, { slotIndex: "asc" }],
        },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
      },
    }),
    getHolidayMap(start, end),
    getSettings(),
    prisma.location.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  const locations = locationRows.map((l) => ({ id: l.id, name: l.name, code: l.code, sortOrder: l.sortOrder }));
  const common = { year, month, holidays, weekendDays: settings.weekendDays, locations };

  if (!scheduleMonth) {
    return {
      ...common,
      status: "DRAFT",
      generatedAt: null,
      coverage: await monthCoverage({}),
      assignments: [],
      lastRun: null,
    };
  }

  const assignments: AssignmentDTO[] = scheduleMonth.assignments.map((a) => ({
    id: a.id,
    date: toISODate(a.date),
    endDate: toISODate(a.endDate),
    shiftTemplateId: a.shiftTemplateId,
    locationId: a.locationId,
    shiftName: a.shiftName,
    shiftCode: a.shiftCode,
    category: a.category,
    locationName: a.locationName,
    locationCode: a.locationCode,
    color: a.color,
    slotIndex: a.slotIndex,
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
    ...common,
    status: scheduleMonth.status,
    generatedAt: scheduleMonth.generatedAt?.toISOString() ?? null,
    coverage: await monthCoverage(scheduleMonth.coverageOverrides),
    assignments,
    lastRun: (scheduleMonth.runs[0] as unknown as RunDTO) ?? null,
  };
}

export type MonthSchedule = MonthScheduleDTO;
