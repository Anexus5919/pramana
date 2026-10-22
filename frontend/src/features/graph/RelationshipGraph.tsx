import clsx from "clsx";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { type KeyboardEvent, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RelationshipGraph as Graph } from "../../types";

export interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: string;
  label: string;
  focus?: boolean;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  code: string;
}

export const KIND_COLOR: Record<string, string> = {
  application: "var(--primary-ink)",
  faculty: "#0e7490",
  ref: "#b45309",
  sha256: "#7c3aed",
  phash: "#be185d",
  minhash: "#4d7c0f",
  fields: "#4d7c0f",
};

const HEIGHT = 520;

function radius(n: SimNode) {
  if (n.kind === "application") return n.focus ? 24 : 18;
  return 9;
}

export function RelationshipGraph({
  graph,
  selected,
  onSelect,
}: {
  graph: Graph;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const [width, setWidth] = useState(720);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ id: string; pointer: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cx = width / 2;
    const cy = HEIGHT / 2;
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    const nodes: SimNode[] = graph.nodes.map((n, i) => {
      const old = prev.get(n.id);
      const angle = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
      return {
        ...n,
        x: old?.x ?? cx + Math.cos(angle) * 40,
        y: old?.y ?? cy + Math.sin(angle) * 40,
        fx: n.focus ? cx : null,
        fy: n.focus ? cy : null,
      };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, code: e.code }));
    nodesRef.current = nodes;
    linksRef.current = links;

    let frame = 0;
    const s = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => {
            const a = l.source as SimNode;
            const b = l.target as SimNode;
            return a.kind === "application" && b.kind === "application" ? 160 : 95;
          })
          .strength(0.7),
      )
      .force("charge", forceManyBody<SimNode>().strength((n) => (n.kind === "application" ? -520 : -180)))
      .force("collide", forceCollide<SimNode>().radius((n) => radius(n) + 18))
      .force("x", forceX<SimNode>(cx).strength(0.04))
      .force("y", forceY<SimNode>(cy).strength(0.06))
      .alphaDecay(0.035)
      .on("tick", () => {
        for (const n of nodes) {
          const r = radius(n) + 4;
          n.x = Math.max(r, Math.min(width - r, n.x ?? cx));
          n.y = Math.max(r + 4, Math.min(HEIGHT - r - 18, n.y ?? cy));
        }
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            setTick((t) => t + 1);
          });
        }
      });
    sim.current = s;
    return () => {
      s.stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [graph, width]);

  function toSvg(e: PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * HEIGHT };
  }

  function onPointerDown(e: PointerEvent<SVGGElement>, n: SimNode) {
    if (n.focus) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: n.id, pointer: e.pointerId };
    n.fx = n.x;
    n.fy = n.y;
    sim.current?.alphaTarget(0.25).restart();
  }

  function onPointerMove(e: PointerEvent<SVGGElement>, n: SimNode) {
    if (drag.current?.id !== n.id) return;
    const p = toSvg(e);
    n.fx = p.x;
    n.fy = p.y;
  }

  function onPointerUp(n: SimNode) {
    if (drag.current?.id !== n.id) return;
    drag.current = null;
    n.fx = null;
    n.fy = null;
    sim.current?.alphaTarget(0);
  }

  function onKey(e: KeyboardEvent<SVGGElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  }

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const active = hover ?? selected;
  const adjacent = new Set<string>();
  if (active) {
    for (const l of links) {
      const a = (l.source as SimNode).id;
      const b = (l.target as SimNode).id;
      if (a === active) adjacent.add(b);
      if (b === active) adjacent.add(a);
    }
  }

  return (
    <div ref={wrap} className="w-full">
      <svg
        ref={svgRef}
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="group"
        aria-label="Relationship graph between this application, shared entities and other applications"
        className="block touch-none select-none"
      >
        <g>
          {links.map((l, i) => {
            const a = l.source as SimNode;
            const b = l.target as SimNode;
            const lit = !!active && (a.id === active || b.id === active);
            return (
              <line
                key={`${a.id}-${b.id}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lit ? "var(--primary-ink)" : "var(--line-strong)"}
                strokeWidth={lit ? 2 : 1.25}
                strokeOpacity={active && !lit ? 0.35 : 1}
              >
                <title>{l.code}</title>
              </line>
            );
          })}
        </g>
        <g>
          {nodes.map((n) => {
            const r = radius(n);
            const isSel = n.id === selected;
            const dim = !!active && n.id !== active && !adjacent.has(n.id);
            const color = KIND_COLOR[n.kind] ?? "#64748b";
            return (
              <g
                key={n.id}
                transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                tabIndex={0}
                role="button"
                aria-label={`${n.kind === "application" ? "Application" : n.kind} ${n.label}${n.focus ? " (this application)" : ""}`}
                aria-pressed={isSel}
                className={clsx("cursor-pointer outline-none transition-opacity", dim && "opacity-35")}
                onClick={() => onSelect(n.id)}
                onKeyDown={(e) => onKey(e, n.id)}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover(null)}
                onPointerDown={(e) => onPointerDown(e, n)}
                onPointerMove={(e) => onPointerMove(e, n)}
                onPointerUp={() => onPointerUp(n)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
              >
                {(isSel || n.focus) && (
                  <circle r={r + 6} fill="none" stroke={n.focus ? "var(--ov-focus)" : "var(--ring)"} strokeWidth={2.5} />
                )}
                {n.kind === "application" ? (
                  <circle r={r} fill={n.focus ? "var(--primary)" : "var(--surface)"} stroke={color} strokeWidth={n.focus ? 0 : 2.5} />
                ) : (
                  <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={3} fill={color} transform="rotate(45)" />
                )}
                {n.kind === "application" && (
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    className="text-[10px] font-semibold"
                    fill={n.focus ? "var(--primary-on)" : color}
                  >
                    APP
                  </text>
                )}
                <text
                  y={r + 14}
                  textAnchor="middle"
                  className={clsx("text-[11px]", n.kind === "application" ? "font-semibold" : "font-mono")}
                  fill="var(--fg)"
                  paintOrder="stroke"
                  stroke="var(--surface)"
                  strokeWidth={3}
                >
                  {n.label.length > 30 ? `${n.label.slice(0, 29)}...` : n.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
