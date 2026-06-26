import type {
  MonthScheduleDTO,
  PhysicianDTO,
  GenerateResultDTO,
  TimeOffDTO,
} from "./api-types";

export async function fetchMonth(
  year: number,
  month: number
): Promise<MonthScheduleDTO> {
  const res = await fetch(`/api/schedule/${year}/${month}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load schedule");
  return res.json();
}

export interface CoverageInput {
  rounderCount?: number;
  dayAdmitCount?: number;
  nightAdmit1Count?: number;
  nightAdmit2Count?: number;
}

export interface CommunityCoverageInput {
  carsonRounderCount?: number;
  eatonRounderCount?: number;
  clintonRounderCount?: number;
}

export async function generateMonth(
  year: number,
  month: number,
  allowOverMax = false,
  coverage?: CoverageInput,
  community?: CommunityCoverageInput
): Promise<GenerateResultDTO> {
  const res = await fetch("/api/schedule/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      year,
      month,
      allowOverMax,
      ...(coverage ?? {}),
      ...(community ?? {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate schedule");
  }
  return res.json();
}

export async function fetchPhysicians(): Promise<PhysicianDTO[]> {
  const res = await fetch("/api/physicians", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load physicians");
  return res.json();
}

export async function fetchTimeOff(physicianId: string): Promise<TimeOffDTO[]> {
  const res = await fetch(`/api/physicians/${physicianId}/time-off`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load time off");
  return res.json();
}

export async function saveTimeOff(
  physicianId: string,
  dates: string[],
  note?: string
): Promise<void> {
  const res = await fetch(`/api/physicians/${physicianId}/time-off`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dates, note }),
  });
  if (!res.ok) throw new Error("Failed to save time off");
}

export async function deleteTimeOff(
  physicianId: string,
  dates: string[]
): Promise<void> {
  const res = await fetch(`/api/physicians/${physicianId}/time-off`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dates }),
  });
  if (!res.ok) throw new Error("Failed to remove time off");
}
