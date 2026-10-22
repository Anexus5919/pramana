import clsx from "clsx";
import type { ReactNode } from "react";
import { SeverityChip } from "../../components/ui/Badge";
import { toneClass } from "../../components/ui/tone";
import { SEVERITIES, VERIFICATION_STATUSES, verificationMeta } from "../../lib/labels";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-subtle-fg">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SeverityChips({ bySeverity, empty = "None" }: { bySeverity: Record<string, number>; empty?: string }) {
  const entries = SEVERITIES.filter((s) => (bySeverity[s] ?? 0) > 0);
  if (!entries.length) return <span className="text-xs text-subtle-fg">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map((s) => (
        <SeverityChip key={s} severity={s} count={bySeverity[s]} />
      ))}
    </span>
  );
}

export function countStatuses(statusMap: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of Object.values(statusMap)) out[s] = (out[s] ?? 0) + 1;
  return out;
}

export function VerificationMix({ counts, empty = "Not run" }: { counts: Record<string, number>; empty?: string }) {
  const keys = [...VERIFICATION_STATUSES, ...Object.keys(counts).filter((k) => !(k in verificationMeta))].filter(
    (k) => (counts[k] ?? 0) > 0,
  );
  if (!keys.length) return <span className="text-xs text-subtle-fg">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {keys.map((k) => {
        const m = verificationMeta[k];
        const t = toneClass[m?.tone ?? "unchecked"];
        return (
          <span
            key={k}
            title={`${m?.label ?? k}: ${counts[k]}`}
            className={clsx("inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums", t.pill)}
          >
            <span aria-hidden className={clsx("size-1.5 rounded-full", t.dot)} />
            <span className="sr-only">{m?.label ?? k}</span>
            {counts[k]}
          </span>
        );
      })}
    </span>
  );
}

export function StatusBar({ counts, className }: { counts: Record<string, number>; className?: string }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <div className={clsx("h-2 rounded-full bg-subtle", className)} />;
  const keys = [...VERIFICATION_STATUSES, ...Object.keys(counts).filter((k) => !(k in verificationMeta))];
  return (
    <div className={clsx("flex h-2 overflow-hidden rounded-full bg-subtle", className)} aria-hidden>
      {keys
        .filter((k) => (counts[k] ?? 0) > 0)
        .map((k) => (
          <div
            key={k}
            className={clsx("h-full origin-left animate-grow", toneClass[verificationMeta[k]?.tone ?? "unchecked"].dot)}
            style={{ width: `${(counts[k] / total) * 100}%` }}
          />
        ))}
    </div>
  );
}
