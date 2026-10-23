import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { ArrowUpRight, MousePointerClick, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { pluralize } from "../../../lib/format";
import { graphKindMeta, humanize } from "../../../lib/labels";
import type { Finding, GraphEdge, GraphNode } from "../../../types";
import { SeverityMeter } from "../../../ui/Blocks";
import { IconButton } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { dur, ease } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState } from "../../../ui/States";
import { useWorkspace } from "../context";
import { appPath, useWidth } from "../data";
import { PaneLabel } from "../parts";

const KIND_COLOR: Record<string, string> = {
  application: "var(--brand-500)",
  faculty: "var(--ev-3)",
  ref: "var(--ev-5)",
  sha256: "var(--mismatch-dot)",
  phash: "var(--ev-6)",
  minhash: "var(--ev-4)",
  fields: "var(--ev-5)",
};
const HEIGHT = 480;
const SPLIT_AT = 900;

interface SimNode extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
  depth: number;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const appIdOf = (n: GraphNode) => (n.kind === "application" ? n.id.replace(/^app:/, "") : null);

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

/** Breadth-first distance from the focus application, used to order the reveal. */
function depths(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const d = new Map<string, number>();
  const start = nodes.find((n) => n.focus) ?? nodes[0];
  if (!start) return d;
  d.set(start.id, 0);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) {
      const other = e.source === id ? e.target : e.target === id ? e.source : null;
      if (other && !d.has(other)) {
        d.set(other, d.get(id)! + 1);
        queue.push(other);
      }
    }
  }
  for (const n of nodes) if (!d.has(n.id)) d.set(n.id, 3);
  return d;
}

function layout(nodes: GraphNode[], edges: GraphEdge[], width: number): Map<string, { x: number; y: number }> {
  const dep = depths(nodes, edges);
  const sim: SimNode[] = nodes.map((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    const r = n.focus ? 0 : 60 + (dep.get(n.id) ?? 1) * 70;
    return { id: n.id, node: n, depth: dep.get(n.id) ?? 1, x: Math.cos(a) * r, y: Math.sin(a) * r, ...(n.focus ? { fx: 0, fy: 0 } : {}) };
  });
  const links: SimulationLinkDatum<SimNode>[] = edges.map((e) => ({ source: e.source, target: e.target }));
  const s = forceSimulation(sim)
    .force("link", forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance((l) => {
      const a = l.source as SimNode;
      const b = l.target as SimNode;
      return a.node.kind === "application" && b.node.kind === "application" ? 200 : 110;
    }).strength(0.7))
    .force("charge", forceManyBody().strength(-520))
    .force("collide", forceCollide<SimNode>().radius((d) => (d.node.kind === "application" ? 64 : 34)))
    .force("x", forceX(0).strength(width < 600 ? 0.12 : 0.04))
    .force("y", forceY(0).strength(0.09))
    .stop();
  for (let i = 0; i < 300; i++) s.tick();
  const out = new Map<string, { x: number; y: number }>();
  for (const n of sim) out.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  return out;
}

function Cube({ color, size = 18 }: { color: string; size?: number }) {
  const s = size / 20;
  return (
    <g transform={`translate(${-10 * s} ${-11 * s}) scale(${s})`}>
      <path d="M10 1 19 6 10 11 1 6Z" style={{ fill: `color-mix(in oklab, ${color} 42%, white)` }} />
      <path d="M1 6 10 11 10 21 1 16Z" style={{ fill: color }} />
      <path d="M19 6 10 11 10 21 19 16Z" style={{ fill: `color-mix(in oklab, ${color} 70%, black)` }} />
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}...` : s;
}

export function RelationshipsTab() {
  const { app, run, runLoading, findings } = useWorkspace();
  const reduce = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("node");
  const select = useCallback(
    (id: string | null) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (id) n.set("node", id);
          else n.delete("node");
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const width = useWidth(wrap);
  const split = width >= SPLIT_AT;
  const graph = run?.graph;
  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges = useMemo(() => graph?.edges ?? [], [graph]);

  const base = useMemo(() => (nodes.length ? layout(nodes, edges, width) : new Map()), [nodes, edges, width >= 600]); // eslint-disable-line react-hooks/exhaustive-deps
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  useEffect(() => setMoved({}), [base]);

  const pos = useCallback((id: string) => moved[id] ?? base.get(id) ?? { x: 0, y: 0 }, [moved, base]);
  const dep = useMemo(() => depths(nodes, edges), [nodes, edges]);

  // The view box fits the laid-out graph, computed once per layout so dragging does not rescale it
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
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return { x: 0, y: 0 };
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

  if (!app.latest_run) return <EmptyState sky title="Not validated yet" description="Cross-application checks run as part of validation." />;
  if (runLoading || !run) return <Skeleton className="h-[480px]" rounded="lg" />;
  if (!nodes.length || !edges.length)
    return (
      <EmptyState
        sky
        title="No links to other applications"
        description="No shared faculty, certificate numbers, identical files or near-duplicate documents were found across applications in this academic year."
      />
    );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const related = selected ? relatedFindings(selected, edges, findings ?? []) : [];
  const kinds = [...new Set(nodes.map((n) => n.kind))];
  const peers = nodes.filter((n) => n.kind === "application" && !n.focus);
  const codes = [...new Set(edges.map((e) => e.code))];
  const titleFor = (code: string) => (findings ?? []).find((f) => f.code === code)?.title ?? humanize(code.replace(/^XA-/, "").toLowerCase());

  const panel = (
    <aside aria-label="Selected node" className={cn("rounded-card border border-line bg-surface p-4 shadow-xs", split && "sticky top-32")}>
      <AnimatePresence mode="wait" initial={false}>
        {selected ? (
          <motion.div key={selected.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui, ease: ease.out }}>
            <div className="eyebrow mb-1 flex items-center gap-1.5">
              <svg width="14" height="15" viewBox="-8 -8 16 17" aria-hidden>
                <Cube color={KIND_COLOR[selected.kind] ?? "var(--ink-3)"} size={14} />
              </svg>
              {graphKindMeta[selected.kind]?.label ?? humanize(selected.kind)}
            </div>
            <h3 className="font-display text-md font-semibold tracking-title break-words text-ink">{selected.label}</h3>
            {selected.kind === "application" && <p className="mt-0.5 font-mono text-xs text-ink-3">{appIdOf(selected)}</p>}
            <p className="mt-1 text-sm text-ink-3">{graphKindMeta[selected.kind]?.meaning}</p>
            {selected.kind === "application" && !selected.focus && (
              <Link
                to={appPath(appIdOf(selected)!, "relationships")}
                className="mt-3 inline-flex items-center gap-1 rounded-[8px] bg-brand-soft px-2.5 py-1.5 text-sm font-medium text-brand-ink transition-colors hover:bg-brand-100"
              >
                Open {appIdOf(selected)} <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            )}
            <div className="mt-4">
              <PaneLabel aside={<span className="text-xs text-ink-3 tabular">{related.length}</span>}>Related findings</PaneLabel>
              {related.length === 0 ? (
                <p className="text-sm text-ink-3">No findings on this application point at this node.</p>
              ) : (
                <ul className="space-y-1.5">
                  {related.map((f) => (
                    <li key={f.id}>
                      <Link
                        to={appPath(app.id, "findings", { finding: f.id })}
                        className="block rounded-[10px] border border-line px-3 py-2 transition-colors hover:border-line-2 hover:bg-surface-2/60"
                      >
                        <span className="flex items-center gap-2">
                          <SeverityMeter severity={f.severity} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.title}</span>
                          <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-ink-4" />
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-3">{f.message}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <MousePointerClick aria-hidden className="size-4 text-brand-500" /> Select a node
            </div>
            <p className="mt-1 text-sm text-ink-3">Hover to trace its links. Select it to see the findings that connect it to this application. Drag to untangle.</p>
            <div className="mt-4">
              <PaneLabel>Links found</PaneLabel>
              <ul className="space-y-1.5 text-sm">
                {codes.map((c) => (
                  <li key={c} className="flex items-start justify-between gap-3">
                    <span className="text-ink-2">{titleFor(c)}</span>
                    <span className="shrink-0 text-ink-3 tabular">{(findings ?? []).filter((f) => f.code === c).length || edges.filter((e) => e.code === c).length}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );

  return (
    <div ref={wrap} className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 shadow-xs">
        <p className="text-sm text-ink-2">
          Linked to <span className="font-semibold text-ink">{pluralize(peers.length, "other application")}</span> through{" "}
          <span className="font-semibold text-ink">{pluralize(nodes.length - peers.length - 1, "shared item")}</span> in this academic year.
        </p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legend">
          {kinds.map((k) => (
            <li key={k} className="flex items-center gap-1.5 text-xs text-ink-2" title={graphKindMeta[k]?.meaning}>
              {k === "application" ? (
                <span aria-hidden className="size-3 rounded-full border-2 border-brand-500 bg-surface" />
              ) : (
                <svg width="12" height="13" viewBox="-8 -8 16 17" aria-hidden>
                  <Cube color={KIND_COLOR[k] ?? "var(--ink-3)"} size={14} />
                </svg>
              )}
              {graphKindMeta[k]?.label ?? humanize(k)}
            </li>
          ))}
        </ul>
      </section>

      <div className={cn("grid items-start gap-4", split && "grid-cols-[minmax(0,1fr)_minmax(300px,360px)]")}>
        <div className="relative min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-xs">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ backgroundImage: "radial-gradient(circle, var(--line-2) 1px, transparent 1.2px)", backgroundSize: "22px 22px" }}
          />
          <div className="absolute top-2 right-2 z-10">
            <IconButton size="sm" variant="ghost" label="Reset layout" icon={<RotateCcw />} onClick={() => setMoved({})} disabled={!Object.keys(moved).length} />
          </div>
          <svg
            ref={svg}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            width="100%"
            height={HEIGHT}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Relationship graph: ${pluralize(nodes.length, "node")} and ${pluralize(edges.length, "link")}`}
            className="relative block touch-none select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) select(null);
            }}
          >
            <g>
              {edges.map((e, i) => {
                const a = pos(e.source);
                const b = pos(e.target);
                const on = edgeLit(e);
                const d = Math.max(dep.get(e.source) ?? 0, dep.get(e.target) ?? 0);
                return (
                  <motion.line
                    key={`${e.source}-${e.target}-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={on && lit ? "var(--brand-400)" : "var(--line-2)"}
                    strokeWidth={on && lit ? 2 : 1.4}
                    strokeDasharray={e.code.includes("REGISTERED") ? "4 4" : undefined}
                    initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: on ? 1 : 0.25 }}
                    transition={{ pathLength: { delay: 0.15 + d * 0.28, duration: dur.story, ease: ease.out }, opacity: { duration: dur.ui } }}
                  >
                    <title>{titleFor(e.code)}</title>
                  </motion.line>
                );
              })}
            </g>
            <g>
              {nodes.map((n) => {
                const p = pos(n.id);
                const on = isLit(n.id);
                const isApp = n.kind === "application";
                const sel = selectedId === n.id;
                const d = dep.get(n.id) ?? 0;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x} ${p.y})`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${graphKindMeta[n.kind]?.label ?? n.kind}: ${n.label}`}
                    aria-pressed={sel}
                    onPointerDown={onDown(n.id)}
                    onPointerMove={onMove}
                    onPointerUp={onUp(n.id)}
                    onPointerEnter={() => setHover(n.id)}
                    onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(sel ? null : n.id);
                      }
                    }}
                    className="cursor-grab outline-none active:cursor-grabbing"
                  >
                    <motion.g
                      initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: on ? 1 : 0.3, scale: 1 }}
                      transition={{ opacity: { duration: dur.ui }, scale: { delay: d * 0.28, type: "spring", stiffness: 420, damping: 30 } }}
                    >
                      {isApp ? (
                        <>
                          {n.focus && <circle r={38} fill="var(--brand-400)" opacity={0.12} />}
                          <circle
                            r={n.focus ? 28 : 22}
                            fill="var(--surface)"
                            stroke={n.focus ? "var(--brand-500)" : "var(--ink-3)"}
                            strokeWidth={sel ? 3.5 : n.focus ? 3 : 2}
                          />
                          <g transform="translate(0 1)">
                            <Cube color={n.focus ? "var(--brand-500)" : "var(--ink-3)"} size={n.focus ? 22 : 18} />
                          </g>
                          <text y={n.focus ? 46 : 39} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--ink)" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}>
                            {truncate(n.label, 30)}
                          </text>
                          <text y={n.focus ? 60 : 53} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)" fontFamily="var(--font-mono)" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}>
                            {appIdOf(n)}
                            {n.focus ? " (this)" : ""}
                          </text>
                        </>
                      ) : (
                        <>
                          <rect x={-15} y={-15} width={30} height={30} rx={8} fill={sel ? "var(--brand-soft)" : "transparent"} stroke={sel ? "var(--brand-400)" : "none"} strokeWidth={1.5} />
                          <Cube color={KIND_COLOR[n.kind] ?? "var(--ink-3)"} size={20} />
                          <text y={28} textAnchor="middle" fontSize={10.5} fill="var(--ink-2)" fontFamily="var(--font-mono)" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}>
                            {truncate(n.kind === "fields" ? "same details" : n.label, 18)}
                          </text>
                        </>
                      )}
                    </motion.g>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        {panel}
      </div>
    </div>
  );
}
