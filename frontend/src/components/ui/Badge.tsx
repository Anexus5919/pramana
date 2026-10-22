import clsx from "clsx";
import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import {
  appStatusMeta,
  evidenceClassMeta,
  humanize,
  outcomeMeta,
  reviewStatusMeta,
  severityRank,
  type Tone,
  verificationMeta,
} from "../../lib/labels";
import { evidenceLevelClass, severityClass, toneClass } from "./tone";

export function Pill({
  tone,
  children,
  dot = true,
  className,
  title,
}: {
  tone: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  const t = toneClass[tone];
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        t.pill,
        className,
      )}
    >
      {dot && <span aria-hidden className={clsx("size-1.5 shrink-0 rounded-full", t.dot)} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const m = verificationMeta[status] ?? { label: humanize(status), tone: "unchecked" as Tone, meaning: "" };
  return (
    <Pill tone={m.tone} className={className} title={m.meaning}>
      {m.label}
    </Pill>
  );
}

export function OutcomePill({ outcome }: { outcome: string }) {
  const m = outcomeMeta[outcome] ?? { label: humanize(outcome), tone: "unchecked" as Tone };
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

export function ReviewStatusPill({ status }: { status: string }) {
  const m = reviewStatusMeta[status] ?? { label: humanize(status), tone: "unchecked" as Tone };
  return (
    <Pill tone={m.tone} dot={false} className="ring-1 ring-current/15 ring-inset">
      {m.label}
    </Pill>
  );
}

export function AppStatusBadge({ status }: { status: string }) {
  const m = appStatusMeta[status] ?? { label: humanize(status), tone: "unchecked" as Tone };
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

function SeverityBars({ severity }: { severity: string }) {
  const level = 4 - Math.min(severityRank[severity] ?? 4, 4);
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 shrink-0">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 2.6}
          y={8 - i * 2.4}
          width="1.8"
          height={2 + i * 2.4}
          rx="0.4"
          fill="currentColor"
          opacity={i < level ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}

export function SeverityChip({ severity, count, className }: { severity: string; count?: number; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] leading-4 font-semibold tracking-wide uppercase whitespace-nowrap",
        severityClass[severity] ?? severityClass.info,
        className,
      )}
      title={`Severity: ${severity}`}
    >
      <SeverityBars severity={severity} />
      {severity}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </span>
  );
}

export function EvidenceClassBadge({ evidenceClass, className }: { evidenceClass: string; className?: string }) {
  const m = evidenceClassMeta[evidenceClass];
  const level = m?.level ?? 7;
  return (
    <span
      title={m ? `${m.label} evidence: ${m.meaning}` : evidenceClass}
      className={clsx(
        "inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap",
        evidenceLevelClass[level],
        className,
      )}
    >
      <span aria-hidden className="font-mono text-[10px] opacity-75">
        E{level}
      </span>
      {m?.label ?? humanize(evidenceClass)}
    </span>
  );
}

export function SimulatedBadge({ label = "SIMULATED", title }: { label?: "SIMULATED" | "DEMO"; title?: string }) {
  return (
    <span
      title={
        title ??
        (label === "DEMO"
          ? "Checked against a prototype DEMO trust anchor, not India PKI."
          : "From a SIMULATED source. No real issuer was contacted.")
      }
      className="inline-flex items-center gap-1 rounded-[5px] border border-dashed border-unavail-dot bg-unavail-bg px-1.5 py-px text-[10px] leading-4 font-bold tracking-wider text-unavail-fg"
    >
      <FlaskConical aria-hidden className="size-3" />
      {label}
    </span>
  );
}

export function Tag({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-[5px] border border-line bg-subtle px-1.5 py-px text-[11px] leading-4 font-medium text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={clsx("rounded bg-subtle px-1 py-px font-mono text-[12px] text-fg", className)}>{children}</code>
  );
}
