import clsx from "clsx";
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Skeleton } from "../../components/ui/Feedback";
import type { BBox, DocumentDetail } from "../../types";
import { LAYERS, type LayerId, type OverlayBox } from "./overlays";

export interface Focus {
  page: number;
  bbox: BBox;
  label?: string | null;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export function DocumentViewer({
  doc,
  page,
  onPage,
  overlays,
  visible,
  focus,
  onBoxClick,
}: {
  doc: DocumentDetail;
  page: number;
  onPage: (p: number) => void;
  overlays: OverlayBox[];
  visible: Record<LayerId, boolean>;
  focus: Focus | null;
  onBoxClick?: (b: OverlayBox) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(640);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const pageCount = Math.max(doc.page_count || 0, doc.pages.length, 1);
  const info = doc.pages.find((p) => p.page_no === page);
  const unitsW = info?.width ?? (doc.mime.startsWith("image/") ? natural?.w : undefined);
  const unitsH = info?.height ?? (doc.mime.startsWith("image/") ? natural?.h : undefined);
  const width = Math.round(fit * zoom);
  const height = unitsW && unitsH ? Math.round((width * unitsH) / unitsW) : natural ? Math.round((width * natural.h) / natural.w) : Math.round(width * 1.414);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.max(240, el.clientWidth - 32)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setNatural(null);
  }, [doc.id, page]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !focus || focus.page !== page || !unitsW || !unitsH || !loaded) return;
    const y = (focus.bbox[1] / unitsH) * height;
    const x = (focus.bbox[0] / unitsW) * width;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), left: Math.max(0, x - 80), behavior: "smooth" });
  }, [focus, page, unitsW, unitsH, width, height, loaded]);

  const boxes = overlays.filter((b) => b.page === page && visible[b.layer]);
  const layerStyle = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
  const zoomIndex = ZOOMS.findIndex((z) => z >= zoom - 0.001);

  function onBoxKey(e: KeyboardEvent<SVGRectElement>, b: OverlayBox) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onBoxClick?.(b);
    }
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg disabled:opacity-40"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="sr-only">Page</span>
            <select
              value={page}
              onChange={(e) => onPage(Number(e.target.value))}
              className="h-7 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-fg"
            >
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  Page {p}
                </option>
              ))}
            </select>
            <span>of {pageCount}</span>
          </label>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg disabled:opacity-40"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg disabled:opacity-40"
            onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])}
            disabled={zoomIndex <= 0}
            aria-label="Zoom out"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="w-11 text-center text-xs font-medium text-muted tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg disabled:opacity-40"
            onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])}
            disabled={zoomIndex >= ZOOMS.length - 1}
            aria-label="Zoom in"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-subtle hover:text-fg"
            onClick={() => setZoom(1)}
          >
            <Maximize2 aria-hidden className="size-3.5" /> Fit width
          </button>
        </div>
      </div>
      <div ref={scroller} className="relative h-[min(78vh,980px)] overflow-auto bg-sunken p-4">
        <div className="relative mx-auto bg-white shadow-md ring-1 ring-black/5" style={{ width, height }}>
          {!loaded && !failed && <Skeleton className="absolute inset-0 rounded-none" />}
          {failed ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
              The page image could not be rendered.
            </div>
          ) : (
            <img
              key={`${doc.id}-${page}`}
              src={api.pageImageUrl(doc.id, page)}
              alt={`Page ${page} of ${doc.original_filename}`}
              width={width}
              height={height}
              draggable={false}
              onLoad={(e) => {
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
                setLoaded(true);
              }}
              onError={() => setFailed(true)}
              className={clsx("block size-full select-none transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            />
          )}
          {loaded && unitsW && unitsH && (
            <svg
              viewBox={`0 0 ${unitsW} ${unitsH}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full animate-fade-in"
              aria-label="Region overlays"
              role="group"
            >
              {boxes.map((b) => {
                const l = layerStyle[b.layer];
                const [x0, y0, x1, y1] = b.bbox;
                return (
                  <rect
                    key={b.key}
                    x={x0 - 1}
                    y={y0 - 1}
                    width={Math.max(2, x1 - x0 + 2)}
                    height={Math.max(2, y1 - y0 + 2)}
                    rx={1.5}
                    fill={l.fill}
                    fillOpacity={b.layer === "rows" ? 0.06 : 0.12}
                    stroke={l.stroke}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    tabIndex={onBoxClick ? 0 : undefined}
                    role={onBoxClick ? "button" : undefined}
                    aria-label={b.label}
                    onClick={() => onBoxClick?.(b)}
                    onKeyDown={(e) => onBoxKey(e, b)}
                    className={clsx("ov-box", onBoxClick && "cursor-pointer outline-none")}
                  >
                    <title>{b.label}</title>
                  </rect>
                );
              })}
              {focus && focus.page === page && (
                <g pointerEvents="none">
                  <rect
                    x={focus.bbox[0] - 3}
                    y={focus.bbox[1] - 3}
                    width={Math.max(4, focus.bbox[2] - focus.bbox[0] + 6)}
                    height={Math.max(4, focus.bbox[3] - focus.bbox[1] + 6)}
                    rx={2}
                    fill="none"
                    stroke="var(--ov-focus)"
                    vectorEffect="non-scaling-stroke"
                    className="animate-pulse-ring"
                  />
                  <rect
                    x={focus.bbox[0] - 3}
                    y={focus.bbox[1] - 3}
                    width={Math.max(4, focus.bbox[2] - focus.bbox[0] + 6)}
                    height={Math.max(4, focus.bbox[3] - focus.bbox[1] + 6)}
                    rx={2}
                    fill="var(--ov-focus)"
                    fillOpacity={0.14}
                    stroke="var(--ov-focus)"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
            </svg>
          )}
          {loaded && focus && focus.page === page && unitsW && unitsH && (
            <span
              className="pointer-events-none absolute z-10 -translate-y-full rounded-t-md bg-ov-focus px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-black shadow"
              style={{ left: `${(focus.bbox[0] / unitsW) * 100}%`, top: `calc(${(focus.bbox[1] / unitsH) * 100}% - 3px)` }}
            >
              {focus.label || "Highlighted region"}
            </span>
          )}
        </div>
        {loaded && !unitsW && (
          <p className="mt-3 text-center text-xs text-muted">
            Page geometry is not available because this document has not been processed yet, so overlays are hidden.
          </p>
        )}
      </div>
    </div>
  );
}
