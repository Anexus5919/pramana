import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Equal, Minus, Plus, Repeat2, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, qk } from "../../../api";
import { fmtDate, fmtDateTime, fmtRelative, pluralize } from "../../../lib/format";
import { humanize, SEVERITIES, severityRank } from "../../../lib/labels";
import type { Finding, RunBrief } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { SeverityMeter } from "../../../ui/Blocks";
import { cn } from "../../../ui/cn";
import { Counter } from "../../../ui/Counter";
import { Digest } from "../../../ui/Digest";
import { dur, ease, fadeUp, spring, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { useWorkspace } from "../context";
import { appPath } from "../data";

const SEV_FILL: Record<string, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
  info: "bg-sev-info",
};

function SeverityBar({ run }: { run: RunBrief }) {
  const total = SEVERITIES.reduce((t, s) => t + (run.by_severity?.[s] ?? 0), 0);
  if (!total) return <span className="text-xs text-ink-4">No findings</span>;
  return (
    <span className="flex h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-surface-3" aria-label={SEVERITIES.filter((s) => run.by_severity?.[s]).map((s) => `${run.by_severity[s]} ${s}`).join(", ")}>
      {SEVERITIES.filter((s) => run.by_severity?.[s]).map((s) => (
        <span key={s} className={SEV_FILL[s]} style={{ width: `${(run.by_severity[s] / total) * 100}%` }} />
      ))}
    </span>
  );
}

function Slot({ which, fly = false }: { which: "A" | "B"; fly?: boolean }) {
  return (
    <motion.span
      layoutId={fly ? `run-slot-${which}` : undefined}
      transition={spring.snappy}
      className={cn("grid size-6 place-items-center rounded-[7px] text-xs font-bold text-white shadow-sm", which === "A" ? "bg-ink-2" : "bg-brand-500")}
    >
      {which}
    </motion.span>
  );
}

function RunCard({ run, all, slot, onPick, latest }: { run: RunBrief; all: RunBrief[]; slot: "A" | "B" | null; onPick: () => void; latest: boolean }) {
  const original = run.replay_of ? all.find((r) => r.id === run.replay_of) : undefined;
  const identical = original && original.report_digest && original.report_digest === run.report_digest;
  return (
    <motion.li variants={fadeUp} className="relative pl-8">
      <span aria-hidden className={cn("absolute top-5 left-[9px] size-3 rounded-[3px] ring-4 ring-canvas", run.replay_of ? "bg-ev-3" : "bg-brand-500")} />
      <div
        onClick={onPick}
        className={cn(
          "w-full cursor-pointer rounded-card border bg-surface p-3.5 text-left shadow-xs transition-[border-color,box-shadow] duration-200 sm:p-4",
          slot ? "border-brand-300 shadow-sm" : "border-line hover:border-line-2 hover:shadow-sm",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[15px] font-semibold text-ink">
                Round {run.round}
                {run.replay_of ? ", replay" : ""}
              </span>
              {latest && <Tag variant="brand">Latest</Tag>}
              {run.status !== "complete" && <Tag variant="neutral">{humanize(run.status)}</Tag>}
              {run.replay_of && (
                <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold", identical ? "bg-verified-bg text-verified-fg" : "bg-manual-bg text-manual-fg")}>
                  <Repeat2 aria-hidden className="size-3" />
                  {identical ? "Reproduced identically" : original ? "Report differs from the original" : "Replay"}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-ink-3">
              {[run.started_at ? `${fmtDateTime(run.started_at)} (${fmtRelative(run.started_at)})` : null, run.triggered_by ? `by ${run.triggered_by}` : null, run.as_of ? `as of ${fmtDate(run.as_of)}` : null]
                .filter(Boolean)
                .join(", ")}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-ink tabular">{pluralize(run.findings ?? 0, "finding")}</div>
              <SeverityBar run={run} />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick();
              }}
              aria-pressed={!!slot}
              aria-label={slot ? `Remove round ${run.round} from the comparison` : `Compare round ${run.round}`}
              className="grid size-6 place-items-center rounded-[7px] border border-dashed border-line-2 transition-colors hover:border-brand-400"
            >
              {slot && <Slot which={slot} fly />}
            </button>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
          <dt className="text-ink-3">Ruleset</dt>
          <dd className="truncate font-mono text-[11.5px] text-ink">{run.ruleset_id}</dd>
          <dt className="text-ink-3">Inputs digest</dt>
          <dd className="min-w-0">
            <Digest value={run.input_digest} label="Inputs digest" head={10} tail={8} />
          </dd>
          <dt className="text-ink-3">Report digest</dt>
          <dd className="min-w-0">
            <Digest value={run.report_digest} label="Report digest" head={10} tail={8} />
          </dd>
        </dl>
        {run.error && <p className="mt-2 text-xs text-mismatch-fg">{run.error}</p>}
      </div>
    </motion.li>
  );
}

function Same({ label, a, b, explain }: { label: string; a: string | null; b: string | null; explain: [string, string] }) {
  const same = !!a && a === b;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-[12px] border p-3", same ? "border-line bg-surface" : "border-manual-dot/40 bg-manual-bg/50")}>
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", same ? "bg-verified-bg text-verified-fg" : "bg-manual-dot text-white")}>
        {same ? <Equal aria-hidden className="size-3" /> : <ArrowRight aria-hidden className="size-3" />}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">
          {label} {same ? "identical" : "changed"}
        </div>
        <p className="text-xs text-ink-3">{same ? explain[0] : explain[1]}</p>
      </div>
    </div>
  );
}

function DiffColumn({ title, icon, tone, items, appId, empty }: { title: string; icon: ReactNode; tone: string; items: Finding[]; appId: string; empty: string }) {
  return (
    <section className="min-w-0 rounded-card border border-line bg-surface shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h4 className={cn("flex items-center gap-1.5 text-sm font-semibold", tone)}>
          <span aria-hidden className="[&_svg]:size-4">{icon}</span>
          {title}
        </h4>
        <span className="font-display text-lg font-semibold text-ink tabular">
          <Counter value={items.length} />
        </span>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-3">{empty}</p>
      ) : (
        <motion.ul variants={stagger(0.04, 0.1)} initial="hidden" animate="show" className="divide-y divide-line">
          {items.map((f) => (
            <motion.li key={f.fingerprint} variants={fadeUp}>
              <Link to={appPath(appId, "findings", { finding: f.id })} className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-surface-2/60">
                <SeverityMeter severity={f.severity} />
                <span className="min-w-0 flex-1 truncate text-ink-2">{f.title}</span>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}

function RunDiff({ appId, a, b }: { appId: string; a: RunBrief; b: RunBrief }) {
  const qa = useQuery({ queryKey: qk.findings(appId, a.id), queryFn: () => api.findings(appId, a.id), staleTime: 5 * 60_000 });
  const qb = useQuery({ queryKey: qk.findings(appId, b.id), queryFn: () => api.findings(appId, b.id), staleTime: 5 * 60_000 });
  const diff = useMemo(() => {
    if (!qa.data || !qb.data) return null;
    const inA = new Map(qa.data.map((f) => [f.fingerprint, f]));
    const inB = new Map(qb.data.map((f) => [f.fingerprint, f]));
    const bySev = (x: Finding, y: Finding) => (severityRank[x.severity] ?? 9) - (severityRank[y.severity] ?? 9);
    return {
      appeared: qb.data.filter((f) => !inA.has(f.fingerprint)).sort(bySev),
      resolved: qa.data.filter((f) => !inB.has(f.fingerprint)).sort(bySev),
      persisted: qb.data.filter((f) => inA.has(f.fingerprint)).sort(bySev),
    };
  }, [qa.data, qb.data]);

  if (qa.error || qb.error) return <ErrorState error={qa.error ?? qb.error} title="Could not load findings for these runs" onRetry={() => void (qa.refetch(), qb.refetch())} />;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <Same label="Ruleset" a={a.ruleset_hash} b={b.ruleset_hash} explain={["Both runs applied the same rules.", "The rules changed between these runs."]} />
        <Same label="Inputs" a={a.input_digest} b={b.input_digest} explain={["Same documents, declared data and reference records.", "Documents, declared data or reference records changed."]} />
        <Same label="Report" a={a.report_digest} b={b.report_digest} explain={["The findings are byte-for-byte the same.", "The findings differ; see below."]} />
      </div>
      {!diff ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" rounded="lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <DiffColumn title="Appeared in B" icon={<Plus />} tone="text-mismatch-fg" items={diff.appeared} appId={appId} empty="Nothing new." />
          <DiffColumn title="Resolved since A" icon={<Minus />} tone="text-verified-fg" items={diff.resolved} appId={appId} empty="Nothing resolved." />
          <DiffColumn title="Persisted" icon={<Check />} tone="text-ink-2" items={diff.persisted} appId={appId} empty="No findings in common." />
        </div>
      )}
    </div>
  );
}

export function RunsTab() {
  const { app } = useWorkspace();
  const q = useQuery({ queryKey: qk.runs(app.id), queryFn: () => api.runs(app.id) });
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v) n.set(k, v);
            else n.delete(k);
          }
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  const runs = useMemo(() => [...(q.data ?? [])].sort((x, y) => (y.started_at ?? "").localeCompare(x.started_at ?? "")), [q.data]);
  const byId = (id: string | null) => runs.find((r) => r.id === id) ?? null;
  // Default comparison: the previous run as A and the latest as B
  const a = byId(params.get("a")) ?? (params.get("a") === null && runs.length > 1 ? runs[1] : null);
  const b = byId(params.get("b")) ?? (params.get("b") === null && runs.length > 1 ? runs[0] : null);

  const pick = (r: RunBrief) => {
    if (a?.id === r.id) return set({ a: "none" });
    if (b?.id === r.id) return set({ b: "none" });
    if (!a) return set({ a: r.id });
    if (!b) return set({ b: r.id });
    set({ a: b.id, b: r.id });
  };

  if (q.isPending)
    return (
      <div className="space-y-3" role="status">
        <span className="sr-only">Loading runs</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28" rounded="lg" />
        ))}
      </div>
    );
  if (q.error) return <ErrorState error={q.error} title="Could not load runs" onRetry={() => void q.refetch()} />;
  if (!runs.length) return <EmptyState sky title="No runs yet" description="Run validation to create the first run." />;

  const ordered = a && b ? ((a.started_at ?? "") <= (b.started_at ?? "") ? [a, b] : [b, a]) : null;

  return (
    <LayoutGroup id="runs">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-label="Runs" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-display text-md font-semibold tracking-title text-ink">{pluralize(runs.length, "run")}</h3>
            <span className="text-xs text-ink-3">Select two runs to compare them</span>
          </div>
          <motion.ol variants={stagger(0.05)} initial="hidden" animate="show" className="relative space-y-3">
            <span aria-hidden className="absolute top-6 bottom-6 left-[14px] w-px bg-line-2" />
            {runs.map((r, i) => (
              <RunCard key={r.id} run={r} all={runs} latest={i === 0} slot={a?.id === r.id ? "A" : b?.id === r.id ? "B" : null} onPick={() => pick(r)} />
            ))}
          </motion.ol>
        </section>

        <section aria-label="Comparison" className="min-w-0 xl:sticky xl:top-32">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-md font-semibold tracking-title text-ink">Compare</h3>
            <span className="flex items-center gap-1.5 text-sm text-ink-3">
              <span className="grid size-6 place-items-center rounded-[7px] border border-dashed border-line-2">{a && <Slot which="A" />}</span>
              {a ? `Round ${a.round}${a.replay_of ? " replay" : ""}` : "pick a run"}
              <ArrowRight aria-hidden className="size-3.5" />
              <span className="grid size-6 place-items-center rounded-[7px] border border-dashed border-line-2">{b && <Slot which="B" />}</span>
              {b ? `Round ${b.round}${b.replay_of ? " replay" : ""}` : "pick a run"}
            </span>
            {(a || b) && (
              <button type="button" onClick={() => set({ a: "none", b: "none" })} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
                <X aria-hidden className="size-3" /> Clear
              </button>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {ordered ? (
              <motion.div key={`${ordered[0].id}-${ordered[1].id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui, ease: ease.out }}>
                <RunDiff appId={app.id} a={ordered[0]} b={ordered[1]} />
              </motion.div>
            ) : (
              <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmptyState
                  compact
                  title={runs.length < 2 ? "Only one run so far" : "Pick two runs"}
                  description={
                    runs.length < 2
                      ? "Run validation again, or replay the latest run, to compare findings across runs."
                      : "Select one run as A and another as B. Findings are matched by fingerprint, so a finding that persists keeps its identity across runs."
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </LayoutGroup>
  );
}
