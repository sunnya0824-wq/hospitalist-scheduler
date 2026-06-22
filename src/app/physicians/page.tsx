"use client";

import { useEffect, useState } from "react";
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
    if (!confirm(`Delete ${p.fullName}?`)) return;
    await fetch(`/api/physicians/${p.id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Physicians</h1>
          <p className="text-sm text-slate-500">
            {physicians.length} in roster · manage targets & eligibility
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditing({ ...EMPTY })}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Add physician
          </button>
          <button
            onClick={seed}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Seed demo data
          </button>
          <button
            onClick={clearAll}
            className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            Clear all data
          </button>
        </div>
      </header>

      {message && (
        <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          {message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Desired</th>
              <th className="px-4 py-2">Min/Max</th>
              <th className="px-4 py-2">Nights</th>
              <th className="px-4 py-2">Admin</th>
              <th className="px-4 py-2">Pref</th>
              <th className="px-4 py-2">Dates</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {physicians.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="px-4 py-2">
                  <span className="font-medium">{p.fullName}</span>
                  {!p.active && (
                    <span className="ml-2 text-xs text-slate-400">
                      inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{p.desiredShifts}</td>
                <td className="px-4 py-2 text-slate-500">
                  {p.minShifts}–{p.maxShifts}
                </td>
                <td className="px-4 py-2">
                  {p.nightEligible ? `${p.minNights}–${p.maxNights}` : "—"}
                </td>
                <td className="px-4 py-2">
                  {p.adminEligible ? `0–${p.maxAdmin}` : "—"}
                </td>
                <td className="px-4 py-2 text-slate-500">{p.shiftPreference}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {p.unavailableDates.length > 0 &&
                    `${p.unavailableDates.length} off`}
                  {p.preferredDates.length > 0 &&
                    ` · ${p.preferredDates.length} pref`}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => startEdit(p)}
                    className="mr-2 text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="text-rose-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && physicians.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
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
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        value={(form[key] as number) ?? 0}
        onChange={(e) => set(key, Number(e.target.value))}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">
          {isEdit ? "Edit physician" : "Add physician"}
        </h3>

        <label className="mb-4 block">
          <span className="text-xs font-medium text-slate-600">Full name</span>
          <input
            value={form.fullName ?? ""}
            onChange={(e) => set("fullName", e.target.value)}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
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
          {numField("minAdmin", "Min admin")}
          {numField("maxAdmin", "Max admin")}
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
            Admin eligible
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
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="MORE">More</option>
              <option value="NEUTRAL">Neutral</option>
              <option value="FEWER">Fewer</option>
            </select>
          </label>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Unavailable dates (YYYY-MM-DD, comma separated)
            </span>
            <textarea
              value={form.unavailableText ?? ""}
              onChange={(e) => set("unavailableText", e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              placeholder="2026-07-04, 2026-07-05"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              Preferred dates (YYYY-MM-DD, comma separated)
            </span>
            <textarea
              value={form.preferredText ?? ""}
              onChange={(e) => set("preferredText", e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        </div>

        <label className="mb-4 block">
          <span className="text-xs font-medium text-slate-600">Notes</span>
          <input
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !form.fullName}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
