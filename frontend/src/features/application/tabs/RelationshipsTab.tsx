import { ArrowUpRight, Network } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EvidenceClassBadge, SeverityChip } from "../../../components/ui/Badge";
import { Card, CardHeader, SectionTitle } from "../../../components/ui/Card";
import { EmptyState, Skeleton } from "../../../components/ui/Feedback";
import { graphKindMeta, humanize } from "../../../lib/labels";
import type { ApplicationDetail, Finding, GraphNode, RunFull } from "../../../types";
import { KIND_COLOR, RelationshipGraph } from "../../graph/RelationshipGraph";
import { appPath, findingLink } from "../links";

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function relatedFindings(node: GraphNode, run: RunFull, findings: Finding[]): Finding[] {
  const graph = run.graph!;
  const consistency = findings.filter((f) => f.category === "consistency");
  if (node.kind === "application") {
    const appId = node.id.replace(/^app:/, "");
    if (node.focus) return consistency;
    return consistency.filter(
      (f) => f.evidence.some((e) => e.kind === "peer_document" && e.application_id === appId) || f.message.includes(appId),
    );
  }
  const codes = new Set(graph.edges.filter((e) => e.source === node.id || e.target === node.id).map((e) => e.code));
  const candidates = consistency.filter((f) => codes.has(f.code));
  const key = norm(node.id.split(":").slice(1).join(":"));
  const exact = candidates.filter((f) => key && norm(`${f.message} ${JSON.stringify(f.evidence)}`).includes(key));
  return exact.length ? exact : candidates;
}

export function RelationshipsTab({
  app,
  run,
  findings,
  loading,
}: {
  app: ApplicationDetail;
  run: RunFull | undefined;
  findings: Finding[];
  loading: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const graph = run?.graph;
  const node = graph?.nodes.find((n) => n.id === selected) ?? null;
  const related = useMemo(() => (node && run ? relatedFindings(node, run, findings) : []), [node, run, findings]);
  const kinds = useMemo(() => [...new Set(graph?.nodes.map((n) => n.kind) ?? [])], [graph]);
  const others = graph?.nodes.filter((n) => n.kind === "application" && !n.focus) ?? [];

  if (loading) return <Skeleton className="h-[560px]" />;
  if (!graph || graph.nodes.length <= 1) {
    return (
      <Card>
        <EmptyState icon={<Network className="size-6" />} title="No cross-application links">
          {run
            ? "No faculty, certificate numbers, files or photos in this application are shared with other applications in the same academic year."
            : "Run a validation to check other applications for shared entities."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card aria-labelledby="graph-title">
        <CardHeader
          id="graph-title"
          icon={<Network className="size-4" />}
          title="Relationship graph"
          subtitle={`${graph.nodes.length - 1 - others.length} shared entities linking to ${others.length} other ${others.length === 1 ? "application" : "applications"}. Drag to rearrange; select a node for details.`}
        />
        <div className="bg-subtle/30">
          <RelationshipGraph graph={graph} selected={selected} onSelect={setSelected} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 16 16" className="size-4">
              <circle cx="8" cy="8" r="5.5" fill="var(--primary)" stroke="var(--ov-focus)" strokeWidth="2" />
            </svg>
            This application
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 16 16" className="size-4">
              <circle cx="8" cy="8" r="5.5" fill="var(--surface)" stroke="var(--primary-ink)" strokeWidth="2" />
            </svg>
            Other application
          </span>
          {kinds
            .filter((k) => k !== "application")
            .map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5" title={graphKindMeta[k]?.meaning}>
                <svg aria-hidden viewBox="0 0 16 16" className="size-4">
                  <rect x="4" y="4" width="8" height="8" rx="1.5" fill={KIND_COLOR[k] ?? "#64748b"} transform="rotate(45 8 8)" />
                </svg>
                {graphKindMeta[k]?.label ?? humanize(k)}
              </span>
            ))}
        </div>
      </Card>

      <div className="space-y-5 xl:sticky xl:top-20">
        <Card>
          <div className="p-4">
            {node ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-subtle-fg">{graphKindMeta[node.kind]?.label ?? humanize(node.kind)}</p>
                  <h3 className="mt-0.5 text-base font-semibold break-words text-fg">{node.label}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {node.focus ? "The application under review." : graphKindMeta[node.kind]?.meaning}
                  </p>
                  {node.kind === "application" && !node.focus && (
                    <Link
                      to={appPath(node.id.replace(/^app:/, ""), "relationships")}
                      className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-xs font-medium text-primary-ink hover:brightness-95"
                    >
                      Open {node.id.replace(/^app:/, "")}
                      <ArrowUpRight aria-hidden className="size-3" />
                    </Link>
                  )}
                </div>
                <div>
                  <SectionTitle className="mb-2">Related findings ({related.length})</SectionTitle>
                  {related.length === 0 ? (
                    <p className="text-sm text-subtle-fg">No findings in this application reference this node.</p>
                  ) : (
                    <ul className="space-y-2">
                      {related.map((f) => (
                        <li key={f.id}>
                          <Link
                            to={findingLink(app.id, f.id)}
                            className="block rounded-md border border-line p-2.5 hover:border-primary/40 hover:bg-subtle/60"
                          >
                            <span className="flex flex-wrap items-center gap-1.5">
                              <SeverityChip severity={f.severity} />
                              <EvidenceClassBadge evidenceClass={f.evidence_class} />
                            </span>
                            <span className="mt-1 block text-sm font-medium text-fg">{f.title}</span>
                            <span className="mt-0.5 line-clamp-3 block text-xs text-muted">{f.message}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState title="Select a node" className="py-10">
                Choose an application or shared entity in the graph to list the findings that connect them.
              </EmptyState>
            )}
          </div>
        </Card>
        {others.length > 0 && (
          <Card aria-labelledby="linked-title">
            <CardHeader id="linked-title" title="Linked applications" />
            <ul className="divide-y divide-line">
              {others.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(o.id)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-subtle/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{o.label}</span>
                      <span className="block font-mono text-[11px] text-subtle-fg">{o.id.replace(/^app:/, "")}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {graph.edges.filter((e) => e.source === o.id || e.target === o.id).length} links
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
