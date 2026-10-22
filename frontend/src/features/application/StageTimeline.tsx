import clsx from "clsx";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtMs, sum } from "../../lib/format";
import { humanize, PIPELINE_STAGES, stageLabel } from "../../lib/labels";
import type { Stage } from "../../types";

function stageInfo(s: Stage): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(s)) {
    if (k === "stage" || k === "ms" || v === null || v === undefined) continue;
    parts.push(`${humanize(k).toLowerCase()} ${String(v)}`);
  }
  return parts.join(", ");
}

export function StageTimeline({ stages }: { stages: Stage[] }) {
  if (!stages.length) return <p className="text-sm text-subtle-fg">No stage timings recorded for this run.</p>;
  const max = Math.max(1, ...stages.map((s) => s.ms));
  const total = sum(stages.map((s) => s.ms));
  return (
    <div>
      <ol className="space-y-2">
        {stages.map((s, i) => (
          <li key={`${s.stage}-${i}`} className="grid grid-cols-[18px_150px_minmax(0,1fr)_64px] items-center gap-2.5">
            <CircleCheck aria-hidden className="size-4 text-verified-dot" />
            <span className="truncate text-sm text-fg">{stageLabel[s.stage] ?? humanize(s.stage)}</span>
            <span className="min-w-0">
              <span className="block h-2 overflow-hidden rounded-full bg-subtle">
                <span
                  className="block h-full origin-left animate-grow rounded-full bg-primary/75"
                  style={{ width: `${Math.max(2, (s.ms / max) * 100)}%`, animationDelay: `${i * 70}ms` }}
                />
              </span>
              {stageInfo(s) && <span className="mt-0.5 block truncate text-[11px] text-subtle-fg">{stageInfo(s)}</span>}
            </span>
            <span className="text-right text-xs font-medium text-muted tabular-nums">{fmtMs(s.ms)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-line pt-2 text-right text-xs text-muted">
        Total server time <span className="font-semibold text-fg tabular-nums">{fmtMs(total)}</span>
      </p>
    </div>
  );
}

export function RunProgress({ title = "Validation run in progress" }: { title?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - t0), 100);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-pending-dot/30 bg-pending-bg/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-pending-fg">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {title}
        </p>
        <span className="text-xs font-medium text-pending-fg tabular-nums">{(elapsed / 1000).toFixed(1)} s</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        The server runs these stages in order. Exact timings for each stage are shown when the run completes.
      </p>
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {PIPELINE_STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-2 rounded-md bg-surface/80 px-2.5 py-1.5 text-xs text-fg">
            <span className="font-mono text-[10px] text-subtle-fg">{i + 1}</span>
            <span className="flex-1 truncate">{stageLabel[s]}</span>
            <span className="relative h-1 w-12 overflow-hidden rounded-full bg-subtle" aria-hidden>
              <span
                className={clsx("absolute inset-y-0 w-1/2 animate-shimmer rounded-full bg-pending-dot/70")}
                style={{ animationDelay: `${i * 160}ms` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
