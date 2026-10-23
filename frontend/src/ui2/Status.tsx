import type { ReactNode } from "react";
import {
  appStatusMeta,
  evidenceClassMeta,
  humanize,
  outcomeMeta,
  reviewStatusMeta,
  verificationMeta,
  type Tone,
} from "../lib/labels";
import { cn } from "../ui/cn";
import { toneClass } from "../ui/tone";

export interface StatusBadgeProps {
  tone: Tone;
  children: ReactNode;
  /** Plain-language meaning, exposed as the native tooltip */
  title?: string;
  className?: string;
}

/**
 * The single status style: a soft tinted label with a 6px dot. Text always carries
 * the meaning, so colour is never the only signal. One badge per row or header.
 */
export function StatusBadge({ tone, children, title, className }: StatusBadgeProps) {
  const t = toneClass[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium whitespace-nowrap",
        t.bg,
        t.fg,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ApplicationStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = appStatusMeta[status];
  return (
    <StatusBadge tone={m?.tone ?? "unchecked"} className={className}>
      {m?.label ?? humanize(status)}
    </StatusBadge>
  );
}

export function VerificationBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const m = status ? verificationMeta[status] : undefined;
  return (
    <StatusBadge tone={m?.tone ?? "unchecked"} title={m?.meaning} className={className}>
      {m?.label ?? (status ? humanize(status) : "Not checked")}
    </StatusBadge>
  );
}

export function ReviewBadge({ status, className }: { status: string; className?: string }) {
  const m = reviewStatusMeta[status];
  return (
    <StatusBadge tone={m?.tone ?? "unchecked"} className={className}>
      {m?.label ?? humanize(status)}
    </StatusBadge>
  );
}

/** Rule outcome in checklist language: Met, Not met, Could not decide, Not applicable. */
export const RULE_OUTCOME_LABEL: Record<string, string> = {
  pass: "Met",
  fail: "Not met",
  insufficient_evidence: "Could not decide",
  not_applicable: "Not applicable",
  error: "Error",
};

export function RuleOutcomeBadge({ outcome, className }: { outcome: string; className?: string }) {
  return (
    <StatusBadge tone={outcomeMeta[outcome]?.tone ?? "unchecked"} className={className}>
      {RULE_OUTCOME_LABEL[outcome] ?? humanize(outcome)}
    </StatusBadge>
  );
}

const SEV_LEVEL: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const SEV_COLOR: Record<string, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
  info: "bg-sev-info",
};

export interface SeverityIndicatorProps {
  severity: string;
  /** Show the word next to the bars (default). Hide only in dense columns with a header that says "Severity". */
  showLabel?: boolean;
  className?: string;
}

/** Four ascending bars, filled by level, plus the word. Info shows empty bars. */
export function SeverityIndicator({ severity, showLabel = true, className }: SeverityIndicatorProps) {
  const level = SEV_LEVEL[severity] ?? 0;
  const label = humanize(severity);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-ink-2", className)} title={showLabel ? undefined : `Severity: ${label}`}>
      <span aria-hidden className="inline-flex h-3 items-end gap-[2px]">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn("w-[3px] rounded-[1px]", i <= level ? SEV_COLOR[severity] : "bg-line-2")}
            style={{ height: `${4 + i * 2}px` }}
          />
        ))}
      </span>
      {showLabel ? <span>{label}</span> : <span className="sr-only">Severity: {label}</span>}
    </span>
  );
}

/** Evidence class as quiet text: "E2 Issuer". The definition is in the native tooltip. */
export function EvidenceClassLabel({ cls, showName = true, className }: { cls: string; showName?: boolean; className?: string }) {
  const m = evidenceClassMeta[cls];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-ink-3", className)} title={m ? `${m.label}: ${m.meaning}` : undefined}>
      <span className="font-mono font-medium text-ink-2">E{m?.level ?? "?"}</span>
      {showName && <span>{m?.label ?? humanize(cls)}</span>}
    </span>
  );
}

/** Required label for anything that comes from the issuer simulator. */
export function SimulatedTag({ className }: { className?: string }) {
  return (
    <span
      title="Comes from the issuer simulator, not a live registry"
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[4px] border border-dashed border-line-2 px-1.5 text-xs leading-none font-medium tracking-wide text-ink-3 uppercase",
        className,
      )}
    >
      Simulated
    </span>
  );
}
