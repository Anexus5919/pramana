import clsx from "clsx";
import { FileText, ListChecks, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { toneClass } from "../../components/ui/tone";
import { fmtMs, sum } from "../../lib/format";
import { CATEGORIES, appStatusMeta, categoryMeta, humanize, VERIFICATION_STATUSES, verificationMeta } from "../../lib/labels";
import type { Dashboard, RunMetrics } from "../../types";
import { StatusBar } from "../shared/Summaries";

function Tile({
  label,
  value,
  icon,
  children,
  accent,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  children?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span aria-hidden className={clsx("text-subtle-fg", accent)}>
          {icon}
        </span>
      </div>
      <div className="mt-1.5 text-[28px] leading-none font-semibold tracking-tight text-fg tabular-nums">{value}</div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function KpiTiles({ data, metrics }: { data: Dashboard; metrics?: RunMetrics }) {
  const highOpen = sum(data.applications.map((a) => a.open_high));
  const verTotal = sum(Object.values(data.verification_counts));
  const catMax = Math.max(1, ...Object.values(data.open_findings_by_category));
  const statuses = Object.entries(data.status_counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Applications" value={data.applications.length} icon={<FileText className="size-4" />}>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {statuses.map(([s, n]) => (
            <li key={s}>
              <span className="font-semibold text-fg tabular-nums">{n}</span> {appStatusMeta[s]?.label ?? humanize(s)}
            </li>
          ))}
        </ul>
        {metrics?.mean_seconds != null && (
          <p className="mt-1.5 text-xs text-subtle-fg">
            Mean validation run {fmtMs(Math.round(metrics.mean_seconds * 1000))} over {metrics.runs} runs
          </p>
        )}
      </Tile>

      <Tile label="Open findings" value={data.open_findings} icon={<ListChecks className="size-4" />}>
        <ul className="space-y-1">
          {CATEGORIES.filter((c) => data.open_findings_by_category[c]).map((c) => (
            <li key={c} className="grid grid-cols-[96px_1fr_24px] items-center gap-2 text-xs">
              <span className="truncate text-muted">{categoryMeta[c].label.replace("Cross-application ", "")}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-subtle">
                <span
                  className="block h-full origin-left animate-grow rounded-full bg-primary/70"
                  style={{ width: `${(data.open_findings_by_category[c] / catMax) * 100}%` }}
                />
              </span>
              <span className="text-right font-medium text-fg tabular-nums">{data.open_findings_by_category[c]}</span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile
        label="High-severity open"
        value={highOpen}
        icon={<ShieldAlert className="size-4" />}
        accent={highOpen ? "text-sev-high-bg" : undefined}
      >
        <p className="text-xs leading-relaxed text-muted">
          Critical or high findings still open, acknowledged or awaiting evidence. Each needs a reviewer decision with a
          recorded reason.
        </p>
      </Tile>

      <Tile label="Verification outcomes" value={verTotal} icon={<ShieldCheck className="size-4" />}>
        <StatusBar counts={data.verification_counts} />
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
          {VERIFICATION_STATUSES.filter((s) => data.verification_counts[s]).map((s) => (
            <li key={s} className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className={clsx("size-2 shrink-0 rounded-full", toneClass[verificationMeta[s].tone].dot)} />
              <span className="truncate text-muted">{verificationMeta[s].label}</span>
              <span className="ml-auto font-medium text-fg tabular-nums">{data.verification_counts[s]}</span>
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  );
}
