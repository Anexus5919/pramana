import { FileStack, ListChecks, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fmtMs, sum } from "../../lib/format";
import { appStatusMeta, CATEGORIES, categoryMeta, humanize, VERIFICATION_STATUSES, verificationMeta } from "../../lib/labels";
import type { Dashboard, RunMetrics } from "../../types";
import { Badge } from "../../ui/Badge";
import { SeverityMeter } from "../../ui/Blocks";
import { cn } from "../../ui/cn";
import { Counter } from "../../ui/Counter";
import { fadeUp, stagger } from "../../ui/motion";
import { appStatusTone, toneClass, verificationTone } from "../../ui/tone";

function Tile({
  label,
  value,
  icon: Icon,
  accent,
  children,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: "brand" | "alert";
  children?: ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span
          aria-hidden
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-[9px]",
            accent === "alert" ? "bg-mismatch-bg text-mismatch-fg" : "bg-brand-soft text-brand-ink",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2 font-display text-3xl leading-none font-semibold tracking-[-0.03em] text-ink">
        <Counter value={value} />
      </div>
      {children && <div className="mt-4 min-w-0 flex-1">{children}</div>}
    </motion.div>
  );
}

/** Category rows drawn as runs of small blocks, one block per open finding. */
function CategoryBlocks({ counts }: { counts: Record<string, number> }) {
  const cats = [...CATEGORIES, ...Object.keys(counts).filter((c) => !(CATEGORIES as readonly string[]).includes(c))].filter(
    (c) => counts[c],
  );
  const max = Math.max(1, ...cats.map((c) => counts[c]));
  const unit = max > 16 ? Math.ceil(max / 16) : 1;
  return (
    <ul className="space-y-1.5">
      {cats.map((c, ci) => (
        <li key={c} className="grid grid-cols-[84px_minmax(0,1fr)_22px] items-center gap-2 text-xs">
          <span className="truncate text-ink-3">{categoryMeta[c]?.short ?? humanize(c)}</span>
          <span className="flex gap-[2px] overflow-hidden" aria-hidden>
            {Array.from({ length: Math.ceil(counts[c] / unit) }, (_, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + ci * 0.05 + i * 0.015, duration: 0.2 }}
                className="size-[7px] shrink-0 rounded-[2px] bg-brand-400"
              />
            ))}
          </span>
          <span className="text-right font-medium text-ink tabular">{counts[c]}</span>
        </li>
      ))}
      {unit > 1 && <li className="pt-1 text-[11px] text-ink-3">One block per {unit} findings</li>}
    </ul>
  );
}

export function KpiTiles({ data, metrics }: { data: Dashboard; metrics?: RunMetrics }) {
  const highOpen = sum(data.applications.map((a) => a.open_high));
  const appsWithHigh = data.applications.filter((a) => a.open_high > 0).length;
  const verTotal = sum(Object.values(data.verification_counts));
  const verified = data.verification_counts.verified ?? 0;
  const flagged = (data.verification_counts.mismatch_detected ?? 0) + (data.verification_counts.expired ?? 0);
  const statuses = Object.entries(data.status_counts).sort((a, b) => b[1] - a[1]);
  const verKeys = [...VERIFICATION_STATUSES].filter((s) => data.verification_counts[s]);

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Applications" value={data.applications.length} icon={FileStack}>
        <div className="flex flex-wrap gap-1.5">
          {statuses.map(([s, n]) => (
            <Badge key={s} tone={appStatusTone(s)} variant="dot">
              <span className="font-semibold text-ink tabular">{n}</span> {appStatusMeta[s]?.label ?? humanize(s)}
            </Badge>
          ))}
        </div>
        {metrics?.mean_seconds != null && (
          <p className="mt-3 text-xs text-ink-3">
            Validation runs take {fmtMs(Math.round(metrics.mean_seconds * 1000))} on average over {metrics.runs} runs.
          </p>
        )}
      </Tile>

      <Tile label="Open findings" value={data.open_findings} icon={ListChecks}>
        <CategoryBlocks counts={data.open_findings_by_category} />
      </Tile>

      <Tile label="High-severity open" value={highOpen} icon={ShieldAlert} accent={highOpen ? "alert" : undefined}>
        <div className="flex items-center gap-2">
          <SeverityMeter severity="high" size="md" />
          <span className="text-sm text-ink-2">
            across <strong className="font-semibold text-ink">{appsWithHigh}</strong> of {data.applications.length} applications
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Critical or high findings still open, acknowledged or awaiting evidence. Each needs a reviewer decision with a recorded
          reason.
        </p>
      </Tile>

      <Tile label="Verification checks" value={verTotal} icon={ShieldCheck}>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Verification outcome mix">
          {verKeys.map((s, i) => (
            <motion.span
              key={s}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.3 + i * 0.06, duration: 0.5 }}
              className={cn("h-full origin-left border-r-2 border-surface last:border-r-0", toneClass[verificationTone(s)].dot)}
              style={{ width: `${(data.verification_counts[s] / Math.max(1, verTotal)) * 100}%` }}
              title={`${verificationMeta[s].label}: ${data.verification_counts[s]}`}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-2">
          <strong className="font-semibold text-verified-fg">{verified} verified</strong>
          {flagged ? (
            <>
              , <strong className="font-semibold text-mismatch-fg">{flagged} mismatched or expired</strong>
            </>
          ) : null}
        </p>
      </Tile>
    </motion.div>
  );
}
