import { Network, X } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { pluralize } from "../../../../lib/format";
import { humanize } from "../../../../lib/labels";
import { workspacePath } from "../../../../shell/nav";
import type { Finding, GraphEdge, GraphNode } from "../../../../types";
import { ButtonLink, cn, Code, EmptyState, IconButton, Panel, PanelDivider, SeverityIndicator, Skeleton } from "../../../../ui2";
import type { GEdge, GNode } from "../../../integrity/GraphCanvas";
import { ITEM_KINDS, itemKindOf, KIND_META, RELATION, shortName, type NodeKind } from "../../../integrity/graphTheme";
import { KindDot, LegendItem } from "../../../integrity/legend";
import { useWorkspace } from "../../context";
import { useParam } from "../../data";

// Cytoscape loads with this view only, not with the workspace
const GraphCanvas = lazy(() => import("../../../integrity/GraphCanvas"));

// Column layout in model units: this application, the shared items, the other applications
const COL = 300;
const ROW = 70;
const GROUP_GAP = 26;
const PEER_GAP = 120;

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const appIdOf = (n: GraphNode) => (n.kind === "application" ? n.id.replace(/^app:/, "") : null);
const kindOf = (n: GraphNode): NodeKind => (n.kind === "application" ? "application" : (itemKindOf(n.kind) ?? "details"));
const kindLabel = (n: GraphNode) => KIND_META[kindOf(n)].label;

function tokenOf(n: GraphNode): string {
  if (n.kind === "application") return norm(appIdOf(n)!);
  if (n.kind === "fields") return norm(n.id.slice(n.id.lastIndexOf(":") + 1));
  return norm(n.label);
}

function relatedFindings(n: GraphNode, edges: GraphEdge[], findings: Finding[]): Finding[] {
  const codes = new Set(edges.filter((e) => e.source === n.id || e.target === n.id).map((e) => e.code));
  const byCode = findings.filter((f) => codes.has(f.code));
  if (n.focus) return byCode;
  const t = tokenOf(n);
  const hit = byCode.filter((f) => norm(`${f.message} ${JSON.stringify(f.evidence)}`).includes(t));
  return hit.length ? hit : byCode;
}

/** The identifier as the documents print it, read back from the finding that recorded it. */
function prettyLabel(n: GraphNode, related: Finding[]): string {
  const k = kindOf(n);
  const t = norm(n.label);
  const scan = (re: RegExp) => {
    for (const f of related) for (const m of f.message.matchAll(re)) if (norm(m[1]) === t || norm(m[1]).startsWith(t)) return m[1];
    return null;
  };
  if (k === "faculty") return scan(/\(([^()]+)\)/g) ?? n.label;
  if (k === "certificate") return scan(/number '([^']+)'/g) ?? n.label;
  if (k === "file") return `SHA-256 ${n.label.slice(0, 12)}`;
  if (k === "photo") return "Photo";
  if (k === "seal") return "Seal image";
  const t2 = docTypeOf(related);
  return t2 ? `Same ${DOC_SHORT[t2] ?? t2.replace(/_/g, " ")} details` : "Same details";
}

const DOC_SHORT: Record<string, string> = { fire_noc: "fire NOC", occupancy_certificate: "occupancy certificate", affidavit_2: "affidavit", audited_accounts: "audit report" };

/** The document type a cross-application finding names, such as fire_noc in "fire_noc number '...'". */
function docTypeOf(related: Finding[]): string | null {
  for (const f of related) {
    const m = /([a-z]+(?:_[a-z0-9]+)+) (?:number|submitted)/.exec(f.message) ?? /identical to a ([a-z_0-9]+)/.exec(f.message);
    if (m) return m[1];
  }
  return null;
}

function relationOf(k: NodeKind, related: Finding[]): string {
  if (k === "certificate") {
    const t = docTypeOf(related);
    return t === "fire_noc" ? "carries NOC no." : t === "occupancy_certificate" ? "carries OC no." : RELATION.certificate;
  }
  return k === "application" ? "" : RELATION[k];
}

function layoutColumns(nodes: GraphNode[], edges: GraphEdge[], labels: Map<string, string>, names: Map<string, string>, rels: Map<string, string>) {
  const me = nodes.find((n) => n.focus) ?? nodes.find((n) => n.kind === "application")!;
  const items = nodes.filter((n) => n.kind !== "application");
  const peers = nodes.filter((n) => n.kind === "application" && n.id !== me.id);
  const peersOf = new Map<string, string[]>();
  for (const it of items)
    peersOf.set(
      it.id,
      edges.filter((e) => (e.source === it.id || e.target === it.id) && (e.source !== me.id && e.target !== me.id)).map((e) => (e.source === it.id ? e.target : e.source)),
    );
  const rank = (n: GraphNode) => ITEM_KINDS.indexOf(kindOf(n) as (typeof ITEM_KINDS)[number]);
  // Other applications in the order their first shared item appears, so edges to the right do not cross
  const byKind = [...items].sort((a, b) => rank(a) - rank(b) || (labels.get(a.id) ?? "").localeCompare(labels.get(b.id) ?? ""));
  const peerOrder: string[] = [];
  for (const it of byKind) for (const p of peersOf.get(it.id) ?? []) if (!peerOrder.includes(p)) peerOrder.push(p);
  for (const p of peers) if (!peerOrder.includes(p.id)) peerOrder.push(p.id);
  const peerIdx = (it: GraphNode) => Math.min(...(peersOf.get(it.id) ?? []).map((p) => peerOrder.indexOf(p)), 99);
  const ordered = [...items].sort((a, b) => rank(a) - rank(b) || peerIdx(a) - peerIdx(b) || (labels.get(a.id) ?? "").localeCompare(labels.get(b.id) ?? ""));

  const pos = new Map<string, { x: number; y: number }>();
  let y = 0;
  ordered.forEach((it, i) => {
    if (i > 0 && rank(ordered[i - 1]) !== rank(it)) y += GROUP_GAP;
    pos.set(it.id, { x: COL, y });
    y += ROW;
  });
  const itemSpan = Math.max(0, y - ROW);
  // Each other application sits level with the items it shares, pushed apart where they would collide
  const want = peerOrder.map((p) => {
    const ys = ordered.filter((it) => (peersOf.get(it.id) ?? []).includes(p)).map((it) => pos.get(it.id)!.y);
    return ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : itemSpan / 2;
  });
  const placed: number[] = [];
  want.forEach((w, i) => placed.push(i === 0 ? w : Math.max(w, placed[i - 1] + PEER_GAP)));
  const shift = placed.length ? Math.min(0, itemSpan / 2 - (placed[0] + placed[placed.length - 1]) / 2) : 0;
  peerOrder.forEach((p, i) => pos.set(p, { x: COL * 2, y: placed[i] + (placed[placed.length - 1] > itemSpan ? shift : 0) }));
  pos.set(me.id, { x: 0, y: itemSpan / 2 });

  const gnodes: GNode[] = nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    const k = kindOf(n);
    const app = appIdOf(n);
    return {
      id: n.id,
      kind: k,
      label: app ? `${shortName(names.get(n.id) ?? n.label)}\n${app}` : (labels.get(n.id) ?? n.label),
      x: p.x,
      y: p.y,
      focus: !!n.focus,
      mono: k === "faculty" || k === "certificate" || k === "file",
    };
  });
  const gedges: GEdge[] = edges.map((e, i) => {
    const item = nodes.find((n) => n.kind !== "application" && (n.id === e.source || n.id === e.target));
    const k = item ? kindOf(item) : "application";
    const toMe = e.source === me.id || e.target === me.id;
    const a = pos.get(e.source) ?? { x: 0, y: 0 };
    const b = pos.get(e.target) ?? { x: 0, y: 0 };
    const label =
      e.code === "XA-FACULTY-NOT-IN-REGISTRY" && !(peersOf.get(item?.id ?? "") ?? []).length
        ? "not in registry"
        : e.code === "XA-FACULTY-REGISTERED-ELSEWHERE" && !(peersOf.get(item?.id ?? "") ?? []).length
          ? "registered elsewhere"
          : k === "application"
            ? ""
            : (rels.get(item?.id ?? "") ?? RELATION[k]);
    return {
      id: `${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      kind: k,
      label,
      restLabel: toMe ? label : "",
      bend: Math.abs(a.y - b.y) < 1 ? 0 : (a.x < b.x ? 1 : -1) * Math.sign(b.y - a.y) * 12,
    };
  });
  const height = Math.max(itemSpan, ...[...pos.values()].map((p) => p.y)) - Math.min(0, ...[...pos.values()].map((p) => p.y));
  return { nodes: gnodes, edges: gedges, height };
}

/** Links to other applications in the same academic year: a column graph with a keyboard-friendly side list. */
export function RelatedView() {
  const { app, run, runLoading, findings } = useWorkspace();
  const [selectedId, setNode] = useParam("node");
  const select = useCallback((id: string | null) => setNode(id), [setNode]);
  const [hover, setHover] = useState<string | null>(null);
  const graph = run?.graph;
  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges = useMemo(() => graph?.edges ?? [], [graph]);

  const [labels, rels] = useMemo(() => {
    const m = new Map<string, string>();
    const r = new Map<string, string>();
    for (const n of nodes)
      if (n.kind !== "application") {
        const rf = relatedFindings(n, edges, findings ?? []);
        m.set(n.id, prettyLabel(n, rf));
        r.set(n.id, relationOf(kindOf(n), rf));
      }
    return [m, r];
  }, [nodes, edges, findings]);
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) if (n.kind === "application") m.set(n.id, n.focus ? app.institution?.name ?? n.label : n.label);
    return m;
  }, [nodes, app]);
  const lay = useMemo(() => (nodes.length && edges.length ? layoutColumns(nodes, edges, labels, names, rels) : null), [nodes, edges, labels, names, rels]);

  if (!app.latest_run)
    return (
      <Panel>
        <EmptyState title="Not validated yet" description="Cross-application checks run as part of validation. Run validation from More actions." />
      </Panel>
    );
  if (runLoading || !run)
    return (
      <div role="status">
        <span className="sr-only">Loading related applications</span>
        <Skeleton className="h-[480px]" />
      </div>
    );
  if (!nodes.length || !edges.length || !lay)
    return (
      <Panel>
        <EmptyState
          title="No links to other applications"
          description="No shared faculty, certificate numbers, identical files or near-duplicate documents were found across applications in this academic year."
        />
      </Panel>
    );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const related = selected ? relatedFindings(selected, edges, findings ?? []) : [];
  const kinds = ITEM_KINDS.filter((k) => nodes.some((n) => n.kind !== "application" && kindOf(n) === k));
  const peers = nodes.filter((n) => n.kind === "application" && !n.focus);
  const codes = [...new Set(edges.map((e) => e.code))];
  const titleFor = (code: string) => (findings ?? []).find((f) => f.code === code)?.title ?? humanize(code.replace(/^XA-/, "").toLowerCase());
  const ordered = [...nodes].sort(
    (a, b) =>
      Number(!!b.focus) - Number(!!a.focus) ||
      Number(b.kind === "application") - Number(a.kind === "application") ||
      ITEM_KINDS.indexOf(kindOf(a) as (typeof ITEM_KINDS)[number]) - ITEM_KINDS.indexOf(kindOf(b) as (typeof ITEM_KINDS)[number]),
  );
  const selectedApp = selected ? appIdOf(selected) : null;
  const height = Math.round(Math.min(640, Math.max(340, lay.height + 160)));
  const shared = nodes.length - peers.length - 1;
  const nameOf = (n: GraphNode) => (n.kind === "application" ? (names.get(n.id) ?? n.label) : (labels.get(n.id) ?? n.label));

  return (
    <div
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && selectedId) {
          e.stopPropagation();
          select(null);
        }
      }}
    >
      <Panel
        title="Links to other applications"
        description={`This application on the left, the ${pluralize(shared, "shared item")} in the middle, the ${pluralize(peers.length, "other application")} on the right. Hover or select to trace a link.`}
        actions={
          <ButtonLink size="sm" variant="ghost" to="/integrity" leadingIcon={<Network aria-hidden />}>
            Whole cycle
          </ButtonLink>
        }
        padding="none"
        footer={
          <ul className="flex w-full flex-wrap items-center gap-x-5 gap-y-1.5" aria-label="Legend">
            <LegendItem kind="application" />
            {kinds.map((k) => (
              <LegendItem key={k} kind={k} />
            ))}
          </ul>
        }
      >
        <div className="border-t border-line">
          <Suspense fallback={<div style={{ height }} className="bg-surface-2" />}>
            <GraphCanvas
              nodes={lay.nodes}
              edges={lay.edges}
              selected={selectedId}
              onSelect={select}
              hovered={hover}
              height={height}
              label={`Relationship graph: this application, ${pluralize(shared, "shared item")} and ${pluralize(peers.length, "other application")}. Use the list beside it to select an item.`}
            />
          </Suspense>
        </div>
      </Panel>

      <Panel
        as="aside"
        className="xl:sticky xl:top-20"
        title={selected ? nameOf(selected) : "Links found"}
        description={selected ? KIND_META[kindOf(selected)].meaning : "Select an item to see the findings that connect it to this application."}
        actions={selected ? <IconButton size="sm" label="Clear the selection" icon={<X />} onClick={() => select(null)} /> : undefined}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <KindDot kind={kindOf(selected)} />
              {kindLabel(selected)}
              {selectedApp && <Code className="text-xs">{selectedApp}</Code>}
            </div>
            {selectedApp && !selected.focus && (
              <ButtonLink size="sm" variant="secondary" to={workspacePath(selectedApp, "comparisons", { view: "related" })}>
                Open other application
              </ButtonLink>
            )}
            <PanelDivider label={`Related findings (${related.length})`} />
            {related.length === 0 ? (
              <p className="text-sm text-ink-3">No findings on this application point at this item.</p>
            ) : (
              <ul className="-mx-2 divide-y divide-line">
                {related.map((f) => (
                  <li key={f.id}>
                    <Link
                      to={workspacePath(app.id, "findings", { finding: f.id })}
                      className="block rounded px-2 py-2 transition-colors duration-150 hover:bg-surface-2"
                    >
                      <span className="flex items-center gap-2">
                        <SeverityIndicator severity={f.severity} showLabel={false} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.title}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-ink-3">{f.message}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <dl className="divide-y divide-line">
            {codes.map((c) => (
              <div key={c} className="flex items-start justify-between gap-3 py-2 first:pt-0">
                <dt className="min-w-0 text-sm text-ink-2">
                  {titleFor(c)}
                  <Code className="mt-0.5 block text-xs">{c}</Code>
                </dt>
                <dd className="shrink-0 text-sm text-ink tabular-nums">
                  {(findings ?? []).filter((f) => f.code === c).length || edges.filter((e) => e.code === c).length}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <PanelDivider label="Items in the graph" />
        <ul className="-mx-2 space-y-0.5">
          {ordered.map((n) => {
            const sel = n.id === selectedId;
            const k = kindOf(n);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  aria-pressed={sel}
                  onClick={() => select(sel ? null : n.id)}
                  onFocus={() => setHover(n.id)}
                  onBlur={() => setHover(null)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-sm transition-colors duration-150",
                    sel ? "bg-brand-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <KindDot kind={k} className={n.focus ? "border-brand-solid" : undefined} />
                  <span className={cn("min-w-0 flex-1 truncate", (k === "faculty" || k === "certificate") && "font-mono text-xs")}>
                    {nameOf(n)}
                    {n.focus && <span className="font-sans text-sm text-ink-3"> (this application)</span>}
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{KIND_META[k].label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
