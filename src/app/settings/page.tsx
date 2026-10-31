"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Card, CardHeader } from "@/components/Card";
import {
  createHoliday,
  createLocation,
  deleteHoliday,
  fetchConfig,
  fetchHolidays,
  saveSettings,
  updateLocation,
} from "@/lib/client";
import type { ConfigDTO, SettingsDTO } from "@/lib/api-types";
import { WEEKDAY_SHORT } from "@/lib/shift-style";
import { LocationCard, locationDailyAverage } from "@/components/settings/LocationCard";
import {
  BlurInput,
  DANGER_BTN,
  GHOST_BTN,
  HELP,
  INPUT,
  LABEL,
  PRIMARY_BTN,
  StatusText,
  Toggle,
  fmtSlots,
  moveItem,
  parseIntIn,
  useStatus,
} from "@/components/settings/ui";

/** Built-in US federal holidays (keys match the server's holiday rules). */
const FEDERAL_HOLIDAYS: { key: string; name: string }[] = [
  { key: "NEW_YEAR", name: "New Year's Day" },
  { key: "MLK", name: "Martin Luther King Jr. Day" },
  { key: "PRESIDENTS", name: "Presidents' Day" },
  { key: "MEMORIAL", name: "Memorial Day" },
  { key: "JUNETEENTH", name: "Juneteenth" },
  { key: "INDEPENDENCE", name: "Independence Day" },
  { key: "LABOR", name: "Labor Day" },
  { key: "COLUMBUS", name: "Columbus Day / Indigenous Peoples' Day" },
  { key: "VETERANS", name: "Veterans Day" },
  { key: "THANKSGIVING", name: "Thanksgiving Day" },
  { key: "CHRISTMAS", name: "Christmas Day" },
];

/** "2026-11-26" → "Thu, Nov 26" (or with year). */
function fmtDate(iso: string, withYear = false): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setConfig(await fetchConfig());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your organization, scheduling rules, locations, shifts and holidays. Changes save automatically when you
          leave a field.
        </p>
      </header>

      {loadError && (
        <p className="mb-4 rounded-lg border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {loadError}{" "}
          <button type="button" onClick={reload} className="underline">
            Try again
          </button>
        </p>
      )}

      {!config ? (
        !loadError && <p className="text-sm text-slate-500">Loading settings…</p>
      ) : (
        <div className="space-y-6">
          <OrganizationSection settings={config.settings} onSaved={reload} />
          <RulesSection settings={config.settings} onSaved={reload} />
          <LocationsSection config={config} reload={reload} />
          <HolidaysSection config={config} reload={reload} />
        </div>
      )}
    </div>
  );
}

// --- Organization ----------------------------------------------------------

function OrganizationSection({ settings, onSaved }: { settings: SettingsDTO; onSaved: () => Promise<void> }) {
  const { status, run, fail } = useStatus();
  return (
    <Card>
      <CardHeader title="Organization" action={<StatusText status={status} />} />
      <label className={LABEL} htmlFor="org-name">
        Organization name
      </label>
      <BlurInput
        id="org-name"
        value={settings.organizationName}
        maxLength={120}
        onCommit={async (v) => {
          if (!v.trim()) {
            fail("Organization name can't be blank.");
            return false;
          }
          const ok = await run(() => saveSettings({ organizationName: v.trim() }));
          await onSaved();
          return ok;
        }}
      />
    </Card>
  );
}

// --- Scheduling rules ------------------------------------------------------

function RulesSection({ settings, onSaved }: { settings: SettingsDTO; onSaved: () => Promise<void> }) {
  const { status, run, fail } = useStatus();

  const save = async (body: Partial<SettingsDTO>) => {
    const ok = await run(() => saveSettings(body));
    await onSaved();
    return ok;
  };

  const toggleWeekend = (d: number) => {
    const set = new Set(settings.weekendDays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    save({ weekendDays: [...set].sort((a, b) => a - b) });
  };

  return (
    <Card>
      <CardHeader title="Scheduling rules" action={<StatusText status={status} />} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="rest-days">
            Rest days after nights
          </label>
          <BlurInput
            id="rest-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={7}
            className={`${INPUT} max-w-[8rem]`}
            value={String(settings.restDaysAfterNights)}
            onCommit={(v) => {
              const n = parseIntIn(v, 0, 7);
              if (n === null) {
                fail("Rest days must be a whole number from 0 to 7.");
                return false;
              }
              return save({ restDaysAfterNights: n });
            }}
          />
          <p className={HELP}>Days off after a run of nights ends.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="night-block">
            Preferred night block length
          </label>
          <BlurInput
            id="night-block"
            type="number"
            inputMode="numeric"
            min={1}
            max={14}
            className={`${INPUT} max-w-[8rem]`}
            value={String(settings.preferredNightBlock)}
            onCommit={(v) => {
              const n = parseIntIn(v, 1, 14);
              if (n === null) {
                fail("Night block length must be a whole number from 1 to 14.");
                return false;
              }
              return save({ preferredNightBlock: n });
            }}
          />
          <p className={HELP}>
            Nights are grouped into blocks of about this many. Individual physicians can override this.
          </p>
        </div>
        <div className="sm:col-span-2">
          <span className={LABEL}>Weekend days</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Weekend days">
            {WEEKDAY_SHORT.map((label, d) => {
              const on = settings.weekendDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleWeekend(d)}
                  className={`min-h-[44px] min-w-[3.25rem] rounded-full border px-3 text-sm transition md:min-h-[32px] ${
                    on
                      ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                      : "border-slate-700 bg-[#0f172a] text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className={HELP}>Used for weekend fairness and weekend preferences.</p>
        </div>
      </div>
    </Card>
  );
}

// --- Locations & shifts ----------------------------------------------------

function LocationsSection({ config, reload }: { config: ConfigDTO; reload: () => Promise<void> }) {
  const { status, run, fail } = useStatus();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [openToAll, setOpenToAll] = useState(true);
  const [busy, setBusy] = useState(false);

  const locations = [...config.locations].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const total = locations.filter((l) => l.active).reduce((s, l) => s + locationDailyAverage(l), 0);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return fail("Enter a location name.");
    setBusy(true);
    const ok = await run(
      () => createLocation({ name: name.trim(), code: code.trim().toUpperCase() || undefined, openToAll, active: true }),
      "Location added"
    );
    setBusy(false);
    if (ok) {
      setName("");
      setCode("");
      setOpenToAll(true);
    }
    await reload();
  };

  return (
    <Card>
      <CardHeader
        title="Locations & shifts"
        subtitle={
          locations.length
            ? `About ${fmtSlots(total)} slots/day to fill across all active locations`
            : undefined
        }
        action={<StatusText status={status} />}
      />

      <div className="space-y-4">
        {locations.length === 0 && (
          <div className="rounded-xl border border-dashed border-cyan-900/60 p-6 text-center">
            <p className="text-sm font-medium text-slate-200">Add your first hospital or site</p>
            <p className="mt-1 text-xs text-slate-500">
              Each location gets its own shift types (day, admitting, night) and staffing numbers.
            </p>
          </div>
        )}

        {locations.map((loc, i) => (
          <LocationCard
            key={loc.id}
            loc={loc}
            index={i}
            count={locations.length}
            run={run}
            fail={fail}
            reload={reload}
            onMove={async (dir) => {
              await run(() => moveItem(locations, i, dir, (id, sortOrder) => updateLocation(id, { sortOrder })), "Order saved");
              await reload();
            }}
          />
        ))}

        <form onSubmit={add} className="rounded-xl border border-dashed border-cyan-900/60 bg-cyan-950/10 p-3 sm:p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Add a location</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className={LABEL} htmlFor="new-loc-name">
                Name
              </label>
              <input
                id="new-loc-name"
                className={INPUT}
                value={name}
                maxLength={80}
                placeholder="e.g. Main Hospital"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="new-loc-code">
                Short code
              </label>
              <input
                id="new-loc-code"
                className={INPUT}
                value={code}
                maxLength={8}
                placeholder="Optional, e.g. MAIN"
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-2">
            <Toggle
              checked={openToAll}
              onChange={setOpenToAll}
              label="Open to all physicians"
              description="If off, only physicians you tick on their profile can work here."
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" className={PRIMARY_BTN} disabled={busy}>
              {busy ? "Adding…" : "+ Add location"}
            </button>
          </div>
        </form>
      </div>
    </Card>
  );
}

// --- Holidays --------------------------------------------------------------

function HolidaysSection({ config, reload }: { config: ConfigDTO; reload: () => Promise<void> }) {
  const { settings, customHolidays } = config;
  const { status, run, fail } = useStatus();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [yearText, setYearText] = useState(() => String(new Date().getFullYear()));
  const [preview, setPreview] = useState<{ date: string; name: string }[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [hName, setHName] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);

  // Refresh the preview whenever the year or any holiday setting changes.
  useEffect(() => {
    let cancelled = false;
    setPreviewError(null);
    fetchHolidays(year)
      .then((h) => !cancelled && setPreview(h))
      .catch((e) => !cancelled && setPreviewError(e instanceof Error ? e.message : "Failed to load holidays"));
    return () => {
      cancelled = true;
    };
  }, [year, config]);

  const goYear = (y: number) => {
    setYear(y);
    setYearText(String(y));
  };

  const save = async (body: Partial<SettingsDTO>) => {
    await run(() => saveSettings(body));
    await reload();
  };

  const toggleHoliday = (key: string, on: boolean) => {
    const set = new Set(settings.disabledHolidays);
    if (on) set.delete(key);
    else set.add(key);
    save({ disabledHolidays: [...set] });
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Pick a date for the holiday.");
    if (!hName.trim()) return fail("Give the holiday a name.");
    setBusy(true);
    const ok = await run(() => createHoliday({ date, name: hName.trim(), recurring }), "Holiday added");
    setBusy(false);
    if (ok) {
      setDate("");
      setHName("");
      setRecurring(false);
    }
    await reload();
  };

  const federalOn = settings.observeUSFederalHolidays;

  return (
    <Card>
      <CardHeader
        title="Holidays"
        subtitle="Holidays can use different staffing numbers and count toward holiday fairness."
        action={<StatusText status={status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <div>
            <Toggle
              checked={federalOn}
              onChange={(v) => save({ observeUSFederalHolidays: v })}
              label="Observe US federal holidays"
            />
            <Toggle
              checked={settings.includeObservedHolidays}
              disabled={!federalOn}
              onChange={(v) => save({ includeObservedHolidays: v })}
              label="Also count the observed weekday when a holiday falls on a weekend"
              description="e.g. when July 4 is a Saturday, Friday July 3 is treated as a holiday too."
            />
          </div>

          <fieldset disabled={!federalOn} className={federalOn ? "" : "opacity-50"}>
            <legend className={LABEL}>Which federal holidays</legend>
            <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {FEDERAL_HOLIDAYS.map((h) => (
                <li key={h.key}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-300 md:min-h-[32px]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-cyan-400"
                      checked={!settings.disabledHolidays.includes(h.key)}
                      onChange={(e) => toggleHoliday(h.key, e.target.checked)}
                    />
                    {h.name}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div>
            <h3 className={LABEL}>Your own holidays</h3>
            {customHolidays.length === 0 ? (
              <p className="text-xs text-slate-500">None yet.</p>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
                {customHolidays.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm text-slate-200">{h.name}</p>
                      <p className="text-xs text-slate-500">
                        {h.recurring
                          ? `Every year on ${new Date(`${h.date}T00:00:00Z`).toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              timeZone: "UTC",
                            })}`
                          : fmtDate(h.date, true)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`${DANGER_BTN} md:py-1 md:text-xs`}
                      onClick={async () => {
                        if (!confirm(`Remove "${h.name}"? Past schedules are kept as they are.`)) return;
                        await run(() => deleteHoliday(h.id), "Holiday removed");
                        await reload();
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={add} className="mt-3 rounded-lg border border-dashed border-cyan-900/60 bg-cyan-950/10 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
                <div>
                  <label className={LABEL} htmlFor="new-hol-date">
                    Date
                  </label>
                  <input
                    id="new-hol-date"
                    type="date"
                    className={INPUT}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL} htmlFor="new-hol-name">
                    Name
                  </label>
                  <input
                    id="new-hol-name"
                    className={INPUT}
                    value={hName}
                    maxLength={80}
                    placeholder="e.g. Day after Thanksgiving"
                    onChange={(e) => setHName(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-300 md:min-h-0">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-cyan-400"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                  />
                  Repeats every year
                </label>
                <button type="submit" className={PRIMARY_BTN} disabled={busy}>
                  {busy ? "Adding…" : "+ Add holiday"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-slate-400">Holidays in</h3>
            <div className="flex items-center gap-1">
              <button type="button" className={GHOST_BTN} onClick={() => goYear(year - 1)} aria-label="Previous year">
                ‹
              </button>
              <input
                aria-label="Year"
                type="number"
                inputMode="numeric"
                className={`${INPUT} w-24 text-center`}
                value={yearText}
                onChange={(e) => setYearText(e.target.value)}
                onBlur={() => {
                  const n = parseIntIn(yearText, 1900, 9999);
                  if (n === null) setYearText(String(year));
                  else setYear(n);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <button type="button" className={GHOST_BTN} onClick={() => goYear(year + 1)} aria-label="Next year">
                ›
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#0a0e1a]/60">
            {previewError ? (
              <p className="p-3 text-sm text-rose-300">{previewError}</p>
            ) : !preview ? (
              <p className="p-3 text-sm text-slate-500">Loading…</p>
            ) : preview.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No holidays observed in {year}.</p>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {preview.map((h) => (
                  <li key={`${h.date}-${h.name}`} className="flex flex-wrap justify-between gap-x-3 px-3 py-2 text-sm">
                    <span className="text-slate-200">{h.name}</span>
                    <span className="tabular-nums text-slate-400">{fmtDate(h.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
