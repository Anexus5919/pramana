import { motion } from "motion/react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { fmtDateTime, fmtRelative } from "../../lib/format";
import { roleLabel } from "../../lib/labels";
import type { AuditEvent } from "../../types";
import { cn } from "../../ui/cn";
import { middleTruncate } from "../../ui/Digest";
import { dur, ease } from "../../ui/motion";
import { Tooltip } from "../../ui/Tooltip";
import { actionLabel, family, familyColor, type LinkState } from "./chain";

function detailText(v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (Array.isArray(v)) return v.length ? v.map(detailText).join(", ") : "none";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return /^[0-9a-f]{40,}$/i.test(s) ? middleTruncate(s, 8, 6) : s;
}

function HashChip({ value, lit, label }: { value: string; lit: boolean; label: string }) {
  return (
    <Tooltip content={<span className="font-mono break-all">{value}</span>}>
      <span
        tabIndex={0}
        aria-label={`${label} ${value}`}
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-[6px] border px-1.5 font-mono text-[11px] transition-[background-color,border-color,color,box-shadow] duration-200",
          lit ? "border-brand-400 bg-brand-soft text-brand-ink shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-400)_22%,transparent)]" : "border-line bg-surface-2 text-ink-3",
        )}
      >
        <span className="font-sans text-[10px] font-semibold tracking-[0.06em] text-ink-4 uppercase">{label}</span>
        {value.slice(0, 10)}
      </span>
    </Tooltip>
  );
}

export interface EventRowProps {
  e: AuditEvent;
  index: number;
  hovered: number | null;
  onHover: (seq: number | null) => void;
  /** Non-zero token replays a one-off highlight after a jump from the chain strip */
  flash: number;
  check: LinkState | undefined;
  official: boolean;
}

/** One chained event; hovering lights its prev_hash and the previous event's hash so the link is visible. */
export const EventRow = memo(function EventRow({ e, index, hovered, onHover, flash, check, official }: EventRowProps) {
  const fam = family(e.action);
  const details = Object.entries(e.details ?? {}).slice(0, 5);
  const selfLit = hovered === e.seq;
  const nextLit = hovered === e.seq + 1;
  return (
    <motion.li
      id={`audit-${e.seq}`}
      initial={index < 16 ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index < 16 ? index * 0.025 : 0, duration: dur.ui, ease: ease.out }}
      onPointerEnter={() => onHover(e.seq)}
      onPointerLeave={() => onHover(null)}
      className={cn(
        "relative grid scroll-mt-28 grid-cols-[44px_minmax(0,1fr)] gap-x-3 px-4 py-3.5 transition-colors duration-200 sm:px-5",
        selfLit || nextLit ? "bg-surface-2/70" : "",
      )}
    >
      {flash > 0 && (
        <motion.span
          key={flash}
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 0.35, duration: 1.4, ease: ease.out }}
          className="pointer-events-none absolute inset-0 bg-brand-soft ring-2 ring-brand-400/60 ring-inset"
        />
      )}
      <div className="relative flex flex-col items-center">
        <span
          className={cn(
            "relative z-[1] inline-flex h-7 min-w-9 items-center justify-center rounded-[6px] px-1 font-mono text-[11px] font-semibold text-white tabular",
            check === "hash" || check === "link" ? "ring-2 ring-mismatch-dot ring-offset-2 ring-offset-surface" : "",
          )}
          style={{ background: familyColor[fam] ?? "var(--ink-3)" }}
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] rounded-t-[6px] bg-white/30" />
          {e.seq}
        </span>
        <span aria-hidden className={cn("mt-1 w-px flex-1 transition-colors duration-200", selfLit ? "bg-brand-400" : "bg-line")} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-ink">{actionLabel(e.action)}</span>
            <span className="font-mono text-[11px] text-ink-4">{e.action}</span>
          </div>
          <Tooltip content={fmtDateTime(e.ts)}>
            <time tabIndex={0} dateTime={e.ts} className="shrink-0 text-xs text-ink-3 tabular">
              {fmtRelative(e.ts) || fmtDateTime(e.ts)}
            </time>
          </Tooltip>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <span>
            <span className="font-medium text-ink-2">{e.actor}</span>
            {e.actor_role && e.actor_role !== "system" && <span>, {roleLabel[e.actor_role] ?? e.actor_role}</span>}
          </span>
          {e.object_id && (
            <>
              <span className="text-ink-4">on</span>
              <span className="min-w-0 truncate font-mono text-[11px] text-ink-2">
                {e.object_type} {e.object_id}
              </span>
            </>
          )}
          {e.application_id && e.application_id !== e.object_id && (
            <>
              <span className="text-ink-4">in</span>
              {official ? (
                <Link to={`/applications/${encodeURIComponent(e.application_id)}`} className="font-mono text-[11px] text-brand-ink underline-offset-2 hover:underline">
                  {e.application_id}
                </Link>
              ) : (
                <span className="font-mono text-[11px]">{e.application_id}</span>
              )}
            </>
          )}
          {e.application_id && e.application_id === e.object_id && official && (
            <Link to={`/applications/${encodeURIComponent(e.application_id)}`} className="text-[11px] text-brand-ink underline-offset-2 hover:underline">
              Open application
            </Link>
          )}
        </div>
        {details.length > 0 && (
          <dl className="mt-2 flex flex-wrap gap-1.5">
            {details.map(([k, v]) => (
              <div key={k} className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[11px]">
                <dt className="shrink-0 text-ink-4">{k.replace(/_/g, " ")}</dt>
                <dd className="min-w-0 truncate font-mono text-ink-2" title={typeof v === "string" ? v : undefined}>
                  {detailText(v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <HashChip value={e.prev_hash} lit={selfLit} label="prev" />
          <span aria-hidden className={cn("text-xs transition-colors", selfLit ? "text-brand-500" : "text-ink-4")}>
            then
          </span>
          <HashChip value={e.hash} lit={nextLit} label="hash" />
          {check === "hash" && <span className="text-xs font-semibold text-mismatch-fg">Stored hash does not match its content</span>}
          {check === "link" && <span className="text-xs font-semibold text-mismatch-fg">Does not point at the previous event</span>}
        </div>
      </div>
    </motion.li>
  );
});
