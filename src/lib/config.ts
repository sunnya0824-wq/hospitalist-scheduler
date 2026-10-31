/**
 * Organization configuration: settings, locations, shift templates and
 * holidays, loaded from the database and shaped for the scheduler.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  holidaysInRange,
  normalizeDailyCounts,
  toISODate,
  type HolidayConfig,
  type SchedulerRules,
  type ShiftTemplateDef,
} from "./scheduler";
import type { ConfigDTO, LocationDTO, SettingsDTO, ShiftTemplateDTO } from "./api-types";

/** The settings row, created with defaults on first use. */
export async function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

type SettingsRow = Awaited<ReturnType<typeof getSettings>>;

export function settingsToDTO(s: SettingsRow): SettingsDTO {
  return {
    organizationName: s.organizationName,
    restDaysAfterNights: s.restDaysAfterNights,
    preferredNightBlock: s.preferredNightBlock,
    weekendDays: [...s.weekendDays].sort(),
    observeUSFederalHolidays: s.observeUSFederalHolidays,
    includeObservedHolidays: s.includeObservedHolidays,
    disabledHolidays: s.disabledHolidays,
  };
}

const locationInclude = {
  shiftTemplates: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
} satisfies Prisma.LocationInclude;

type LocationRow = Prisma.LocationGetPayload<{ include: typeof locationInclude }>;

function templateToDTO(t: LocationRow["shiftTemplates"][number]): ShiftTemplateDTO {
  return {
    id: t.id,
    locationId: t.locationId,
    name: t.name,
    code: t.code,
    category: t.category,
    startTime: t.startTime,
    endTime: t.endTime,
    dailyCounts: normalizeDailyCounts(t.dailyCounts, 0),
    holidayCount: t.holidayCount,
    color: t.color,
    sortOrder: t.sortOrder,
    active: t.active,
  };
}

export function locationToDTO(l: LocationRow): LocationDTO {
  return {
    id: l.id,
    name: l.name,
    code: l.code,
    sortOrder: l.sortOrder,
    active: l.active,
    openToAll: l.openToAll,
    templates: l.shiftTemplates.map(templateToDTO),
  };
}

export async function getLocations(): Promise<LocationDTO[]> {
  const rows = await prisma.location.findMany({
    include: locationInclude,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(locationToDTO);
}

export async function getCustomHolidays() {
  const rows = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  return rows.map((h) => ({ id: h.id, date: toISODate(h.date), name: h.name, recurring: h.recurring }));
}

export async function getHolidayConfig(settings?: SettingsRow): Promise<HolidayConfig> {
  const s = settings ?? (await getSettings());
  const custom = await getCustomHolidays();
  return {
    observeUSFederalHolidays: s.observeUSFederalHolidays,
    includeObservedHolidays: s.includeObservedHolidays,
    disabledHolidays: s.disabledHolidays,
    custom,
  };
}

/** Holidays in a date range as a plain object (ISO date → name). */
export async function getHolidayMap(startISO: string, endISO: string): Promise<Record<string, string>> {
  const map = holidaysInRange(startISO, endISO, await getHolidayConfig());
  return Object.fromEntries(map);
}

/** Active templates at active locations, flattened for the engine. */
export function toTemplateDefs(locations: LocationDTO[]): ShiftTemplateDef[] {
  const defs: ShiftTemplateDef[] = [];
  for (const l of locations) {
    if (!l.active) continue;
    for (const t of l.templates) {
      if (!t.active) continue;
      defs.push({
        id: t.id,
        locationId: l.id,
        locationName: l.name,
        locationCode: l.code,
        locationSort: l.sortOrder,
        name: t.name,
        code: t.code,
        category: t.category,
        startTime: t.startTime,
        endTime: t.endTime,
        dailyCounts: t.dailyCounts,
        holidayCount: t.holidayCount,
        color: t.color,
        sortOrder: t.sortOrder,
      });
    }
  }
  return defs;
}

/** Engine rules for a date range (holidays computed for that range). */
export async function getRules(startISO: string, endISO: string): Promise<SchedulerRules> {
  const s = await getSettings();
  const holidays = holidaysInRange(startISO, endISO, await getHolidayConfig(s));
  return {
    restDaysAfterNights: s.restDaysAfterNights,
    preferredNightBlock: s.preferredNightBlock,
    weekendDays: new Set(s.weekendDays),
    holidays: new Set(holidays.keys()),
  };
}

/** Everything the Settings page needs in one call. */
export async function getConfig(): Promise<ConfigDTO> {
  const [settings, locations, customHolidays] = await Promise.all([
    getSettings(),
    getLocations(),
    getCustomHolidays(),
  ]);
  return { settings: settingsToDTO(settings), locations, customHolidays };
}
