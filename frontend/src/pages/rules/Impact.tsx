import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { outcomeMeta } from "../../lib/labels";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Digest } from "../../ui/Digest";
import { fadeUp, stagger } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../ui/States";

function Outcome({ o }: { o: string | null }) {
  if (!o) return <span className="text-xs text-ink-4">Not evaluated</span>;
  return <Badge tone={outcomeMeta[o]?.tone ?? "neutral"}>{outcomeMeta[o]?.label ?? o}</Badge>;
}

/** Which applications would change outcome if their last run were evaluated under the active ruleset. */
export function Impact() {
  const q = useQuery({ queryKey: qk.impact, queryFn: api.ruleImpact });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-ink-3 text-pretty">
          Before a new ruleset version is relied on, each application's latest run is evaluated again under it with the same inputs.
          Applications whose latest run already used the active ruleset are skipped. Nothing is changed or re-run.
        </p>
        <Button size="sm" variant="ghost" leadingIcon={<RotateCcw />} onClick={() => void q.refetch()} loading={q.isFetching}>
          Recheck
        </Button>
      </div>
      {q.isPending ? (
        <Skeleton className="h-48 w-full" rounded="lg" />
      ) : q.error ? (
        <ErrorState error={q.error} title="Could not compute the change impact" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface-2/50 px-5 py-3 text-sm">
            <span className="text-ink-3">Compared against</span>
            <span className="font-mono text-[13px] text-ink">{q.data.active_ruleset}</span>
            <Digest value={q.data.active_hash} label="Active ruleset hash" />
          </div>
          {q.data.affected.length === 0 ? (
            <EmptyState
              title="No application would change outcome under the active ruleset"
              description="Every latest run either already used this ruleset or gives the same outcome for every rule under it."
            />
          ) : (
            <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="divide-y divide-line">
              {q.data.affected.map((a) => (
                <motion.li key={a.application_id} variants={fadeUp} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{a.institution}</div>
                      <div className="font-mono text-xs text-ink-3">{a.application_id}</div>
                    </div>
                    <Link
                      to={`/applications/${encodeURIComponent(a.application_id)}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline"
                    >
                      Open application <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {a.changes.map((c) => (
                      <li key={c.rule_id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-[11rem] font-mono text-xs text-ink-2">{c.rule_id}</span>
                        <Outcome o={c.before} />
                        <ArrowRight className="size-3.5 text-ink-4" aria-hidden />
                        <Outcome o={c.after} />
                      </li>
                    ))}
                  </ul>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
      )}
    </div>
  );
}
