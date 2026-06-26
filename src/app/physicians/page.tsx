"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchPhysicians } from "@/lib/client";
import type { PhysicianDTO } from "@/lib/api-types";

type Draft = Partial<PhysicianDTO> & {
  unavailableText?: string;
  preferredText?: string;
};

const EMPTY: Draft = {
  fullName: "",
  active: true,
  desiredShifts: 14,
  minShifts: 11,
  maxShifts: 18,
  minRounding: 0,
  maxRounding: 20,
  minNights: 2,
  maxNights: 8,
  minAdmin: 0,
  maxAdmin: 6,
  shiftPreference: "NEUTRAL",
  nightEligible: true,
  adminEligible: true,
  notes: "",
  unavailableText: "",
  preferredText: "",
};

export default function PhysiciansPage() {
  const now = new Date();
  const [physicians, setPhysicians] = useState<PhysicianDTO[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setPhysicians(await fetchPhysicians());
    } catch {
      setMessage("Could not load physicians. Is the database connected?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const seed = async () => {
    if (!confirm("Seed 20 demo physicians? This replaces all existing data."))
      return;
    setMessage("Seeding…");
    await fetch("/api/seed", { method: "POST" });
    setMessage("Seeded demo data.");
    await load();
  };

  const clearAll = async () => {
    if (
      !confirm(
        "Delete ALL physicians, schedules, and assignments? This cannot be undone."
      )
    )
      return;
    setMessage("Clearing…");
    await fetch("/api/clear-all", { method: "POST" });
    setMessage("All data cleared.");
    await load();
  };

  const startEdit = (p: PhysicianDTO) =>
    setEditing({
      ...p,
      unavailableText: p.unavailableDates.join(", "),
      preferredText: p.preferredDates.join(", "),
    });

  const remove = async (p: PhysicianDTO) => {
    if (
      !confirm(
        `Permanently delete ${p.fullName}? This cannot be undone. To temporarily remove them from scheduling, use "Remove from census" instead.`
      )
    )
      return;
    await fetch(`/api/physicians/${p.id}`, { method: "DELETE" });
    await load();
  };

  const toggleActive = async (p: PhysicianDTO) => {
    await fetch(`/api/physicians/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, active: !p.active }),
    });
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-100 neon-text-cyan">
            Physicians
          </h1>
          <p className="text-sm text-slate-400">
            {physicians.length} in roster · manage targets & eligibility
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditing({ ...EMPTY })}
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)]"
          >
            + Add physician
          </button>
          <button
            onClick={seed}
            className="rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
          >
            Seed demo data
          </button>
          <button
            onClick={clearAll}
            className="rounded-lg border border-rose-400/50 bg-[#0f172a] px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 hover:shadow-[0_0_10px_rgba(244,63,94,0.3)]"
          >
            Clear all data
          </button>
        </div>
      </header>

      {message && (
        <p className="mb-4 rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300">
          {message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#1e293b] bg-[#0f172a]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e293b] text-left text-xs uppercase text-cyan-400/70">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Desired</th>
              <th className="px-4 py-2">Min/Max</th>
              <th className="px-4 py-2">Nights</th>
              <th className="px-4 py-2">Day Admit</th>
              <th className="px-4 py-2">Pref</th>
              <th className="px-4 py-2">Dates</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {physicians.map((p) => (
              <tr key={p.id} className="border-b border-[#1e293b] transition hover:bg-cyan-500/5">
                <td className="px-4 py-2">
                  <span className={`font-medium ${!p.active ? "text-slate-500" : "text-slate-200"}`}>
                    {p.fullName}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {p.active ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      On census
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#1e293b] bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                      Off census
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{p.desiredShifts}</td>
                <td className="px-4 py-2 text-slate-400">
                  {p.minShifts}–{p.maxShifts}
                </td>
                <td className="px-4 py-2">
                  {p.nightEligible ? `${p.minNights}–${p.maxNights}` : "—"}
                </td>
                <td className="px-4 py-2">
                  {p.adminEligible ? `0–${p.maxAdmin}` : "—"}
                </td>
                <td className="px-4 py-2 text-slate-400">{p.shiftPreference}</td>
                <td className="px-4 py-2 text-xs text-slate-400">
                  {p.unavailableDates.length > 0 &&
                    `${p.unavailableDates.length} off`}
                  {p.preferredDates.length > 0 &&
                    ` · ${p.preferredDates.length} pref`}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/physicians/${p.id}?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`}
                    className="mr-2 text-cyan-400 transition hover:text-cyan-300 hover:underline"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => startEdit(p)}
                    className="mr-2 text-cyan-400 transition hover:text-cyan-300 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    className={`mr-2 transition hover:underline ${
                      p.active ? "text-amber-300 hover:text-amber-200" : "text-emerald-400 hover:text-emerald-300"
                    }`}
                    title={
                      p.active
                        ? "Hide from schedule generation; can be restored anytime"
                        : "Restore to scheduling"
                    }
                  >
                    {p.active ? "Remove from census" : "Restore"}
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="text-rose-400 transition hover:text-rose-300 hover:underline"
                    title="Permanently delete this physician record"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && physicians.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No physicians yet. Click{" "}
                  <strong>Seed demo data</strong> to load 20 sample physicians.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <PhysicianForm
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function PhysicianForm({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Draft>(draft);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(form.id);

  const set = (key: keyof Draft, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const parseDates = (text?: string) =>
    (text ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        unavailableDates: parseDates(form.unavailableText),
        preferredDates: parseDates(form.preferredText),
      };
      const url = isEdit ? `/api/physicians/${form.id}` : "/api/physicians";
      const method = isEdit ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const numField = (key: keyof Draft, label: string) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      <input
        type="number"
        value={(form[key] as number) ?? 0}
        onChange={(e) => set(key, Number(e.target.value))}
        className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl border border-cyan-400/30 bg-[#0f172a] p-6 shadow-[0_0_30px_rgba(34,211,238,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">
          {isEdit ? "Edit physician" : "Add physician"}
        </h3>

        <label className="mb-4 block">
          <span className="text-xs font-medium text-slate-300">Full name</span>
          <input
            value={form.fullName ?? ""}
            onChange={(e) => set("fullName", e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            placeholder="Dr. Jane Doe"
          />
        </label>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numField("desiredShifts", "Desired")}
          {numField("minShifts", "Min shifts")}
          {numField("maxShifts", "Max shifts")}
          {numField("minRounding", "Min round")}
          {numField("maxRounding", "Max round")}
          {numField("minNights", "Min nights")}
          {numField("maxNights", "Max nights")}
          {numField("minAdmin", "Min day admit")}
          {numField("maxAdmin", "Max day admit")}
        </div>

        <div className="mb-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.nightEligible ?? false}
              onChange={(e) => set("nightEligible", e.target.checked)}
            />
            Night eligible
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.adminEligible ?? false}
              onChange={(e) => set("adminEligible", e.target.checked)}
            />
            Day admitting eligible
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active ?? false}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            Preference
            <select
              value={form.shiftPreference ?? "NEUTRAL"}
              onChange={(e) => set("shiftPreference", e.target.value)}
              className="rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            >
              <option value="MORE">More</option>
              <option value="NEUTRAL">Neutral</option>
              <option value="FEWER">Fewer</option>
            </select>
          </label>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-300">
              Unavailable dates (YYYY-MM-DD, comma separated)
            </span>
            <textarea
              value={form.unavailableText ?? ""}
              onChange={(e) => set("unavailableText", e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
              placeholder="2026-07-04, 2026-07-05"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-300">
              Preferred dates (YYYY-MM-DD, comma separated)
            </span>
            <textarea
              value={form.preferredText ?? ""}
              onChange={(e) => set("preferredText", e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            />
          </label>
        </div>

        <label className="mb-4 block">
          <span className="text-xs font-medium text-slate-300">Notes</span>
          <input
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#1e293b] px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !form.fullName}
            className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
