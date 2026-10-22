import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { fmtMs } from "../lib/format";
import { evidenceClassMeta, humanize, verificationMeta } from "../lib/labels";
import { cn } from "./cn";
import { dur, ease } from "./motion";
import { toneClass, verificationTone, type Tone } from "./tone";
import { Tooltip } from "./Tooltip";

/* ---------- StatusCube ---------- */

function CubeFaces({ color }: { color: string }) {
  return (
    <>
      <path d="M10 1 19 6 10 11 1 6Z" style={{ fill: `color-mix(in oklab, ${color} 42%, white)` }} />
      <path d="M1 6 10 11 10 21 1 16Z" style={{ fill: color }} />
      <path d="M19 6 10 11 10 21 19 16Z" style={{ fill: `color-mix(in oklab, ${color} 70%, black)` }} />
    </>
  );
}

export interface StatusCubeProps {
  /** A verification status code; mapped through lib/labels tones */
  status?: string | null;
  /** Use a tone directly instead of a status */
  tone?: Tone;
  size?: number;
  /** Show the status label next to the cube */
  label?: boolean | ReactNode;
  /** Wrap in a tooltip with the status meaning */
  explain?: boolean;
  className?: string;
}

/** Isometric cube in the status colour; a change of status cross-fades the faces. */
export function StatusCube({ status, tone, size = 14, label = false, explain = false, className }: StatusCubeProps) {
  const t = tone ?? verificationTone(status);
  const meta = status ? verificationMeta[status] : undefined;
  const text = label === true ? (meta?.label ?? humanize(status)) : label || null;
  const color = toneClass[t].color;
  const key = `${t}-${status ?? ""}`;

  const cube = (
    <span
      className={cn("inline-grid shrink-0 [&>*]:col-start-1 [&>*]:row-start-1", className)}
      style={{ width: size, height: size * 1.1 }}
      role={text ? undefined : "img"}
      aria-label={text ? undefined : (meta?.label ?? humanize(status) ?? t)}
    >
      <AnimatePresence initial={false}>
        <motion.svg
          key={key}
          viewBox="0 0 20 22"
          width={size}
          height={size * 1.1}
          aria-hidden
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: dur.ui, ease: ease.out }}
        >
          <CubeFaces color={color} />
        </motion.svg>
      </AnimatePresence>
    </span>
  );

  const body = text ? (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {cube}
      <span className="truncate">{text}</span>
    </span>
  ) : (
    cube
  );

  return explain && meta ? <Tooltip content={<><b className="font-semibold">{meta.label}.</b> {meta.meaning}</>}>{body}</Tooltip> : body;
}

export interface StatusPillProps {
  status: string;
  /** Override the label from lib/labels */
  label?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
  explain?: boolean;
  className?: string;
}

/** Verification status pill: cube plus label on the status tint. */
export function StatusPill({ status, label, tone, size = "sm", explain = true, className }: StatusPillProps) {
  const t = tone ?? verificationTone(status);
  const meta = verificationMeta[status];
  const pill = (
    <motion.span
      layout="position"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-200",
        size === "sm" ? "h-6 pr-2.5 pl-2 text-xs" : "h-7 pr-3 pl-2.5 text-sm",
        toneClass[t].bg,
        toneClass[t].fg,
        className,
      )}
    >
      <StatusCube status={status} tone={t} size={size === "sm" ? 11 : 13} />
      <span className="truncate">{label ?? meta?.label ?? humanize(status)}</span>
    </motion.span>
  );
  return explain && meta ? <Tooltip content={meta.meaning}>{pill}</Tooltip> : pill;
}

/** A row of cubes summarising a status mix, e.g. per-document verification outcomes. */
export function CubeStrip({
  statuses,
  max = 12,
  size = 12,
  className,
}: {
  statuses: string[];
  max?: number;
  size?: number;
  className?: string;
}) {
  const order = Object.keys(verificationMeta);
  const sorted = [...statuses].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const shown = sorted.slice(0, max);
  const extra = sorted.length - shown.length;
  const counts: Record<string, number> = {};
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  const summary = Object.entries(counts)
    .map(([s, n]) => `${n} ${verificationMeta[s]?.label.toLowerCase() ?? humanize(s)}`)
    .join(", ");
  if (!statuses.length) return <span className="text-xs text-ink-3">Not run</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-[3px]", className)} role="img" aria-label={summary}>
      {shown.map((s, i) => (
        <StatusCube key={i} status={s} size={size} />
      ))}
      {extra > 0 && <span className="ml-1 text-xs text-ink-3 tabular">+{extra}</span>}
    </span>
  );
}

/* ---------- SeverityMeter ---------- */

const SEV_FILL: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const SEV_CLASS: Record<string, string> = {
  critical: "fill-sev-critical",
  high: "fill-sev-high",
  medium: "fill-sev-medium",
  low: "fill-sev-low",
  info: "fill-sev-info",
};

export interface SeverityMeterProps {
  severity: string | null | undefined;
  /** Show the severity word next to the meter */
  label?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Four blocks rising left to right; the filled count encodes severity. */
export function SeverityMeter({ severity, label = false, size = "sm", className }: SeverityMeterProps) {
  const sev = severity && severity in SEV_FILL ? severity : "info";
  const filled = SEV_FILL[sev];
  const h = size === "sm" ? 14 : 18;
  const w = size === "sm" ? 22 : 28;
  const bw = size === "sm" ? 4 : 5;
  const gap = (w - bw * 4) / 3;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Severity: ${humanize(sev)}`}
        className="shrink-0 overflow-visible"
      >
        {[0, 1, 2, 3].map((i) => {
          const bh = h * (0.4 + i * 0.2);
          const x = i * (bw + gap);
          const y = h - bh;
          const on = i < filled;
          return (
            <g key={i}>
              <rect
                x={x + 0.5}
                y={y + 0.5}
                width={bw - 1}
                height={bh - 1}
                rx={1.2}
                className={cn(
                  "transition-[fill,stroke] duration-200",
                  on ? SEV_CLASS[sev] : "fill-transparent",
                  on ? "stroke-transparent" : sev === "info" ? "stroke-sev-info" : "stroke-line-2",
                )}
                strokeWidth={1}
              />
              {on && <rect x={x} y={y} width={bw} height={1.6} rx={0.8} className="fill-white/45" />}
            </g>
          );
        })}
      </svg>
      {label && <span className="text-xs font-medium text-ink-2 capitalize">{sev}</span>}
    </span>
  );
}

/* ---------- BlockProgress ---------- */

export type BlockState = "done" | "current" | "failed" | "pending";

export interface BlockStage {
  key: string;
  label: string;
  state: BlockState;
  /** Real duration in ms, when known */
  ms?: number;
}

export interface BlockProgressProps {
  stages: BlockStage[];
  showLabels?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** One block per pipeline stage: done fills, current shimmers, failed turns mismatch. */
export function BlockProgress({ stages, showLabels = false, size = "md", className }: BlockProgressProps) {
  const done = stages.filter((s) => s.state === "done").length;
  const current = stages.find((s) => s.state === "current");
  return (
    <div
      className={cn("w-full", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={stages.length}
      aria-valuenow={done}
      aria-valuetext={current ? `${current.label}, ${done} of ${stages.length} stages done` : `${done} of ${stages.length} stages done`}
    >
      <div className={cn("grid gap-1.5", showLabels && "gap-2")} style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => (
          <div key={s.key} className="min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: dur.ui, ease: ease.out }}
              className={cn(
                "relative overflow-hidden rounded-[4px] transition-colors duration-300",
                size === "sm" ? "h-2" : "h-3",
                s.state === "done" && "bg-brand-500",
                s.state === "current" && "bg-brand-200",
                s.state === "failed" && "bg-mismatch-dot",
                s.state === "pending" && "bg-surface-3",
              )}
            >
              {s.state === "done" && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-white/35" />}
              {s.state === "current" && <span aria-hidden className="absolute inset-0 shimmer-bg animate-shimmer" />}
            </motion.div>
            {showLabels && (
              <div className="mt-1.5 min-w-0">
                <div
                  className={cn(
                    "truncate text-xs font-medium",
                    s.state === "failed" ? "text-mismatch-fg" : s.state === "pending" ? "text-ink-4" : "text-ink-2",
                  )}
                  title={s.label}
                >
                  {s.label}
                </div>
                {s.ms !== undefined && <div className="font-mono text-[11px] text-ink-3">{fmtMs(s.ms)}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- EvidenceClassChip ---------- */

const EV_BG = ["bg-ev-1", "bg-ev-2", "bg-ev-3", "bg-ev-4", "bg-ev-5", "bg-ev-6", "bg-ev-7"];
const EV_FG = [
  "text-white dark:text-pupil",
  "text-white dark:text-pupil",
  "text-white dark:text-pupil",
  "text-white dark:text-pupil",
  "text-white dark:text-pupil",
  "text-pupil",
  "text-pupil",
];
const MAY_VERIFY = new Set(["cryptographic", "issuer"]);

export interface EvidenceClassChipProps {
  cls: string;
  /** Show the class name after the rung block */
  showName?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Trust-ladder rung (E1 strongest to E7 weakest) in its ev colour, with a definition tooltip. */
export function EvidenceClassChip({ cls, showName = true, size = "sm", className }: EvidenceClassChipProps) {
  const meta = evidenceClassMeta[cls];
  const level = meta?.level ?? 7;
  const name = meta?.label ?? humanize(cls);
  const tip = (
    <span className="block">
      <span className="mb-0.5 block font-semibold">
        E{level} {name}
      </span>
      <span className="block opacity-85">{meta?.meaning ?? "Unclassified evidence."}</span>
      <span className="mt-1 block opacity-70">
        {MAY_VERIFY.has(cls) ? "Strong enough to say verified." : "Cannot say verified on its own."}
      </span>
    </span>
  );
  return (
    <Tooltip content={tip}>
      <span
        tabIndex={0}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[6px] border border-line bg-surface pr-2 font-medium text-ink-2",
          size === "sm" ? "h-6 text-xs" : "h-7 text-sm",
          !showName && "pr-0 border-transparent bg-transparent",
          className,
        )}
        aria-label={`Evidence class E${level}, ${name}`}
      >
        <span
          className={cn(
            "relative inline-flex h-full items-center justify-center overflow-hidden rounded-[5px] font-mono text-[10.5px] font-semibold",
            size === "sm" ? "min-w-7 px-1" : "min-w-8 px-1.5",
            EV_BG[level - 1],
            EV_FG[level - 1],
          )}
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-white/30" />
          E{level}
        </span>
        {showName && <span className="truncate">{name}</span>}
      </span>
    </Tooltip>
  );
}
