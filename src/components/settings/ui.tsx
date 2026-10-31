"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

/** Shared form styles for the Settings page. */
export const INPUT =
  "w-full min-w-0 rounded-md border border-[#1e293b] bg-[#0a0e1a] px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 disabled:opacity-50 [color-scheme:dark]";
export const LABEL = "mb-1 block text-xs font-medium text-slate-400";
export const HELP = "mt-1 text-xs text-slate-500";
export const PRIMARY_BTN =
  "min-h-[44px] rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 hover:shadow-[0_0_14px_rgba(34,211,238,0.5)] disabled:opacity-50 md:min-h-0";
export const GHOST_BTN =
  "min-h-[44px] rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 disabled:opacity-50 md:min-h-0";
export const DANGER_BTN =
  "min-h-[44px] rounded-lg border border-rose-400/50 bg-[#0f172a] px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 hover:shadow-[0_0_10px_rgba(244,63,94,0.3)] disabled:opacity-50 md:min-h-0";
export const ICON_BTN =
  "inline-flex h-11 w-11 items-center justify-center rounded-md border border-[#1e293b] bg-[#0f172a] text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-30 md:h-8 md:w-8";

export type Status = { kind: "saving" | "saved" | "error"; text: string } | null;

/**
 * Per-section save status. `run` executes a save, shows "Saving…", then
 * "Saved" (auto-clears) or the server's error text (stays until next save).
 */
export function useStatus() {
  const [status, setStatus] = useState<Status>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(async (fn: () => Promise<unknown>, saved = "Saved"): Promise<boolean> => {
    clearTimeout(timer.current);
    setStatus({ kind: "saving", text: "Saving…" });
    try {
      await fn();
      setStatus({ kind: "saved", text: saved });
      timer.current = setTimeout(() => setStatus(null), 2500);
      return true;
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
      return false;
    }
  }, []);

  const fail = useCallback((text: string) => {
    clearTimeout(timer.current);
    setStatus({ kind: "error", text });
  }, []);

  return { status, run, fail };
}

export function StatusText({ status }: { status: Status }) {
  return (
    <span
      aria-live="polite"
      className={`text-xs ${
        status?.kind === "error"
          ? "text-rose-300"
          : status?.kind === "saved"
            ? "text-emerald-300"
            : "text-slate-400"
      }`}
    >
      {status?.kind === "saved" ? `✓ ${status.text}` : status?.text ?? ""}
    </span>
  );
}

type BlurInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur"> & {
  value: string;
  /** Called on blur / Enter when the value changed. Return false to revert. */
  onCommit: (v: string) => Promise<boolean> | boolean;
  onDraftChange?: (v: string) => void;
};

/** Text/number input that saves when it loses focus (or on Enter). */
export function BlurInput({ value, onCommit, onDraftChange, className, ...rest }: BlurInputProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = async () => {
    if (draft === value) return;
    const ok = await onCommit(draft);
    if (!ok) {
      setDraft(value);
      onDraftChange?.(value);
    }
  };

  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onDraftChange?.(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className ?? INPUT}
    />
  );
}

/** Accessible on/off switch with a label and optional explanation. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-[44px] items-start gap-3 py-1 md:min-h-0 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
          checked
            ? "border-cyan-400/70 bg-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
            : "border-slate-700 bg-slate-800"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition ${
            checked ? "translate-x-6 bg-cyan-300" : "translate-x-1 bg-slate-500"
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-slate-200">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

/**
 * Move items[index] up or down and renumber sortOrder 0..n-1, saving only the
 * items whose position changed.
 */
export async function moveItem<T extends { id: string; sortOrder: number }>(
  items: T[],
  index: number,
  dir: -1 | 1,
  save: (id: string, sortOrder: number) => Promise<unknown>
): Promise<void> {
  const target = index + dir;
  if (target < 0 || target >= items.length) return;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  await Promise.all(next.map((it, i) => (it.sortOrder === i ? null : save(it.id, i))));
}

/** Format a slot average: whole numbers as-is, otherwise one decimal. */
export function fmtSlots(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Parse a whole number within [min, max]; null if invalid. */
export function parseIntIn(v: string, min: number, max: number): number | null {
  if (!/^\s*\d+\s*$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}
