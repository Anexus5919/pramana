import { ChevronLeft, ChevronRight, FileClock, PenLine, ShieldAlert, SquareDashed } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmtBytes, fmtDateTime, pluralize } from "../../../lib/format";
import type { BBox, DocumentDetail, Finding } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { StatusCube } from "../../../ui/Blocks";
import { IconButton } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { dur, ease, fadeUp, spring, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { Tooltip } from "../../../ui/Tooltip";
import { useWorkspace } from "../context";
import { appPath, validBox } from "../data";
import { CautionNote, PaneLabel, SimTag } from "../parts";
import { historyApi, useRevisions, type Revision, type RevisionChange, type RevisionSignature, type Revisions } from "./api";

const FOCUS_EVENT = "pramana:revision-focus";
const KIND_LABEL: Record<Revision["kind"], string> = { original: "Original", signature: "Signed", edit: "Edited", update: "Updated" };
const ROLE_LABEL: Record<string, string> = { issuer: "Issuer", applicant: "Applicant", unknown: "Unknown signer" };

/** The selected revision lives in the URL, so the stage, the side panel and links share it. */
export function useRevParam(count: number): [number, (n: number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("rev"));
  const rev = count ? Math.min(count, Math.max(1, Number.isFinite(raw) && raw > 0 ? raw : count)) : 1;
  const set = useCallback(
    (n: number) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set("rev", String(n));
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [rev, set];
}

function focusChange(rev: number, page: number) {
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { rev, page } }));
}

/** "Chief Fire Officer Kolhapur, Maharashtra Fire..." reads as "Chief Fire Officer Kolhapur". */
export function signerShort(s: RevisionSignature): string {
  return (s.signer ?? "Unknown signer").split(",")[0].trim();
}

function sigTone(status: string | null): string {
  return status ?? "not_checked";
}

function summaryOf(d: Revisions): string {
  const n = d.revision_count;
  const sigs = d.signatures ?? [];
  if (n <= 1 && !sigs.length) return "One saved revision. The file was not updated after it was first written.";
  if (n <= 1) return "One saved revision, covered by its signature.";
  if (!sigs.length) return `${n} saved revisions and no embedded signature, so no revision carries proof of who saved it.`;
  const through = d.signed_through ?? 0;
  const later = n - through;
  const lead = sigs.map((s) => `${ROLE_LABEL[s.role]?.toLowerCase() ?? "a"} signature covers revisions 1 to ${s.revision}`).join("; ");
  return `${n} saved revisions. The ${lead}.${later > 0 ? ` ${later === 1 ? `Revision ${n} was` : `Revisions ${through + 1} to ${n} were`} saved after signing and ${later === 1 ? "is" : "are"} not covered by any signature.` : ""}`;
}

/* ---------- Scrubber ---------- */

function Scrubber({ data, value, onChange }: { data: Revisions; value: number; onChange: (n: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const revs = data.revisions;
  const n = revs.length;
  const sigs = data.signatures ?? [];
  const through = data.signed_through ?? 0;
  const current = revs[value - 1];

  const pick = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * n)));
    if (i + 1 !== value) onChange(i + 1);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (e.key in step) {
      e.preventDefault();
      onChange(Math.min(n, Math.max(1, value + step[e.key])));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      onChange(e.key === "Home" ? 1 : n);
    }
  };
  const valueText = `Revision ${value} of ${n}, ${KIND_LABEL[current.kind].toLowerCase()}${current.after_last_signature ? ", not covered by any signature" : ""}`;

  return (
    <div className="px-1 pt-1 pb-0.5">
      {/* Coverage bands: what each signature vouches for, and what lies outside every signature */}
      {sigs.length > 0 && (
        <div className="mb-1.5 grid gap-y-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
          {sigs.map((s, i) => (
            <motion.div
              key={`${s.field}-${i}`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: dur.story, ease: ease.out, delay: 0.1 + i * 0.1 }}
              className={cn(
                "flex h-5 origin-left items-center justify-center truncate rounded-full px-2 text-[10.5px] font-semibold",
                s.role === "issuer" ? "bg-verified-bg text-verified-fg" : "bg-surface-2 text-ink-2",
              )}
              style={{ gridColumn: `1 / ${s.revision + 1}`, gridRow: i + 1 }}
            >
              <span className="truncate">
                {ROLE_LABEL[s.role] ?? "Signer"} signature: revision{s.revision > 1 ? `s 1 to ${s.revision}` : " 1"}
              </span>
            </motion.div>
          ))}
          {through < n && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: dur.panel, delay: 0.5 }}
              className="flex h-5 items-center justify-center truncate rounded-full border border-dashed border-mismatch-dot/60 bg-mismatch-bg px-2 text-[10.5px] font-semibold text-mismatch-fg"
              style={{ gridColumn: `${through + 1} / ${n + 1}`, gridRow: 1 }}
            >
              <span className="truncate">Not covered by any signature</span>
            </motion.div>
          )}
        </div>
      )}

      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Revision"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onKeyDown={onKey}
        onPointerDown={(e: RPointerEvent<HTMLDivElement>) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && pick(e.clientX)}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => (dragging.current = false)}
        className="relative grid cursor-pointer touch-none rounded-[12px] py-1 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {/* The rail between the first and last block; the part up to the selection fills */}
        <span aria-hidden className="absolute top-[22px] h-[3px] rounded-full bg-surface-3" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />
        <motion.span
          aria-hidden
          className="absolute top-[22px] h-[3px] origin-left rounded-full bg-brand-400"
          style={{ left: `${50 / n}%`, width: `${(100 * (n - 1)) / n}%` }}
          initial={false}
          animate={{ scaleX: n > 1 ? (value - 1) / (n - 1) : 0 }}
          transition={spring.snappy}
        />
        <LayoutGroup id="rev-scrubber">
          {revs.map((r) => {
            const on = r.n === value;
            const passed = r.n <= value;
            const signed = r.signatures.length > 0;
            const outside = r.after_last_signature;
            return (
              <div key={r.n} className="relative flex min-w-0 flex-col items-center">
                <span className="relative flex size-[46px] items-center justify-center">
                  {on && <motion.span layoutId="rev-thumb" transition={spring.snappy} aria-hidden className="absolute inset-0 rounded-[13px] bg-brand-soft ring-2 ring-brand-400" />}
                  <motion.span
                    aria-hidden
                    animate={{ y: on ? -2 : 0 }}
                    transition={spring.snappy}
                    className={cn(
                      "relative size-7 overflow-hidden rounded-[7px] border-[1.5px] transition-colors duration-200",
                      outside ? "border-mismatch-dot" : "border-brand-500",
                      passed ? (outside ? "bg-mismatch-dot" : "bg-brand-500") : "bg-surface",
                    )}
                  >
                    {passed && <span className="absolute inset-x-0 top-0 h-[5px] bg-white/35" />}
                    {signed && (
                      <span className={cn("absolute inset-0 flex items-center justify-center", passed ? "text-white" : "text-brand-500")}>
                        <PenLine className="size-3.5" />
                      </span>
                    )}
                  </motion.span>
                </span>
                <span className={cn("mt-0.5 text-xs font-semibold tabular", on ? "text-brand-ink" : "text-ink-2")}>Rev {r.n}</span>
                <span className={cn("max-w-full truncate px-1 text-[11px]", outside ? "text-mismatch-fg" : "text-ink-3")}>
                  {signed ? `${signerShort(r.signatures[0])} signed` : KIND_LABEL[r.kind]}
                </span>
              </div>
            );
          })}
        </LayoutGroup>
      </div>
    </div>
  );
}

/* ---------- Stage ---------- */

function ChangeBox({ c, scale, mode, arrive }: { c: RevisionChange & { rev: number }; scale: number; mode: "here" | "earlier" | "later"; arrive: number }) {
  if (!validBox(c.bbox)) return null;
  const [x0, y0, x1, y1] = c.bbox as BBox;
  const x = x0 * scale - 5;
  const y = y0 * scale - 5;
  const w = Math.max(10, (x1 - x0) * scale + 10);
  const h = Math.max(10, (y1 - y0) * scale + 10);
  if (mode !== "here") {
    return (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill="none"
        stroke="var(--ov-focus)"
        strokeOpacity={mode === "later" ? 0.55 : 0.8}
        strokeWidth={1.5}
        strokeDasharray={mode === "later" ? "4 3" : undefined}
      >
        <title>{mode === "later" ? `Changes in revision ${c.rev}` : `Changed in revision ${c.rev}`}</title>
      </rect>
    );
  }
  // Arriving at the revision that introduced a change: the box draws its stroke, then pulses once
  return (
    <g key={arrive}>
      <motion.rect x={x} y={y} width={w} height={h} rx={3} fill="var(--ov-focus)" initial={{ fillOpacity: 0 }} animate={{ fillOpacity: 0.16 }} transition={{ delay: 0.35, duration: dur.ui }} />
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
        transition={{ delay: 0.1, duration: 0.5, ease: ease.out }}
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
        animate={{ opacity: [0, 0.9, 0], scale: [1, 1, 1.35] }}
        transition={{ delay: 0.6, duration: 0.7, ease: ease.out, times: [0, 0.15, 1] }}
      />
    </g>
  );
}

interface Shown {
  rev: number;
  page: number;
  src: string;
}

/** Revisions handed in directly, for a file analysed outside any application. */
export interface RevisionSource {
  data: Revisions;
  pageUrl: (n: number, page: number) => string;
}

export function RevisionStage({ doc, className, source }: { doc: DocumentDetail; className?: string; source?: RevisionSource }) {
  const reduce = useReducedMotion();
  const q = useRevisions(doc.id, !source);
  const data = source?.data ?? q.data;
  const pageUrl = source?.pageUrl ?? ((n: number, p: number) => historyApi.revisionPageUrl(doc.id, n, p));
  const count = data?.revision_count ?? 0;
  const [rev, setRev] = useRevParam(count);
  const firstChangePage = data?.revisions.flatMap((r) => r.changes).find((c) => c.page)?.page ?? 1;
  const [page, setPage] = useState<number | null>(null);
  const pg = page ?? firstChangePage;
  const [shown, setShown] = useState<Shown | null>(null);
  const [failed, setFailed] = useState(false);
  const [arrive, setArrive] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.max(200, el.clientWidth - 40)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  useEffect(() => setPage(null), [doc.id]);

  // Load the target render first, then swap it in, so the crossfade never shows a blank page
  useEffect(() => {
    if (!count) return;
    const src = pageUrl(rev, pg);
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      setFailed(false);
      setShown({ rev, page: pg, src });
      setArrive((k) => k + 1);
    };
    img.onerror = () => live && setFailed(true);
    img.src = src;
    return () => {
      live = false;
    };
  }, [doc.id, rev, pg, count]);

  // Warm the cache for every revision of this page so scrubbing feels instant
  useEffect(() => {
    if (!count) return;
    for (let n = 1; n <= Math.min(count, 12); n++) new Image().src = pageUrl(n, pg);
  }, [doc.id, count, pg]);

  useEffect(() => {
    const el = stage.current;
    const d = data;
    if (!el || !shown || !d || !fit) return;
    const info = d.pages?.find((p) => p.page_no === shown.page) ?? d.pages?.[0];
    const c = d.revisions[shown.rev - 1]?.changes.find((x) => x.page === shown.page && validBox(x.bbox));
    if (!info || !c) return;
    const y = c.bbox![1] * (Math.max(200, fit) / info.width);
    if (y < el.scrollTop + 40 || y > el.scrollTop + el.clientHeight - 80) el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), behavior: reduce ? "auto" : "smooth" });
  }, [arrive, shown, data, fit, reduce]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ rev: number; page: number }>).detail;
      setPage(d.page);
      setArrive((k) => k + 1);
    };
    window.addEventListener(FOCUS_EVENT, on);
    return () => window.removeEventListener(FOCUS_EVENT, on);
  }, []);

  if (!source && q.isPending) return <Skeleton className={cn("h-[640px]", className)} rounded="lg" />;
  if ((!source && q.error) || !data) return <ErrorState error={q.error} title="Could not load the revisions" onRetry={() => void q.refetch()} className={className} />;
  if (!data.supported || !count) return <EmptyState title="No revisions to show" description="Only PDF files keep saved revisions." className={className} />;

  const info = data.pages?.find((p) => p.page_no === pg) ?? data.pages?.[0];
  const pageCount = data.page_count ?? 1;
  const width = Math.max(200, fit);
  const height = info ? Math.round((width * info.height) / info.width) : Math.round(width * 1.414);
  const scale = info ? width / info.width : 1;
  const all = data.revisions.flatMap((r) => r.changes.map((c) => ({ ...c, rev: r.n }))).filter((c) => c.page === pg);
  const at = shown?.rev ?? rev;
  const cur = data.revisions[rev - 1];
  const here = all.filter((c) => c.rev === at);
  const label = here[0];
  const roomRight = !!label && validBox(label.bbox) && width - label.bbox[2] * scale > 300;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setRev(Math.min(count, Math.max(1, rev + (e.key === "ArrowRight" ? 1 : -1))));
    }
  };

  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileClock aria-hidden className="size-4 shrink-0 text-brand-500" />
          <span className="text-sm font-semibold text-ink" aria-live="polite">
            Revision {rev} of {count}
          </span>
          <Tag variant={cur.after_last_signature ? "neutral" : "brand"} className={cn(cur.after_last_signature && "bg-mismatch-bg text-mismatch-fg")}>
            {cur.after_last_signature ? "After signing" : KIND_LABEL[cur.kind]}
          </Tag>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-1" role="group" aria-label="Pages">
            <IconButton size="sm" label="Previous page" icon={<ChevronLeft />} disabled={pg <= 1} onClick={() => setPage(pg - 1)} />
            <span className="min-w-[78px] text-center text-xs font-medium text-ink-2 tabular">
              Page {pg} of {pageCount}
            </span>
            <IconButton size="sm" label="Next page" icon={<ChevronRight />} disabled={pg >= pageCount} onClick={() => setPage(pg + 1)} />
          </div>
        )}
        <div className={cn("flex items-center gap-3 text-[11px] text-ink-3", !data.revisions.some((r) => r.changes.length) && "hidden")} aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] border-2 border-ov-focus bg-ov-focus/20" /> Changed in this revision
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] border-[1.5px] border-dashed border-ov-focus" /> Changes later
          </span>
        </div>
      </div>

      <div className="border-b border-line bg-surface-2/40 px-3 pt-2 pb-1">
        <Scrubber data={data} value={rev} onChange={setRev} />
      </div>

      <div
        ref={stage}
        tabIndex={0}
        onKeyDown={onKey}
        aria-label={`Page ${pg} as saved at revision ${rev}. Use the left and right arrow keys to step through revisions.`}
        className="relative min-h-0 flex-1 overflow-auto bg-surface-3/60 p-5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
      >
        {fit > 0 && (
          <div className="relative mx-auto bg-white shadow-md ring-1 ring-black/5" style={{ width, height }}>
            {!shown && !failed && <Skeleton className="absolute inset-0" rounded="sm" />}
            {failed && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-3">This revision could not be rendered.</div>}
            <AnimatePresence initial={false}>
              {shown && (
                <motion.img
                  key={shown.src}
                  src={shown.src}
                  alt={`Page ${shown.page} as saved at revision ${shown.rev} of ${doc.original_filename}`}
                  draggable={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: reduce ? 0 : dur.panel, ease: ease.inOut } }}
                  // The outgoing render stays opaque underneath until the incoming one has fully faded in
                  exit={{ opacity: 0, transition: { delay: reduce ? 0 : dur.panel, duration: 0 } }}
                  className="absolute inset-0 block size-full select-none"
                />
              )}
            </AnimatePresence>
            {shown && info && (
              <svg width={width} height={height} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
                {all.map((c, i) => (
                  <ChangeBox key={`${c.rev}-${i}`} c={c} scale={scale} mode={c.rev === at ? "here" : c.rev < at ? "earlier" : "later"} arrive={arrive} />
                ))}
              </svg>
            )}
            <AnimatePresence>
              {shown && info && label && validBox(label.bbox) && (
                <motion.span
                  key={`${at}-${arrive}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: dur.micro } }}
                  transition={{ delay: reduce ? 0 : 0.55, duration: dur.ui, ease: ease.out }}
                  className={cn(
                    "pointer-events-none absolute z-10 rounded-[6px] bg-ov-focus px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-sm",
                    roomRight ? "-translate-y-1/2" : "-translate-y-full",
                  )}
                  style={
                    roomRight
                      ? { left: label.bbox![2] * scale + 12, top: ((label.bbox![1] + label.bbox![3]) / 2) * scale }
                      : { left: label.bbox![0] * scale - 6, top: label.bbox![1] * scale - 8 }
                  }
                >
                  Revision {at} drew "{label.added_text}"{label.text_underneath ? ` over "${label.text_underneath}"` : ""}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Side panel ---------- */

function SignatureMarker({ s, count }: { s: RevisionSignature; count: number }) {
  const later = count - s.revision;
  return (
    <li className="rounded-[12px] border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
          <PenLine aria-hidden className="size-4 shrink-0 text-brand-500" />
          <span className="truncate">
            {signerShort(s)} signed: revision {s.revision}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Tag variant={s.role === "issuer" ? "brand" : "neutral"}>{ROLE_LABEL[s.role] ?? s.role}</Tag>
          <SimTag channel={s.role === "applicant" ? "applicant_signature" : "issuer_signature"} simulated={!!s.simulated} />
        </span>
      </div>
      <p className="mt-1.5 text-xs text-ink-2 text-pretty">
        Covers revisions 1 to {s.revision}.{" "}
        {later > 0 ? `${later === 1 ? "One later revision lies" : `${later} later revisions lie`} outside it, so whatever they changed is not vouched for by this signer.` : "Nothing was saved after it."}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        {s.detail ? (
          <Tooltip content={s.detail}>
            <span tabIndex={0}>
              <StatusCube status={sigTone(s.status)} label size={12} />
            </span>
          </Tooltip>
        ) : (
          <StatusCube status={sigTone(s.status)} label explain size={12} />
        )}
        {s.signing_time && <span>Signer-reported time {fmtDateTime(s.signing_time)}</span>}
      </div>
      {s.role === "applicant" && <p className="mt-1.5 text-xs text-ink-3">The institution's own DSC. It proves who uploaded the file, not who issued it.</p>}
    </li>
  );
}

function RevisionItem({ r, selected, onSelect, docId }: { r: Revision; selected: boolean; onSelect: () => void; docId: string }) {
  return (
    <motion.li variants={fadeUp} className="relative">
      {selected && <motion.span layoutId={`rev-item-${docId}`} transition={spring.snappy} aria-hidden className="absolute inset-0 rounded-[12px] bg-brand-soft ring-1 ring-brand-300/60" />}
      <div className="relative rounded-[12px] border border-line/70 p-3">
        <button type="button" onClick={onSelect} aria-pressed={selected} className="flex w-full items-start justify-between gap-2 text-left">
          <span className="min-w-0">
            <span className={cn("block text-sm font-semibold", selected ? "text-brand-ink" : "text-ink")}>
              Revision {r.n}: {r.after_last_signature && r.kind !== "original" ? `${KIND_LABEL[r.kind].toLowerCase()} after signing` : KIND_LABEL[r.kind].toLowerCase()}
            </span>
            <span className="block text-[11.5px] text-ink-3 tabular">
              Bytes {r.start.toLocaleString("en-IN")} to {r.end.toLocaleString("en-IN")} ({fmtBytes(r.bytes)}), {pluralize(r.objects_written, "object")} written
            </span>
          </span>
          {r.after_last_signature && (
            <Tooltip content="No signature in the file covers these bytes, so nothing vouches for who saved them.">
              <ShieldAlert aria-label="Not covered by any signature" className="size-4 shrink-0 text-mismatch-dot" tabIndex={0} />
            </Tooltip>
          )}
        </button>
        <div className="mt-2 space-y-2">
          {r.kind === "original" && <p className="text-xs text-ink-2">The file as first written. Later revisions can only append to these bytes.</p>}
          {r.signatures.map((s) => (
            <p key={s.field} className="flex items-start gap-1.5 text-xs text-ink-2">
              <PenLine aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
              <span>
                {signerShort(s)} ({ROLE_LABEL[s.role]?.toLowerCase() ?? s.role}) signed here. The signature covers revisions 1 to {s.revision}.
              </span>
            </p>
          ))}
          {r.changes.map((c, i) => (
            <div key={i} className="rounded-[10px] border border-line bg-surface p-2.5">
              <p className="text-xs text-ink-2">
                Page {c.page}: drew{" "}
                <mark className="rounded-[4px] bg-expired-bg px-1 font-mono text-[12px] text-expired-fg">{c.added_text || "content"}</mark>
                {c.text_underneath || c.removed_text ? (
                  <>
                    {" "}over{" "}
                    <span className="rounded-[4px] bg-surface-2 px-1 font-mono text-[12px] text-ink-2 line-through decoration-mismatch-dot decoration-2">{c.text_underneath || c.removed_text}</span>
                  </>
                ) : null}
              </p>
              {validBox(c.bbox) && (
                <button
                  type="button"
                  onClick={() => {
                    onSelect();
                    focusChange(r.n, c.page);
                  }}
                  className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100"
                >
                  <SquareDashed aria-hidden className="size-3.5" /> Show on the page
                </button>
              )}
            </div>
          ))}
          {r.kind === "update" && (
            <p className="text-xs text-ink-2">
              No visible text changed.{r.updates_metadata ? " Metadata was updated." : ""}
              {r.adds_annotations ? " Annotations were written." : ""}
            </p>
          )}
        </div>
      </div>
    </motion.li>
  );
}

export function RevisionPanel({ doc, source }: { doc: DocumentDetail; source?: RevisionSource }) {
  const q = useRevisions(doc.id, !source);
  const data = source?.data ?? q.data;
  const [rev, setRev] = useRevParam(data?.revision_count ?? 0);
  const summary = useMemo(() => (data?.supported ? summaryOf(data) : ""), [data]);
  if (!source && q.isPending) return <Skeleton className="h-64" rounded="lg" />;
  if ((!source && q.error) || !data) return <ErrorState compact error={q.error} title="Could not load the revisions" onRetry={() => void q.refetch()} />;
  if (!data.supported) return <EmptyState compact title="Not a PDF" description="Images have no saved revisions." />;
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-line bg-surface-2/50 p-3">
        <div className="eyebrow mb-1">Time machine</div>
        <p className="text-sm text-ink-2 text-pretty">{summary}</p>
        <p className="mt-1.5 text-xs text-ink-3">Drag the scrubber, or focus it and use the arrow keys. Each step shows the page exactly as that revision saved it.</p>
      </div>
      {(data.signatures ?? []).length > 0 && (
        <section>
          <PaneLabel>Signature markers</PaneLabel>
          <ul className="space-y-2">
            {data.signatures!.map((s, i) => (
              <SignatureMarker key={`${s.field}-${i}`} s={s} count={data.revision_count} />
            ))}
          </ul>
        </section>
      )}
      <section>
        <PaneLabel aside={<span className="text-xs text-ink-3 tabular">{data.revision_count}</span>}>What changed, revision by revision</PaneLabel>
        <LayoutGroup id={`rev-list-${doc.id}`}>
          <motion.ol variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2">
            {data.revisions.map((r) => (
              <RevisionItem key={r.n} r={r} docId={doc.id} selected={r.n === rev} onSelect={() => setRev(r.n)} />
            ))}
          </motion.ol>
        </LayoutGroup>
      </section>
      {(data.limitations ?? []).length > 0 && (
        <CautionNote title="What this does not show">{data.limitations!.join(" ")}</CautionNote>
      )}
    </div>
  );
}

const TIME_MACHINE_CODES = new Set(["FX-PDF-REVISION-TEXT-CHANGE", "FX-FIELD-OVERWRITTEN", "FX-PDF-INCREMENTAL-UPDATE", "VER-ISSUER_SIGNATURE-MISMATCH_DETECTED"]);

/** From a revision finding straight to the revision that introduced the change. */
export function TimeMachineLink({ finding }: { finding: Finding }) {
  const { app } = useWorkspace();
  if (!finding.document_id || !TIME_MACHINE_CODES.has(finding.code)) return null;
  const diff = finding.evidence.find((e) => e.kind === "revision_diff");
  const rev = diff && diff.kind === "revision_diff" ? diff.to_revision : Number(finding.message.match(/revision (\d+)/i)?.[1]) || null;
  return (
    <Link
      to={appPath(app.id, "documents", { doc: finding.document_id, panel: "revisions", rev })}
      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-brand-soft px-2.5 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100"
    >
      <FileClock aria-hidden className="size-3.5" /> Open the revision time machine{rev ? ` at revision ${rev}` : ""}
    </Link>
  );
}
