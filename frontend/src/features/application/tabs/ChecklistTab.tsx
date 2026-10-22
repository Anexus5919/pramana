import clsx from "clsx";
import { ChevronRight, ListChecks } from "lucide-react";
import { Fragment, useState } from "react";
import { OutcomePill, SeverityChip, Tag } from "../../../components/ui/Badge";
import { Card, CardHeader } from "../../../components/ui/Card";
import { EmptyState, Skeleton } from "../../../components/ui/Feedback";
import { Segmented } from "../../../components/ui/Tabs";
import { toneClass } from "../../../components/ui/tone";
import { categoryMeta, humanize, outcomeMeta } from "../../../lib/labels";
import type { ApplicationDetail, RunFull } from "../../../types";
import { CitationBlock } from "../evidence/Citation";
import { officialDocHref } from "../evidence/EvidenceList";
import { TraceInputs } from "../evidence/TraceInputs";

const ORDER = ["fail", "insufficient_evidence", "error", "pass", "not_applicable"];

export function ChecklistTab({ app, run, loading }: { app: ApplicationDetail; run: RunFull | undefined; loading: boolean }) {
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (loading) return <Skeleton className="h-96" />;
  if (!run) {
    return (
      <Card>
        <EmptyState icon={<ListChecks className="size-6" />} title="No rule results yet">
          Rule results appear after a validation run.
        </EmptyState>
      </Card>
    );
  }

  const counts: Record<string, number> = {};
  for (const c of run.checklist) counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
  const rows = run.checklist
    .filter((c) => filter === "all" || c.outcome === filter)
    .sort((a, b) => ORDER.indexOf(a.outcome) - ORDER.indexOf(b.outcome) || a.rule_id.localeCompare(b.rule_id));
  const docHref = officialDocHref(app.id);
  const total = run.checklist.length || 1;

  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <Card aria-labelledby="checklist-title">
      <CardHeader
        id="checklist-title"
        title="Rule checklist"
        subtitle={`${run.checklist.length} rules evaluated under ${run.ruleset_id}, as of ${run.as_of ?? "the submission date"}`}
        actions={
          <Segmented
            label="Filter by outcome"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${run.checklist.length}` },
              ...ORDER.filter((o) => counts[o]).map((o) => ({ value: o, label: `${outcomeMeta[o].label} ${counts[o]}` })),
            ]}
          />
        }
      />
      <div className="flex h-1.5 overflow-hidden" aria-hidden>
        {ORDER.filter((o) => counts[o]).map((o) => (
          <div
            key={o}
            className={clsx("h-full origin-left animate-grow", toneClass[outcomeMeta[o].tone].dot)}
            style={{ width: `${(counts[o] / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle/60 text-left text-[11px] tracking-wider text-subtle-fg uppercase">
              <th scope="col" className="w-8 py-2 pl-3" />
              <th scope="col" className="px-2 py-2 font-semibold">Outcome</th>
              <th scope="col" className="px-2 py-2 font-semibold">Rule</th>
              <th scope="col" className="px-2 py-2 font-semibold">Result</th>
              <th scope="col" className="px-2 py-2 pr-4 font-semibold">Citation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const expanded = open.has(c.rule_id);
              return (
                <Fragment key={c.rule_id}>
                  <tr className={clsx("border-b border-line align-top", expanded && "bg-subtle/40")}>
                    <td className="py-2.5 pl-3">
                      <button
                        type="button"
                        onClick={() => toggle(c.rule_id)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "Show"} inputs for ${c.rule_id}`}
                        className="rounded p-0.5 text-subtle-fg hover:bg-subtle hover:text-fg"
                      >
                        <ChevronRight className={clsx("size-4 transition-transform", expanded && "rotate-90")} />
                      </button>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <OutcomePill outcome={c.outcome} />
                    </td>
                    <td className="max-w-[300px] px-2 py-2.5">
                      <div className="font-mono text-[11px] text-subtle-fg">{c.rule_id}</div>
                      <div className="font-medium text-fg">{c.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.category && <Tag>{categoryMeta[c.category]?.label ?? humanize(c.category)}</Tag>}
                        {c.severity && <SeverityChip severity={c.severity} />}
                      </div>
                    </td>
                    <td className="max-w-[340px] px-2 py-2.5 text-muted">{c.message}</td>
                    <td className="max-w-[300px] px-2 py-2.5 pr-4 text-xs text-muted">
                      <span className="font-medium text-fg">{c.citation?.doc_title ?? c.citation?.doc ?? "Not cited"}</span>
                      {c.citation?.section && <span>, section {c.citation.section}</span>}
                      {c.citation?.page && <span>, p. {c.citation.page}</span>}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-line bg-subtle/40">
                      <td />
                      <td colSpan={4} className="px-2 pt-1 pb-4 pr-4">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-muted">Inputs read by the rule</p>
                            <TraceInputs inputs={c.inputs} missing={c.missing} docHref={docHref} />
                          </div>
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-muted">Citation</p>
                            <CitationBlock citation={c.citation} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
