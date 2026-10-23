import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { pluralize } from "../../../lib/format";
import { categoryMeta, humanize, outcomeMeta } from "../../../lib/labels";
import type { ChecklistEntry } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { SeverityMeter, StatusCube } from "../../../ui/Blocks";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { Input } from "../../../ui/Field";
import { dur, ease } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState } from "../../../ui/States";
import { Segmented } from "../../../ui/Tabs";
import { toneClass } from "../../../ui/tone";
import { Tooltip } from "../../../ui/Tooltip";
import { useWorkspace } from "../context";
import { appPath } from "../data";
import { CitationCard, EvidenceList, PaneLabel, TraceInputs } from "../parts";

const OUTCOMES = ["fail", "insufficient_evidence", "error", "pass", "not_applicable"] as const;
type Filter = "all" | (typeof OUTCOMES)[number];
const rank = (o: string) => {
  const i = (OUTCOMES as readonly string[]).indexOf(o);
  return i < 0 ? 9 : i;
};

function OutcomeBar({ entries, active, onPick }: { entries: ChecklistEntry[]; active: Filter; onPick: (f: Filter) => void }) {
  const sorted = [...entries].sort((a, b) => rank(a.outcome) - rank(b.outcome));
  return (
    <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${pluralize(entries.length, "rule")} by outcome`}>
      {sorted.map((e, i) => {
        const tone = outcomeMeta[e.outcome]?.tone ?? "unchecked";
        const dim = active !== "all" && active !== e.outcome;
        return (
          <Tooltip key={e.rule_id} content={<><b className="font-semibold">{outcomeMeta[e.outcome]?.label ?? humanize(e.outcome)}.</b> {e.title}</>}>
            <motion.button
              type="button"
              aria-label={`${e.title}: ${outcomeMeta[e.outcome]?.label ?? e.outcome}`}
              onClick={() => onPick(active === e.outcome ? "all" : (e.outcome as Filter))}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: dim ? 0.25 : 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.018, duration: dur.ui, ease: ease.out }}
              className={cn("relative h-6 w-4 rounded-[3px]", toneClass[tone].dot)}
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-[4px] rounded-t-[3px] bg-white/35" />
            </motion.button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function Row({ e, open, onToggle }: { e: ChecklistEntry; open: boolean; onToggle: () => void }) {
  const { app, findings } = useWorkspace();
  const meta = outcomeMeta[e.outcome];
  const finding = (findings ?? []).find((f) => f.rule?.id === e.rule_id);
  const flagged = e.outcome === "fail" || e.outcome === "insufficient_evidence" || e.outcome === "error";
  const panelId = `rule-${e.rule_id}`;
  return (
    <div className={cn("transition-colors duration-200", open && "bg-canvas/50")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
      >
        <span className="pt-0.5">
          <StatusCube tone={meta?.tone ?? "unchecked"} size={16} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-ink">{e.title}</span>
            {flagged && e.severity && <SeverityMeter severity={e.severity} />}
          </span>
          <span className={cn("mt-0.5 block text-xs text-ink-3", !open && "line-clamp-1")}>{e.message}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("hidden h-6 items-center rounded-full px-2 text-[11.5px] font-semibold sm:inline-flex", toneClass[meta?.tone ?? "unchecked"].bg, toneClass[meta?.tone ?? "unchecked"].fg)}>
            {meta?.label ?? humanize(e.outcome)}
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: dur.ui, ease: ease.out }} className="text-ink-3">
            <ChevronDown aria-hidden className="size-4" />
          </motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: dur.panel, ease: ease.out }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 px-4 pt-1 pb-4 pl-11 lg:grid-cols-2">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  <Tag variant="mono">{e.rule_id}</Tag>
                  {e.category && <span>{categoryMeta[e.category]?.label ?? humanize(e.category)}</span>}
                  {finding && (
                    <Link to={appPath(app.id, "findings", { finding: finding.id })} className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">
                      Open the finding <ArrowUpRight aria-hidden className="size-3" />
                    </Link>
                  )}
                </div>
                <CitationCard citation={e.citation} />
              </div>
              <div className="min-w-0 space-y-3">
                <div>
                  <PaneLabel>Facts the rule used</PaneLabel>
                  <TraceInputs inputs={e.inputs} missing={e.missing} />
                </div>
                {e.evidence.length > 0 && (
                  <div>
                    <PaneLabel>Evidence</PaneLabel>
                    <EvidenceList evidence={e.evidence} fallbackDocId={null} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ChecklistTab() {
  const { run, runLoading, app } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const filter = ((params.get("outcome") as Filter) || "all") as Filter;
  const open = params.get("rule");
  const q = params.get("q") ?? "";
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

  const entries = useMemo(() => run?.checklist ?? [], [run]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.outcome] = (c[e.outcome] ?? 0) + 1;
    return c;
  }, [entries]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((e) => filter === "all" || e.outcome === filter)
      .filter((e) => !needle || `${e.title} ${e.rule_id} ${e.message}`.toLowerCase().includes(needle))
      .sort((a, b) => rank(a.outcome) - rank(b.outcome));
  }, [entries, filter, q]);

  if (!app.latest_run) return <EmptyState sky title="Not validated yet" description="Run validation to evaluate the checklist for this application." />;
  if (runLoading || !run)
    return (
      <div className="space-y-2" role="status">
        <span className="sr-only">Loading the checklist</span>
        <Skeleton className="h-16" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  if (!entries.length) return <EmptyState title="No rules applied" description="The active ruleset had no rules for this category." />;

  const options = [
    { value: "all" as Filter, label: "All", count: entries.length },
    ...OUTCOMES.filter((o) => counts[o]).map((o) => ({ value: o as Filter, label: outcomeMeta[o]?.label ?? humanize(o), count: counts[o] })),
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Ruleset {run.ruleset_id}</div>
            <h3 className="font-display text-md font-semibold tracking-title text-ink">
              {pluralize(entries.length, "rule")} evaluated
              {counts.fail ? <span className="text-mismatch-fg">, {counts.fail} failed</span> : null}
              {counts.insufficient_evidence ? <span className="text-manual-fg">, {counts.insufficient_evidence} could not be decided</span> : null}
            </h3>
            <p className="mt-0.5 text-sm text-ink-3">Each block is one rule. Select a block or an outcome to narrow the list.</p>
          </div>
        </div>
        <div className="mt-3">
          <OutcomeBar entries={entries} active={filter} onPick={(f) => set({ outcome: f === "all" ? null : f })} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented label="Filter by outcome" options={options} value={filter} onChange={(v) => set({ outcome: v === "all" ? null : v, rule: null })} />
        </div>
        <div className="w-full sm:w-64">
          <Input value={q} onChange={(e) => set({ q: e.target.value || null })} placeholder="Search rules" aria-label="Search rules" leadingIcon={<Search />} />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState compact title="No rules match" action={<Button size="sm" variant="ghost" onClick={() => set({ outcome: null, q: null })}>Clear filters</Button>} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xs">
          <AnimatePresence initial={false}>
            {shown.map((e) => (
              <motion.li key={e.rule_id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui }}>
                <Row e={e} open={open === e.rule_id} onToggle={() => set({ rule: open === e.rule_id ? null : e.rule_id })} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
