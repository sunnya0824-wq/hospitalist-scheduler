import type { ReactNode } from "react";

/** Shared secondary-button treatment for export/utility actions. */
export const SECONDARY_BTN =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-900/50 bg-slate-900/40 text-cyan-300 text-xs uppercase tracking-wide hover:border-cyan-400/60 hover:text-cyan-200 hover:shadow-[0_0_12px_rgba(34,211,238,0.25)] transition";

const CARD_BASE =
  "rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm shadow-[0_0_0_1px_rgba(34,211,238,0.04),0_8px_24px_rgba(0,0,0,0.4)]";
const CARD_HOVER =
  "transition hover:border-cyan-900/60 hover:shadow-[0_0_24px_rgba(34,211,238,0.1)]";

/** Unified surface card used across the app. */
export function Card({
  children,
  className = "",
  hover = false,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padded?: boolean;
}) {
  return (
    <div
      className={`${CARD_BASE} ${hover ? CARD_HOVER : ""} ${
        padded ? "p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Section heading with a cyan square marker and optional subtitle. */
export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          <span className="inline-block h-2 w-2 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
