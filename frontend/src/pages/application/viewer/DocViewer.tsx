import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { api } from "../../../api";
import type { BBox, DocumentDetail, Finding } from "../../../types";
import { cn, dur2, ease2, IconButton, Skeleton } from "../../../ui2";
import { isLlmMethod, methodLabel } from "../data";
import { buildOverlays, LAYERS, type LayerId, type OverlayBox } from "./overlays";

export interface Focus {
  page: number;
  bbox: BBox;
  label?: string | null;
}

const ZMIN = 0.5;
const ZMAX = 3;
const ZSTEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export const ALL_LAYERS: Record<LayerId, boolean> = { fields: true, findings: true, qr: true, rows: true, instruction: true };

export function LayerToggles({
  visible,
  onToggle,
  counts,
}: {
  visible: Record<LayerId, boolean>;
  onToggle: (id: LayerId) => void;
  counts: Partial<Record<LayerId, number>>;
}) {
  return (
    <div role="group" aria-label="Overlay layers" className="flex flex-wrap items-center gap-1">
      {LAYERS.filter((l) => counts[l.id]).map((l) => {
        const on = visible[l.id];
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            title={l.meaning}
            onClick={() => onToggle(l.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-control border px-2 text-xs font-medium transition-colors duration-150",
              on ? "border-line-2 bg-surface text-ink" : "border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className="size-2.5 rounded-[2px] border-[1.5px]"
              style={{ borderColor: l.color, background: on ? `color-mix(in oklab, ${l.color} 35%, transparent)` : "transparent" }}
            />
            {l.label}
            <span className="text-ink-3 tabular-nums">{counts[l.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A document page with its overlays, in an evidence frame: page navigation, layer
 * toggles and zoom in the frame header, the page on a neutral stage below.
 */
export function DocViewer({
  doc,
  findings,
  page,
  onPage,
  focus,
  onBoxClick,
  isClickable = (b) => !!b.findingId,
  peek,
  onHover,
  className,
  stageClassName,
  pageUrl,
  title,
  meta,
}: {
  doc: DocumentDetail;
  findings: Finding[];
  page: number;
  onPage: (p: number) => void;
  focus: Focus | null;
  onBoxClick?: (b: OverlayBox) => void;
  isClickable?: (b: OverlayBox) => boolean;
  /** Overlay key to emphasise, for a hover preview from outside the viewer */
  peek?: string | null;
  onHover?: (b: OverlayBox | null) => void;
  className?: string;
  stageClassName?: string;
  /** Page image source for a file that is not stored as an application document */
  pageUrl?: (page: number) => string;
  /** Frame title, usually the document type */
  title?: ReactNode;
  /** One line under the title: filename, pages, text source */
  meta?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(ALL_LAYERS);
  const [hover, setHover] = useState<OverlayBox | null>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);

  const overlays = useMemo(() => buildOverlays(doc, findings), [doc, findings]);
  const counts = useMemo(() => {
    const c: Partial<Record<LayerId, number>> = {};
    for (const b of overlays) c[b.layer] = (c[b.layer] ?? 0) + 1;
    return c;
  }, [overlays]);

  const pageCount = Math.max(doc.page_count || 0, doc.pages.length, 1);
  const info = doc.pages.find((p) => p.page_no === page);
  const unitsW = info?.width ?? natural?.w;
  const unitsH = info?.height ?? natural?.h;
  const width = Math.max(200, Math.round(fit * zoom));
  const height = unitsW && unitsH ? Math.round((width * unitsH) / unitsW) : Math.round(width * 1.414);
  // page units to image pixels, then image pixels to displayed pixels
  const scale = unitsW && natural ? (natural.w / unitsW) * (width / natural.w) : unitsW ? width / unitsW : 1;

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.max(200, el.clientWidth - 32)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setHover(null);
  }, [doc.id, page]);

  useEffect(() => {
    onHover?.(hover);
  }, [hover, onHover]);

  // Scroll the focused region into view once the page has rendered
  useEffect(() => {
    const el = stage.current;
    if (!el || !focus || focus.page !== page || !loaded) return;
    const y = focus.bbox[1] * scale;
    const x = focus.bbox[0] * scale;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), left: Math.max(0, x - 80), behavior: reduce ? "auto" : "smooth" });
  }, [focus, page, loaded, scale, reduce]);

  // ctrl + wheel zooms; the listener must be non-passive to stop the browser zoom
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(ZMAX, Math.max(ZMIN, +(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)).toFixed(3))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onLoad = useCallback((w: number, h: number) => {
    setNatural({ w, h });
    setLoaded(true);
  }, []);

  const boxes = overlays.filter((b) => b.page === page && visible[b.layer]).sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  const zi = ZSTEPS.findIndex((z) => z >= zoom - 0.001);
  const pannable = zoom > 1.001;

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    if (!pannable || e.button !== 0) return;
    const el = stage.current!;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
  }
  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.moved) {
      stage.current!.scrollLeft = d.sl - dx;
      stage.current!.scrollTop = d.st - dy;
    }
  }
  function onPointerUp(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  }

  const showFocus = !!focus && focus.page === page && loaded && !!unitsW;

  const controls = (
    <>
      <div className="flex items-center gap-0.5" role="group" aria-label="Pages">
        <IconButton size="sm" label="Previous page" icon={<ChevronLeft />} disabled={page <= 1} onClick={() => onPage(page - 1)} />
        <span className="min-w-20 text-center text-xs font-medium text-ink-2 tabular-nums" aria-live="polite">
          Page {page} of {pageCount}
        </span>
        <IconButton size="sm" label="Next page" icon={<ChevronRight />} disabled={page >= pageCount} onClick={() => onPage(page + 1)} />
      </div>
      <LayerToggles visible={visible} counts={counts} onToggle={(id) => setVisible((v) => ({ ...v, [id]: !v[id] }))} />
      <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
        <IconButton size="sm" label="Zoom out" icon={<ZoomOut />} disabled={zoom <= ZMIN + 0.001} onClick={() => setZoom(ZSTEPS[Math.max(0, zi - 1)])} />
        <button
          type="button"
          onClick={() => setZoom(1)}
          title="Fit to width"
          className="inline-flex h-7 min-w-11 items-center justify-center rounded-control text-xs font-medium text-ink-2 tabular-nums hover:bg-surface-2"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton
          size="sm"
          label="Zoom in"
          icon={<ZoomIn />}
          disabled={zoom >= ZMAX - 0.001}
          onClick={() => setZoom(ZSTEPS[Math.min(ZSTEPS.length - 1, zi < 0 ? ZSTEPS.length - 1 : zi + 1)])}
        />
        <IconButton size="sm" label="Fit to width" icon={<Maximize2 />} onClick={() => setZoom(1)} />
      </div>
    </>
  );

  return (
    <figure className={cn("flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface", className)}>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2">
        {(title || meta) && (
          <div className="min-w-0 basis-full 2xl:basis-auto">
            {title && <div className="truncate text-sm font-medium text-ink">{title}</div>}
            {meta && <div className="text-xs text-ink-3">{meta}</div>}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">{controls}</div>
      </figcaption>

      <div
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        className={cn("relative min-h-0 flex-1 overflow-auto bg-surface-2 p-4", pannable && "cursor-grab active:cursor-grabbing", stageClassName)}
      >
        {fit > 0 && (
          <div className="relative mx-auto bg-white shadow-xs ring-1 ring-line" style={{ width, height }}>
            {!loaded && !failed && <Skeleton className="absolute inset-0" rounded="sm" />}
            {failed ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-3">The page image could not be rendered.</div>
            ) : (
              <img
                key={`${doc.id}-${page}`}
                src={pageUrl ? pageUrl(page) : api.pageImageUrl(doc.id, page)}
                alt={`Page ${page} of ${doc.original_filename}`}
                draggable={false}
                onLoad={(e) => onLoad(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                onError={() => setFailed(true)}
                className={cn("block size-full select-none transition-opacity duration-150", loaded ? "opacity-100" : "opacity-0")}
              />
            )}

            {loaded && unitsW && (
              <svg width={width} height={height} className="absolute inset-0 overflow-visible" role="group" aria-label="Region overlays">
                {boxes.map((b) => {
                  const l = LAYERS.find((x) => x.id === b.layer)!;
                  const [x0, y0, x1, y1] = b.bbox;
                  const clickable = !!onBoxClick && isClickable(b);
                  const lit = hover?.key === b.key || peek === b.key;
                  return (
                    <rect
                      key={b.key}
                      x={x0 * scale - 2}
                      y={y0 * scale - 2}
                      width={Math.max(4, (x1 - x0) * scale + 4)}
                      height={Math.max(4, (y1 - y0) * scale + 4)}
                      rx={2}
                      style={{ fill: l.color, fillOpacity: lit ? 0.24 : b.layer === "rows" ? 0.05 : 0.1, stroke: l.color }}
                      strokeWidth={lit ? 2.2 : 1.4}
                      tabIndex={0}
                      role={clickable ? "button" : "img"}
                      aria-label={`${b.title}${b.value ? `: ${b.value}` : ""}`}
                      onPointerEnter={() => setHover(b)}
                      onPointerLeave={() => setHover((h) => (h?.key === b.key ? null : h))}
                      onFocus={() => setHover(b)}
                      onBlur={() => setHover((h) => (h?.key === b.key ? null : h))}
                      onClick={() => clickable && onBoxClick?.(b)}
                      onKeyDown={(e) => {
                        if (clickable && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onBoxClick?.(b);
                        }
                      }}
                      className={cn("outline-none transition-[fill-opacity,stroke-width] duration-150 focus-visible:[stroke-width:3]", clickable && "cursor-pointer")}
                    />
                  );
                })}
                {showFocus && <FocusBox key={`${focus!.page}-${focus!.bbox.join(",")}`} bbox={focus!.bbox} scale={scale} still={!!reduce} />}
              </svg>
            )}

            {showFocus && (
              <span
                className="pointer-events-none absolute z-10 -translate-y-full rounded-t-[4px] bg-ov-focus px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-white"
                style={{ left: focus!.bbox[0] * scale - 4, top: focus!.bbox[1] * scale - 5 }}
              >
                {focus!.label || "Highlighted region"}
              </span>
            )}

            {hover && unitsW && <BoxTip key={hover.key} box={hover} scale={scale} pageWidth={width} />}
          </div>
        )}
        {loaded && !info && doc.mime === "application/pdf" && (
          <p className="mt-3 text-center text-xs text-ink-3">Page geometry is not available for this document, so overlays may be offset.</p>
        )}
      </div>
    </figure>
  );
}

/** The focus region draws its outline, then pulses once to pull the eye to it. Static under reduced motion. */
function FocusBox({ bbox, scale, still }: { bbox: BBox; scale: number; still: boolean }) {
  const [x0, y0, x1, y1] = bbox;
  const x = x0 * scale - 5;
  const y = y0 * scale - 5;
  const w = Math.max(8, (x1 - x0) * scale + 10);
  const h = Math.max(8, (y1 - y0) * scale + 10);
  if (still) {
    return (
      <g pointerEvents="none">
        <rect x={x} y={y} width={w} height={h} rx={3} fill="var(--ov-focus)" fillOpacity={0.16} stroke="var(--ov-focus)" strokeWidth={2.5} />
      </g>
    );
  }
  return (
    <g pointerEvents="none">
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill="var(--ov-focus)"
        initial={{ fillOpacity: 0 }}
        animate={{ fillOpacity: 0.16 }}
        transition={{ delay: 0.35, duration: dur2.base }}
      />
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill="none"
        stroke="var(--ov-focus)"
        strokeWidth={2.5}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: ease2 }}
      />
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill="none"
        stroke="var(--ov-focus)"
        strokeWidth={2}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        initial={{ opacity: 0, scale: 1 }}
        animate={{ opacity: [0, 0.9, 0], scale: [1, 1, 1.3] }}
        transition={{ delay: 0.5, duration: 0.6, ease: ease2, times: [0, 0.15, 1] }}
      />
    </g>
  );
}

function BoxTip({ box, scale, pageWidth }: { box: OverlayBox; scale: number; pageWidth: number }) {
  const l = LAYERS.find((x) => x.id === box.layer)!;
  const left = Math.min(Math.max(0, box.bbox[0] * scale), Math.max(0, pageWidth - 280));
  const top = box.bbox[3] * scale + 8;
  const llm = isLlmMethod(box.method);
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-max max-w-[280px] rounded-control border border-line bg-surface px-3 py-2 text-xs text-ink shadow-lg"
      style={{ left, top }}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <span aria-hidden className="size-2 rounded-[2px]" style={{ background: l.color }} />
        {box.title}
      </span>
      {box.value && <span className="mt-1 block font-mono break-words text-ink-2">{box.value}</span>}
      {box.method && (
        <span className={cn("mt-1 block", llm ? "text-manual-fg" : "text-ink-3")}>
          {methodLabel(box.method)}
          {llm && <span className="block font-mono text-ink-3">{box.method}</span>}
        </span>
      )}
    </div>
  );
}
