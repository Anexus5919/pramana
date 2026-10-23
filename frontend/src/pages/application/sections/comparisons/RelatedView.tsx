import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Link } from "react-router-dom";
import { pluralize } from "../../../../lib/format";
import { graphKindMeta, humanize } from "../../../../lib/labels";
import { workspacePath } from "../../../../shell/nav";
import type { Finding, GraphEdge, GraphNode } from "../../../../types";
import { ButtonLink, cn, Code, EmptyState, IconButton, Panel, PanelDivider, SeverityIndicator, Skeleton } from "../../../../ui2";
import { useWorkspace } from "../../context";
import { useParam, useWidth } from "../../data";

// Categorical colours per node kind, from the evidence-class palette
const KIND_COLOR: Record<string, string> = {
  application: "var(--ink-3)",
  faculty: "var(--ev-3)",
  ref: "var(--ev-5)",
  sha256: "var(--mismatch-dot)",
  phash: "var(--ev-6)",
  minhash: "var(--ev-4)",
  fields: "var(--ev-5)",
};
const HEIGHT = 480;

interface SimNode extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const appIdOf = (n: GraphNode) => (n.kind === "application" ? n.id.replace(/^app:/, "") : null);
const kindLabel = (k: string) => graphKindMeta[k]?.label ?? humanize(k);

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

function layout(nodes: GraphNode[], edges: GraphEdge[], narrow: boolean): Map<string, { x: number; y: number }> {
  const sim: SimNode[] = nodes.map((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    const r = n.focus ? 0 : 140;
    return { id: n.id, node: n, x: Math.cos(a) * r, y: Math.sin(a) * r, ...(n.focus ? { fx: 0, fy: 0 } : {}) };
  });
  const links: SimulationLinkDatum<SimNode>[] = edges.map((e) => ({ source: e.source, target: e.target }));
  const s = forceSimulation(sim)
    .force(
      "link",
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance((l) => {
          const a = l.source as SimNode;
          const b = l.target as SimNode;
          return a.node.kind === "application" && b.node.kind === "application" ? 200 : 110;
        })
        .strength(0.7),
    )
    .force("charge", forceManyBody().strength(-520))
    .force("collide", forceCollide<SimNode>().radius((d) => (d.node.kind === "application" ? 64 : 34)))
    .force("x", forceX(0).strength(narrow ? 0.12 : 0.04))
    .force("y", forceY(0).strength(0.09))
    .stop();
  for (let i = 0; i < 300; i++) s.tick();
  const out = new Map<string, { x: number; y: number }>();
  for (const n of sim) out.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}...` : s;
}

function KindMark({ kind, focus }: { kind: string; focus?: boolean }) {
  if (kind === "application")
    return <span aria-hidden className={cn("size-3 shrink-0 rounded-full border-2 bg-surface", focus ? "border-brand-solid" : "border-ink-3")} />;
  return <span aria-hidden className="size-3 shrink-0 rounded-[3px]" style={{ background: KIND_COLOR[kind] ?? "var(--ink-3)" }} />;
}

/** Links to other applications in the same academic year: a force graph with a keyboard-friendly side list. */
export function RelatedView() {
  const { app, run, runLoading, findings } = useWorkspace();
  const [selectedId, setNode] = useParam("node");
  const select = useCallback((id: string | null) => setNode(id), [setNode]);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const width = useWidth(wrap);
  const narrow = width > 0 && width < 600;
  const graph = run?.graph;
  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges = useMemo(() => graph?.edges ?? [], [graph]);

  const base = useMemo(() => (nodes.length ? layout(nodes, edges, narrow) : new Map<string, { x: number; y: number }>()), [nodes, edges, narrow]);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  useEffect(() => setMoved({}), [base]);

  const pos = useCallback((id: string) => moved[id] ?? base.get(id) ?? { x: 0, y: 0 }, [moved, base]);

  // The view box fits the laid-out graph once per layout, so dragging does not rescale it
  const view = useMemo(() => {
    const pts = [...base.values()];
    if (!pts.length) return { x: -300, y: -200, w: 600, h: 400 };
    const pad = 90;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - pad;
    const x1 = Math.max(...xs) + pad;
    const y0 = Math.min(...ys) - pad;
    const y1 = Math.max(...ys) + pad + 20;
    return { x: x0, y: y0, w: Math.max(300, x1 - x0), h: Math.max(240, y1 - y0) };
  }, [base]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [edges]);

  const lit = hover ?? selectedId;
  const isLit = (id: string) => !lit || id === lit || !!neighbours.get(lit)?.has(id);
  const edgeLit = (e: GraphEdge) => !lit || e.source === lit || e.target === lit;

  const toSvg = (cx: number, cy: number) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const onDown = (id: string) => (e: RPointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    const p = toSvg(e.clientX, e.clientY);
    const cur = pos(id);
    drag.current = { id, dx: cur.x - p.x, dy: cur.y - p.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    const next = { x: p.x + d.dx, y: p.y + d.dy };
    const cur = pos(d.id);
    if (!d.moved && Math.hypot(next.x - cur.x, next.y - cur.y) < 3) return;
    d.moved = true;
    setMoved((m) => ({ ...m, [d.id]: next }));
  };
  const onUp = (id: string) => (e: RPointerEvent<SVGGElement>) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d && !d.moved) select(selectedId === id ? null : id);
  };

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
  if (!nodes.length || !edges.length)
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
  const kinds = [...new Set(nodes.map((n) => n.kind))];
  const peers = nodes.filter((n) => n.kind === "application" && !n.focus);
  const codes = [...new Set(edges.map((e) => e.code))];
  const titleFor = (code: string) => (findings ?? []).find((f) => f.code === code)?.title ?? humanize(code.replace(/^XA-/, "").toLowerCase());
  const ordered = [...nodes].sort((a, b) => Number(!!b.focus) - Number(!!a.focus) || Number(b.kind === "application") - Number(a.kind === "application"));
  const selectedApp = selected ? appIdOf(selected) : null;

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
        description={`Linked to ${pluralize(peers.length, "other application")} through ${pluralize(nodes.length - peers.length - 1, "shared item")} in this academic year. Drag a node to untangle the graph.`}
        actions={<IconButton size="sm" label="Reset layout" icon={<RotateCcw />} onClick={() => setMoved({})} disabled={!Object.keys(moved).length} />}
        padding="none"
        footer={
          <ul className="flex w-full flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legend">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-1.5 text-xs text-ink-3" title={graphKindMeta[k]?.meaning}>
                <KindMark kind={k} />
                {kindLabel(k)}
              </li>
            ))}
          </ul>
        }
      >
        <div ref={wrap} className="border-t border-line">
          <svg
            ref={svg}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            width="100%"
            height={HEIGHT}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Relationship graph: ${pluralize(nodes.length, "node")} and ${pluralize(edges.length, "link")}. Use the list beside it to select a node.`}
            className="block touch-none select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) select(null);
            }}
          >
            <g>
              {edges.map((e, i) => {
                const a = pos(e.source);
                const b = pos(e.target);
                const on = edgeLit(e);
                return (
                  <line
                    key={`${e.source}-${e.target}-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    style={{ stroke: on && lit ? "var(--brand-500)" : "var(--line-2)" }}
                    strokeWidth={on && lit ? 2 : 1.5}
                    strokeDasharray={e.code.includes("REGISTERED") ? "4 4" : undefined}
                    opacity={on ? 1 : 0.35}
                  />
                );
              })}
            </g>
            <g>
              {nodes.map((n) => {
                const p = pos(n.id);
                const on = isLit(n.id);
                const isApp = n.kind === "application";
                const sel = selectedId === n.id;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x} ${p.y})`}
                    opacity={on ? 1 : 0.35}
                    onPointerDown={onDown(n.id)}
                    onPointerMove={onMove}
                    onPointerUp={onUp(n.id)}
                    onPointerEnter={() => setHover(n.id)}
                    onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    {isApp ? (
                      <>
                        <circle
                          r={n.focus ? 26 : 20}
                          style={{ fill: "var(--surface)", stroke: n.focus || sel ? "var(--brand-solid)" : "var(--ink-3)" }}
                          strokeWidth={sel ? 3 : 2}
                        />
                        <circle r={n.focus ? 6 : 5} style={{ fill: n.focus ? "var(--brand-solid)" : "var(--ink-3)" }} />
                        <text
                          y={n.focus ? 44 : 38}
                          textAnchor="middle"
                          fontSize={13}
                          fontWeight={600}
                          style={{ fill: "var(--ink)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}
                        >
                          {truncate(n.label, 30)}
                        </text>
                        <text
                          y={n.focus ? 60 : 54}
                          textAnchor="middle"
                          fontSize={12}
                          style={{ fill: "var(--ink-3)", fontFamily: "var(--ff-mono)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}
                        >
                          {appIdOf(n)}
                          {n.focus ? " (this)" : ""}
                        </text>
                      </>
                    ) : (
                      <>
                        <rect
                          x={-11}
                          y={-11}
                          width={22}
                          height={22}
                          rx={5}
                          style={{ fill: KIND_COLOR[n.kind] ?? "var(--ink-3)", stroke: sel ? "var(--brand-solid)" : "var(--surface)" }}
                          strokeWidth={sel ? 3 : 2}
                        />
                        <text
                          y={28}
                          textAnchor="middle"
                          fontSize={12}
                          style={{ fill: "var(--ink-2)", fontFamily: "var(--ff-mono)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}
                        >
                          {truncate(n.kind === "fields" ? "same details" : n.label, 18)}
                        </text>
                      </>
                    )}
                    <title>{`${kindLabel(n.kind)}: ${n.label}`}</title>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </Panel>

      <Panel
        as="aside"
        className="xl:sticky xl:top-20"
        title={selected ? selected.label : "Links found"}
        description={selected ? graphKindMeta[selected.kind]?.meaning : "Select an item to see the findings that connect it to this application."}
        actions={selected ? <IconButton size="sm" label="Clear the selection" icon={<X />} onClick={() => select(null)} /> : undefined}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <KindMark kind={selected.kind} focus={selected.focus} />
              {kindLabel(selected.kind)}
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
                  <KindMark kind={n.kind} focus={n.focus} />
                  <span className="min-w-0 flex-1 truncate">
                    {n.kind === "fields" ? "Same certificate details" : n.label}
                    {n.focus && <span className="text-ink-3"> (this application)</span>}
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{kindLabel(n.kind)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
