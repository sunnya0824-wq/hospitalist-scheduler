import { prisma } from "@/lib/prisma";
import { toISODate, addDaysISO, SHIFT_LABELS } from "@/lib/scheduler";
import { HOSPITAL_LABELS } from "@/lib/scheduler/shifts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Personal calendar feed for a physician (subscribe by token). Emits all-day
 * VEVENTs for shifts from 30 days ago through the end of next month, across
 * every hospital. Built inline — no ICS library.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const physician = await prisma.physician.findUnique({
    where: { icsToken: params.token },
    select: { id: true, fullName: true },
  });
  if (!physician) {
    return new Response("Calendar feed not found.", { status: 404 });
  }

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - 30);
  // End of next month (exclusive upper bound = first day two months ahead).
  const windowEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)
  );

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      physicianId: physician.id,
      date: { gte: windowStart, lt: windowEnd },
    },
    orderBy: { date: "asc" },
  });

  const stamp = icsDateTime(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hospitalist Scheduler//Physician Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(physician.fullName)} — Shifts`,
  ];

  for (const a of assignments) {
    const start = toISODate(a.date);
    // All-day DTEND is exclusive; a night ending the next morning spans to
    // endDate + 1, day shifts span a single day.
    const endExclusive = addDaysISO(toISODate(a.endDate), 1);
    const label =
      a.shiftType === "ROUNDER" && a.rounderIndex
        ? `Rounder ${a.rounderIndex}`
        : SHIFT_LABELS[a.shiftType];
    const summary = `${label} @ ${HOSPITAL_LABELS[a.hospital]}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}@hospitalist-scheduler`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(start)}`,
      `DTEND;VALUE=DATE:${compactDate(endExclusive)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(`${a.startTime}–${a.endTime}`)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${physician.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

/** YYYY-MM-DD → YYYYMMDD for all-day DATE values. */
function compactDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** UTC timestamp in iCalendar form: YYYYMMDDTHHMMSSZ. */
function icsDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape characters with special meaning in ICS text values. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
