import type { MonthScheduleDTO, PhysicianDTO } from "./api-types";

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
): Promise<void> {
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
}

export async function fetchPhysicians(): Promise<PhysicianDTO[]> {
  const res = await fetch("/api/physicians", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load physicians");
  return res.json();
}
