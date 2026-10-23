import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn, IconButton } from "../../ui2";
import { glyphUri, KIND_META, useGraphTheme, type GraphTheme, type NodeKind } from "./graphTheme";

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  /** The application the view is about */
  focus?: boolean;
  /** Smaller and quieter, for applications with no shared evidence */
  quiet?: boolean;
  /** Compound frame this node sits in */
  parent?: string;
  /** Labels set in IBM Plex Mono (IDs and numbers) */
  mono?: boolean;
  title?: string;
}

export interface GEdge {
  id: string;
  source: string;
  target: string;
  kind: NodeKind;
  label?: string;
  /** Label shown when nothing is traced; defaults to label */
  restLabel?: string;
  /** Number of shared items an application-to-application edge stands for */
  weight?: number;
  /** Bend of the curve in px; the sign picks the side */
  bend?: number;
}

export interface GFrame {
  id: string;
  label: string;
}

interface Props {
  nodes: GNode[];
  edges: GEdge[];
  frames?: GFrame[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Highlight from outside the canvas, such as a hovered list row */
  hovered?: string | null;
  onHover?: (id: string | null) => void;
  height: number;
  label: string;
  className?: string;
}

const FIT_PAD = 28;
const MAX_FIT_ZOOM = 1.1;

/** Fits the graph to the view without blowing a small graph up past a comfortable reading size. */
function fitView(cy: Core) {
  cy.fit(undefined, FIT_PAD);
  if (cy.zoom() > MAX_FIT_ZOOM) {
    cy.zoom(MAX_FIT_ZOOM);
    cy.center();
  }
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function stylesheet(t: GraphTheme): StylesheetJson {
  const glyphOnKind = t.dark ? "#16161a" : "#ffffff";
  const kinds = Object.keys(t.kind) as (keyof GraphTheme["kind"])[];
  return [
    {
      selector: "node",
      style: {
        "font-family": t.sans,
        "font-size": 12,
        color: t.ink2,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 7,
        "text-wrap": "wrap",
        "text-max-width": "150px",
        "line-height": 1.3,
        "text-background-color": t.surface,
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "min-zoomed-font-size": 6,
        "overlay-opacity": 0,
        "transition-property": "opacity",
        "transition-duration": reducedMotion() ? 0 : 150,
      },
    },
    {
      selector: "node[kind = 'application']",
      style: {
        width: 52,
        height: 52,
        shape: "ellipse",
        "background-color": t.surface,
        "border-width": 2,
        "border-color": t.ink3,
        "background-image": glyphUri("application", t.ink2),
        "background-width": "50%",
        "background-height": "50%",
        "background-clip": "none",
        "font-size": 13,
        "font-weight": 600,
        color: t.ink,
        "text-margin-y": 8,
      },
    },
    {
      selector: "node[kind = 'application'][?quiet]",
      style: {
        width: 38,
        height: 38,
        "border-width": 1.5,
        "border-color": t.line2,
        "background-image": glyphUri("application", t.ink4),
        "font-size": 12,
        "font-weight": 500,
        color: t.ink3,
      },
    },
    {
      selector: "node[kind = 'application'][?focus]",
      style: {
        width: 64,
        height: 64,
        "border-width": 3,
        "border-color": t.brand,
        "background-color": t.surface,
        "background-image": glyphUri("application", t.brand),
      },
    },
    ...kinds.map((k) => ({
      selector: `node[kind = '${k}']`,
      style: {
        width: 34,
        height: 34,
        shape: "ellipse" as const,
        "background-color": t.kind[k],
        "border-width": 2,
        "border-color": t.surface,
        "background-image": glyphUri(k, glyphOnKind),
        "background-width": "52%",
        "background-height": "52%",
      },
    })),
    { selector: "node[?mono]", style: { "font-family": t.mono, "font-size": 12 } },
    {
      selector: ":parent",
      style: {
        shape: "round-rectangle",
        "background-color": t.surface,
        "background-opacity": 1,
        "border-width": 1,
        "border-color": t.line2,
        "corner-radius": 8,
        padding: "28px",
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": -8,
        "text-max-width": "900px",
        "font-size": 12,
        "font-weight": 500,
        color: t.ink3,
        "text-background-opacity": 0,
        "background-image": "none",
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.6,
        "line-color": t.line2,
        "curve-style": "unbundled-bezier",
        "control-point-distances": "data(bend)",
        "control-point-weights": 0.5,
        label: "data(restLabel)",
        "font-family": t.sans,
        "font-size": 11,
        color: t.ink3,
        "text-rotation": "autorotate",
        "text-background-color": t.surface,
        "text-background-opacity": 1,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "min-zoomed-font-size": 7,
        "overlay-opacity": 0,
        "transition-property": "opacity, line-color, width",
        "transition-duration": reducedMotion() ? 0 : 150,
      },
    },
    ...kinds.map((k) => ({
      selector: `edge[kind = '${k}']`,
      style: {
        "line-color": t.kind[k],
        "line-opacity": 0.55,
        "line-style": KIND_META[k].line,
        "line-dash-pattern": KIND_META[k].line === "dotted" ? [2, 4] : [6, 4],
      },
    })),
    { selector: "edge[kind = 'application']", style: { "line-color": t.ink4, "line-opacity": 0.6, width: "mapData(weight, 1, 6, 1.6, 6)" } },
    { selector: ".faded", style: { opacity: 0.16 } },
    { selector: "edge.lit", style: { "line-opacity": 1, width: 2.4, color: t.ink2, label: "data(label)" } },
    { selector: "edge.lit[kind = 'application']", style: { width: "mapData(weight, 1, 6, 2.4, 7)" } },
    { selector: "node.lit", style: { color: t.ink } },
    {
      selector: "node:selected, node.sel",
      style: { "border-width": 3, "border-color": t.focus, "underlay-color": t.focus, "underlay-opacity": 0.18, "underlay-padding": 6, "underlay-shape": "ellipse" },
    },
  ] as StylesheetJson;
}

function toElements(nodes: GNode[], edges: GEdge[], frames: GFrame[]): ElementDefinition[] {
  return [
    ...frames.map((f) => ({ group: "nodes" as const, data: { id: f.id, label: f.label, frame: true }, selectable: false })),
    ...nodes.map((n) => ({
      group: "nodes" as const,
      data: { id: n.id, kind: n.kind, label: n.label, focus: !!n.focus, quiet: !!n.quiet, mono: !!n.mono, parent: n.parent },
      position: { x: n.x, y: n.y },
    })),
    ...edges.map((e) => ({
      group: "edges" as const,
      data: { id: e.id, source: e.source, target: e.target, kind: e.kind, label: e.label ?? "", restLabel: e.restLabel ?? e.label ?? "", weight: e.weight ?? 1, bend: e.bend ?? 0 },
    })),
  ];
}

/** A deterministic, preset-position graph drawn with Cytoscape.js; layout is the caller's. */
export function GraphCanvas({ nodes, edges, frames = [], selected, onSelect, hovered, onHover, height, label, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const theme = useGraphTheme();
  const [innerHover, setInnerHover] = useState<string | null>(null);
  const cb = useRef({ onSelect, onHover });
  cb.current = { onSelect, onHover };
  const elements = useMemo(() => toElements(nodes, edges, frames), [nodes, edges, frames]);

  useEffect(() => {
    if (!box.current) return;
    const cy = cytoscape({
      container: box.current,
      elements: [],
      layout: { name: "preset" },
      minZoom: 0.3,
      maxZoom: 2.5,
      userZoomingEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: true,
      autounselectify: true,
      wheelSensitivity: 0.2,
    });
    cy.on("tap", "node", (ev) => {
      const id = ev.target.id();
      if (ev.target.data("frame")) return;
      cb.current.onSelect(id);
    });
    cy.on("tap", (ev) => {
      if (ev.target === cy) cb.current.onSelect(null);
    });
    cy.on("mouseover", "node", (ev) => {
      if (ev.target.data("frame")) return;
      setInnerHover(ev.target.id());
      cb.current.onHover?.(ev.target.id());
      if (box.current) box.current.style.cursor = "pointer";
    });
    cy.on("mouseout", "node", () => {
      setInnerHover(null);
      cb.current.onHover?.(null);
      if (box.current) box.current.style.cursor = "";
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(stylesheet(theme));
  }, [theme]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    cy.layout({ name: "preset", fit: false }).run();
    cy.resize();
    fitView(cy);
  }, [elements]);

  // Refit when the panel changes width, so the picture always fits the view
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.resize();
        fitView(cy);
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const lit = innerHover ?? hovered ?? selected;
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("faded lit sel");
      if (selected) cy.getElementById(selected).addClass("sel");
      if (!lit) return;
      const n = cy.getElementById(lit);
      if (n.empty()) return;
      const hood = n.closedNeighborhood();
      cy.elements().not(hood).not(":parent").addClass("faded");
      hood.addClass("lit");
    });
  }, [lit, selected, elements]);

  const zoomBy = (f: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    const z = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * f));
    const level = { level: z, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } };
    if (reducedMotion()) cy.zoom(level);
    else cy.animate({ zoom: level, duration: 150, easing: "ease-out" });
  };
  const fit = () => {
    const cy = cyRef.current;
    if (!cy) return;
    fitView(cy);
  };

  return (
    <div className={cn("relative", className)}>
      <div ref={box} role="img" aria-label={label} style={{ height }} className="w-full touch-none select-none" />
      <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-control border border-line bg-surface p-0.5 shadow-xs">
        <IconButton size="sm" variant="ghost" label="Zoom in" icon={<Plus />} onClick={() => zoomBy(1.25)} />
        <IconButton size="sm" variant="ghost" label="Zoom out" icon={<Minus />} onClick={() => zoomBy(0.8)} />
        <IconButton size="sm" variant="ghost" label="Fit to view" icon={<Maximize2 />} onClick={fit} />
      </div>
    </div>
  );
}

export default GraphCanvas;
