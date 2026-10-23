import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, cn, MetaList, SegmentedControl, SeverityIndicator } from "../../../ui2";
import { useWidth } from "../data";
import type { LifeStoryData, StoryAnomaly, StoryEvent, StoryLink, StoryRegion, StoryThumb, TrustLevel } from "./storyApi";

/* ---------- Time and words ---------- */

const IST_DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const IST_TIME = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);

export function fmtWhen(e: StoryEvent, withZone = true): { date: string; time: string | null } {
  const t = ms(e.time.at);
  if (Number.isNaN(t)) return { date: "Time not recorded", time: null };
  const d = new Date(t);
  if (e.time.precision === "day") return { date: IST_DATE.format(d), time: "date only" };
  return { date: IST_DATE.format(d), time: `${IST_TIME.format(d)}${withZone ? " IST" : ""}` };
}

/** A duration in words, rounded to its largest sensible unit (mirrors story.span on the server). */
export function spanWords(seconds: number): string {
  const s = Math.abs(seconds);
  if (s < 1.5) return "1 second";
  if (s < 90) return `${Math.round(s)} seconds`;
  if (s < 90 * 60) return `${Math.round(s / 60)} minutes`;
  if (s < 36 * 3600) {
    const h = Math.round(s / 3600);
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  const days = Math.round(s / 86400);
  if (days < 60) return days === 1 ? "1 day" : `${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months`;
  const y = Math.floor(months / 12);
  const mo = months % 12;
  return `${y} years${mo ? ` ${mo} months` : ""}`;
}

function gapWords(seconds: number): string {
  if (seconds < 1) return "same second";
  if (seconds < 90) return `+${Math.round(seconds)} s`;
  if (seconds < 90 * 60) return `+${Math.round(seconds / 60)} min`;
  if (seconds < 36 * 3600) return `+${Math.round(seconds / 3600)} h`;
  return spanWords(seconds);
}

const SOURCE_SHORT: Record<string, string> = {
  pramana: "Pramana record",
  tsa: "Timestamp token",
  signer: "Signer's clock",
  device: "Device clock",
  metadata: "File metadata",
  exif: "EXIF",
  printed: "Printed date",
  structure: "No time",
};

export const TRUST_LEGEND: { trust: TrustLevel; label: string }[] = [
  { trust: "trusted", label: "Trusted: recorded by Pramana or a timestamp token" },
  { trust: "self_asserted", label: "Self-asserted: the signer's or device's own clock" },
  { trust: "editable", label: "Editable: file metadata or EXIF" },
  { trust: "claim", label: "Claim: a date printed on the page" },
  { trust: "none", label: "No time recorded: placed in file order" },
];

/* ---------- Glyphs ---------- */

/** How far a time can be trusted, by how full its mark is: solid, half, hollow, dashed, a dash for none. */
export function TrustGlyph({ trust, className }: { trust: TrustLevel; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden className={cn("size-2.5 shrink-0", className)}>
      {trust === "trusted" && <circle cx="5" cy="5" r="4" fill="currentColor" />}
      {trust === "self_asserted" && (
        <>
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 1.4a3.6 3.6 0 0 0 0 7.2z" fill="currentColor" />
        </>
      )}
      {trust === "editable" && <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" />}
      {trust === "claim" && <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.7 1.3" />}
      {trust === "none" && <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

function rosette(points = 12, outer = 6.4, inner = 5.1, c = 8): string {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    d += `${i ? "L" : "M"}${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}
const ROSETTE = rosette();

/** One small drawing per kind of event, in the stroke style of the app's icons. */
function KindGlyph({ kind }: { kind: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let body: ReactNode;
  switch (kind) {
    case "created":
      body = (
        <>
          <path d="M4.5 1.8h5l3 3v9.4h-8z" {...p} />
          <path d="M9.5 1.8v3h3" {...p} />
        </>
      );
      break;
    case "issued":
      body = (
        <>
          <rect x="2.6" y="3" width="10.8" height="10.4" rx="1.2" {...p} strokeDasharray="2 1.4" />
          <path d="M5 6.6h6M5 9.4h4" {...p} />
        </>
      );
      break;
    case "signed":
    case "credentials":
      body = (
        <>
          <path d={ROSETTE} {...p} strokeWidth={1.2} />
          <path d="M5.8 8.2l1.5 1.5 3-3.1" {...p} />
        </>
      );
      break;
    case "edited":
      body = (
        <>
          <path d="M3 13l.9-3.2 6.8-6.8 2.3 2.3-6.8 6.8z" {...p} />
          <path d="M9.4 4.3l2.3 2.3" {...p} />
        </>
      );
      break;
    case "annotated":
      body = <path d="M2.6 3.4h10.8v7H7.6l-3 2.6v-2.6h-2z" {...p} />;
      break;
    case "captured":
      body = (
        <>
          <circle cx="8" cy="8" r="5.6" {...p} />
          <path d="M8 2.4L10.6 7M13.3 6.4L8.8 10.9M10.9 13L6 11.5M3.1 10.6L5.5 6M4.6 3.6L9.7 4.8" {...p} strokeWidth={1.1} />
        </>
      );
      break;
    case "modified":
      body = (
        <>
          <path d="M8 2.2l6 10.6H2z" {...p} />
          <path d="M8 6.6v3M8 11.3v.01" {...p} />
        </>
      );
      break;
    case "uploaded":
      body = <path d="M8 10.6V3M5 5.8L8 2.8l3 3M3 13.2h10" {...p} />;
      break;
    case "read":
      body = <path d="M3 4.2h10M3 8h10M3 11.8h6" {...p} />;
      break;
    case "checked":
      body = (
        <>
          <circle cx="8" cy="8" r="5.6" {...p} />
          <path d="M5.5 8.2l1.7 1.7 3.4-3.6" {...p} />
        </>
      );
      break;
    case "analysed":
      body = (
        <>
          <circle cx="7" cy="7" r="4.2" {...p} />
          <path d="M10.2 10.2l3.2 3.2" {...p} />
        </>
      );
      break;
    case "c2pa_action":
      body = <path d="M8 2.6l5.4 5.4L8 13.4 2.6 8z" {...p} />;
      break;
    default:
      body = <rect x="4" y="4" width="8" height="8" rx="1.5" {...p} />;
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4">
      {body}
    </svg>
  );
}

/* ---------- Layout ---------- */

const GUTTER = 112;
const STEP = 128;
const PAD_R = 80;
const MAX_PER_DECADE = 80;
const ROW_H = 24;
const THUMB_W = 46;
const THUMB_H = 64;
const BREAK_S = 86400;

type Tone = "issuer" | "applicant" | "high" | "medium" | "low" | "info";

interface Span {
  key: string;
  x1: number;
  x2: number;
  label: string;
  tone: Tone;
  row: number;
  to: string | null;
}

const TONE_TEXT: Record<Tone, string> = {
  issuer: "fill-verified-fg",
  applicant: "fill-ink-3",
  high: "fill-mismatch-fg",
  medium: "fill-manual-fg",
  low: "fill-ink-3",
  info: "fill-ink-3",
};
const TONE_STROKE: Record<Tone, string> = {
  issuer: "stroke-verified-dot",
  applicant: "stroke-ink-4",
  high: "stroke-mismatch-dot",
  medium: "stroke-manual-dot",
  low: "stroke-ink-4",
  info: "stroke-ink-4",
};

const textW = (s: string) => s.length * 6.5 + 8;

function anomalyLabel(a: StoryAnomaly): string {
  return a.interval_s != null && a.interval_s >= 0 && a.code === "STORY-AFTER-SIGNING" ? `${a.title}, ${spanWords(a.interval_s)} later` : a.title;
}

function useLayout(story: LifeStoryData, width: number) {
  return useMemo(() => {
    const ev = story.events;
    const n = ev.length;
    const times = ev.map((e) => ms(e.sort_at));
    const gaps = times.map((t, i) => (i === 0 ? 0 : Math.max(0, (t - times[i - 1]) / 1000)));
    // A break already says "long gap", so a gap past a day takes no more room than a day
    const extra = gaps.map((g) => Math.log10(1 + Math.min(g, BREAK_S)));
    const avail = Math.max(0, width - GUTTER - PAD_R - 40);
    const sumExtra = extra.reduce((a, b) => a + b, 0);
    // Few events get wider steps, so a short story still reads across the strip
    const step = Math.max(STEP, Math.min(190, (avail * 0.4) / Math.max(1, n - 1)));
    const k = sumExtra > 0 ? Math.min(MAX_PER_DECADE, Math.max(0, (avail - (n - 1) * step) / sumExtra)) : 0;
    const xs: number[] = [];
    ev.forEach((_, i) => xs.push(i === 0 ? GUTTER + 48 : xs[i - 1] + step + k * extra[i]));
    const contentW = Math.max(width, (xs[n - 1] ?? GUTTER) + PAD_R);
    const xOf = new Map(ev.map((e, i) => [e.id, xs[i]]));

    // Spans above the strip: what each signature covers, then every anomaly that joins two events
    const raw: Omit<Span, "row">[] = [];
    for (const c of story.coverage) {
      const a = xOf.get(c.from_event);
      const b = xOf.get(c.event);
      if (a == null || b == null) continue;
      const who = c.role === "issuer" ? "Issuer signature" : c.role === "applicant" ? "Applicant signature" : "Signature";
      raw.push({
        key: `cov-${c.event}`,
        x1: Math.min(a, b),
        x2: Math.max(a, b),
        label: `${who} covers ${c.through_revision === 1 ? (c.revision_count === 1 ? "the whole file" : "revision 1") : `revisions 1 to ${c.through_revision}`}`,
        tone: c.role === "issuer" ? "issuer" : "applicant",
        to: c.event,
      });
    }
    story.anomalies.forEach((an, i) => {
      const a = an.from ? xOf.get(an.from) : undefined;
      const b = an.to ? xOf.get(an.to) : undefined;
      if (a == null && b == null) return;
      const x1 = Math.min(a ?? b!, b ?? a!);
      const x2 = Math.max(a ?? b!, b ?? a!);
      raw.push({ key: `an-${i}`, x1, x2, label: anomalyLabel(an), tone: an.severity as Tone, to: an.to });
    });
    const rows: number[] = [];
    const spans: Span[] = raw.map((s) => {
      const start = s.x1 - 6;
      const end = Math.max(s.x2, s.x1 + textW(s.label)) + 12;
      let row = rows.findIndex((r) => r <= start);
      if (row < 0) {
        rows.push(0);
        row = rows.length - 1;
      }
      rows[row] = end;
      return { ...s, row };
    });

    const top = rows.length * ROW_H + (rows.length ? 10 : 0);
    // A thumbnail only where the page changed: a revision already shown is not repeated
    const shown = new Set<string>();
    const thumbOf = new Map<string, StoryThumb>();
    for (const e of ev) {
      if (e.origin !== "file" || !e.thumb) continue;
      const key = e.thumb.photo ? "photo" : `${e.thumb.rev ?? 1}`;
      if (shown.has(key)) continue;
      shown.add(key);
      thumbOf.set(e.id, e.thumb);
    }
    const thumbs = thumbOf.size > 0;
    const yFile = top + (thumbs ? THUMB_H + 30 : 18);
    const yAxis = yFile + 92;
    const yPram = yFile + 132;
    const height = yPram + 72;

    // Not covered by any signature: from the last signature to the last file event after it
    const sigs = ev.filter((e) => e.kind === "signed");
    const lastSig = sigs[sigs.length - 1];
    const after = ev.filter((e) => e.origin === "file" && e.after_signature);
    const uncovered = lastSig && after.length ? { x1: xOf.get(lastSig.id)!, x2: Math.max(...after.map((e) => xOf.get(e.id)!)) } : null;

    const lineFrom = (xs[0] ?? GUTTER) - 28;
    const lineTo = (xs[n - 1] ?? GUTTER) + 28;
    return { xs, gaps, xOf, spans, rows: rows.length, top, yFile, yAxis, yPram, height, contentW, uncovered, lineFrom, lineTo, thumbs, thumbOf };
  }, [story, width]);
}

/* ---------- Pieces ---------- */

function Thumb({
  e,
  x,
  y,
  url,
  pageSize,
  selected,
  onClick,
}: {
  e: StoryEvent;
  x: number;
  y: number;
  url: string;
  pageSize: (page: number) => { width: number; height: number } | null;
  selected: boolean;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const box = e.thumb?.box;
  const size = box ? pageSize(box.page) : null;
  const pct = box && size ? { left: (box.bbox[0] / size.width) * 100, top: (box.bbox[1] / size.height) * 100, w: ((box.bbox[2] - box.bbox[0]) / size.width) * 100, h: ((box.bbox[3] - box.bbox[1]) / size.height) * 100 } : null;
  return (
    <div
      aria-hidden
      onClick={onClick}
      className={cn(
        "absolute cursor-pointer overflow-hidden rounded-[4px] border bg-white transition-shadow duration-150",
        selected ? "border-ink-3 shadow-xs" : "border-line-2",
        e.tone === "warning" && "border-mismatch-dot",
      )}
      style={{ left: x - THUMB_W / 2, top: y, width: THUMB_W, height: THUMB_H }}
    >
      {!failed && <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover object-top" />}
      {pct && (
        <span
          className="absolute rounded-[1px] border-[1.5px] border-mismatch-dot bg-mismatch-dot/15"
          style={{ left: `${pct.left - 2}%`, top: `${pct.top - 1.5}%`, width: `${pct.w + 4}%`, height: `${Math.max(pct.h + 3, 5)}%` }}
        />
      )}
      {e.thumb?.rev && !e.thumb.photo && (
        <span className="absolute right-0 bottom-0 rounded-tl-[3px] bg-surface/90 px-1 text-xs leading-4 text-ink-2 tabular-nums">r{e.thumb.rev}</span>
      )}
    </div>
  );
}

function markerTone(e: StoryEvent): string {
  if (e.tone === "warning") return "border-mismatch-dot bg-mismatch-bg text-mismatch-fg";
  if (e.tone === "attention") return "border-manual-dot bg-manual-bg text-manual-fg";
  if (e.origin === "pramana") return "border-ink bg-ink text-surface";
  if (e.kind === "signed" && e.role === "issuer") return "border-verified-dot bg-verified-bg text-verified-fg";
  return "border-line-2 bg-surface text-ink-2";
}

function EventLabel({ e, x, y, selected }: { e: StoryEvent; x: number; y: number; selected: boolean }) {
  const w = fmtWhen(e, false);
  return (
    <div aria-hidden className="pointer-events-none absolute text-center" style={{ left: x - (STEP - 12) / 2, top: y, width: STEP - 12 }}>
      <div className={cn("truncate text-xs font-medium", selected ? "text-ink" : "text-ink-2", e.tone === "warning" && "text-mismatch-fg")}>{e.title}</div>
      <div className="truncate text-xs text-ink-2 tabular-nums">{w.date}</div>
      <div className="flex items-center justify-center gap-1 text-xs text-ink-3 tabular-nums">
        {w.time && w.time !== "date only" && <span>{w.time}</span>}
        <TrustGlyph trust={e.time.trust} />
        <span className="truncate">{w.time && w.time !== "date only" ? "" : SOURCE_SHORT[e.time.source] ?? e.time.source}</span>
      </div>
    </div>
  );
}

/* ---------- The strip ---------- */

export interface LifeStoryProps {
  story: LifeStoryData;
  /** Image for a thumbnail: a page at a revision, or the photo */
  thumbUrl: (t: StoryThumb) => string | null;
  pageSize: (page: number) => { width: number; height: number } | null;
  /** Opens the evidence behind an event; the host decides where each kind of link goes */
  onOpen: (link: StoryLink, e: StoryEvent) => void;
  /** Button text for a link, or null when this host cannot open it */
  linkLabel: (link: StoryLink, e: StoryEvent) => string | null;
}

export function LifeStoryView(props: LifeStoryProps) {
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const { story } = props;
  return (
    <div className="min-w-0">
      <StoryHeadline story={story} view={view} setView={setView} />
      {view === "timeline" ? <Timeline {...props} /> : <StoryTable {...props} />}
    </div>
  );
}

function StoryHeadline({ story, view, setView }: { story: LifeStoryData; view: string; setView: (v: "timeline" | "list") => void }) {
  const worst = story.anomalies.find((a) => a.severity !== "info");
  const spanS = story.first_at && story.last_at ? (ms(story.last_at) - ms(story.first_at)) / 1000 : null;
  const after = story.events.filter((e) => e.origin === "file" && e.after_signature).length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {worst ? <SeverityIndicator severity={worst.severity} /> : <span className="size-2 rounded-full bg-verified-dot" aria-hidden />}
        <span className={cn("text-sm font-medium", worst ? "text-ink" : "text-ink-2")}>{story.headline}</span>
        <MetaList
          className="text-xs text-ink-3"
          items={[
            `${story.events.length} events`,
            spanS != null && spanS > 0 ? `spans ${spanWords(spanS)}` : null,
            story.revision_count ? `${story.revision_count} ${story.revision_count === 1 ? "revision" : "revisions"}` : null,
            after ? `${after} after the last signature` : null,
          ]}
        />
      </div>
      <SegmentedControl
        size="sm"
        label="Show the life story as"
        value={view}
        onChange={(v) => setView(v as "timeline" | "list")}
        options={[
          { value: "timeline", label: "Timeline" },
          { value: "list", label: "List" },
        ]}
      />
    </div>
  );
}

function defaultSelection(story: LifeStoryData): string | null {
  const worst = story.anomalies.find((a) => a.severity !== "info");
  return worst?.to ?? story.events.find((e) => e.origin === "file")?.id ?? story.events[0]?.id ?? null;
}

function Timeline(props: LifeStoryProps) {
  const { story, thumbUrl, pageSize } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const width = useWidth(scroller);
  const L = useLayout(story, width || 1000);
  const [sel, setSel] = useState<string | null>(() => defaultSelection(story));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const hatch = useId().replace(/:/g, "");
  const ev = story.events;
  const selected = ev.find((e) => e.id === sel) ?? null;

  useEffect(() => setSel(defaultSelection(story)), [story]);

  const move = (to: number) => {
    const e = ev[Math.max(0, Math.min(ev.length - 1, to))];
    if (!e) return;
    setSel(e.id);
    const b = buttons.current.get(e.id);
    b?.focus();
    b?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const onKey = (k: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (k.key in step) {
      k.preventDefault();
      move(i + step[k.key]);
    } else if (k.key === "Home" || k.key === "End") {
      k.preventDefault();
      move(k.key === "Home" ? 0 : ev.length - 1);
    }
  };

  const first = ev.find((e) => e.time.at);
  const last = [...ev].reverse().find((e) => e.time.at);
  const summary = `Timeline of ${ev.length} events${first && last ? `, from ${fmtWhen(first).date} to ${fmtWhen(last).date}` : ""}. ${story.headline}. Use the arrow keys to move between events.`;

  return (
    <div>
      <div ref={scroller} className="overflow-x-auto overflow-y-hidden border-y border-line bg-surface-2/40">
        <div role="group" aria-roledescription="timeline" aria-label={summary} className="relative" style={{ width: L.contentW, height: L.height }}>
          <svg aria-hidden className="absolute inset-0" width={L.contentW} height={L.height}>
            <defs>
              <pattern id={`h${hatch}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" className="fill-mismatch-bg" />
                <line x1="0" y1="0" x2="0" y2="6" className="stroke-mismatch-dot" strokeWidth="1.6" strokeOpacity="0.55" />
              </pattern>
            </defs>

            {/* Lanes */}
            <text x={20} y={L.yFile - 6} className="fill-ink-2 text-xs font-medium">
              In the file
            </text>
            <text x={20} y={L.yFile + 10} className="fill-ink-3 text-xs">
              what it claims
            </text>
            <text x={20} y={L.yPram - 6} className="fill-ink-2 text-xs font-medium">
              Pramana
            </text>
            <text x={20} y={L.yPram + 10} className="fill-ink-3 text-xs">
              its own records
            </text>
            {[L.yFile, L.yPram].map((y) => (
              <line key={y} x1={L.lineFrom} x2={L.lineTo} y1={y} y2={y} className="stroke-line-2" strokeWidth="1.5" />
            ))}

            {/* What the signatures cover, and what lies outside them */}
            {story.coverage.map((c) => {
              const a = L.xOf.get(c.from_event);
              const b = L.xOf.get(c.event);
              if (a == null || b == null) return null;
              return (
                <rect
                  key={c.event}
                  x={Math.min(a, b) - 16}
                  y={L.yFile - 7}
                  width={Math.abs(b - a) + 32}
                  height={14}
                  rx={7}
                  className={c.role === "issuer" ? "fill-verified-bg stroke-verified-dot" : "fill-surface-3 stroke-line-2"}
                  strokeOpacity={0.5}
                />
              );
            })}
            {L.uncovered && (
              <rect x={L.uncovered.x1 + 16} y={L.yFile - 7} width={Math.max(0, L.uncovered.x2 - L.uncovered.x1)} height={14} rx={7} fill={`url(#h${hatch})`} />
            )}

            {/* The shared time axis: a tick per event, the real interval between neighbours, a break past a day */}
            <line x1={L.lineFrom} x2={L.lineTo} y1={L.yAxis} y2={L.yAxis} className="stroke-line" strokeWidth="1" />
            <text x={20} y={L.yAxis + 4} className="fill-ink-3 text-xs">
              Interval
            </text>
            {L.xs.map((x, i) => (
              <line key={`tick-${i}`} x1={x} x2={x} y1={L.yAxis - 3} y2={L.yAxis + 3} className="stroke-ink-4" strokeWidth="1" />
            ))}
            {ev.map((e, i) => {
              if (i === 0) return null;
              const g = L.gaps[i];
              const known = !!e.time.at && !!ev[i - 1].time.at;
              const xm = (L.xs[i - 1] + L.xs[i]) / 2;
              const brk = g > BREAK_S;
              const label = known ? gapWords(g) : null;
              return (
                <g key={`gap-${e.id}`}>
                  {brk &&
                    [L.yFile, L.yAxis, L.yPram].map((y) => (
                      <g key={y}>
                        <rect x={xm - 5} y={y - 4} width={10} height={8} className="fill-surface" />
                        <path d={`M${xm - 7} ${y + 6}l5 -12M${xm + 2} ${y + 6}l5 -12`} className="stroke-ink-4" strokeWidth="1.3" />
                      </g>
                    ))}
                  {label && (L.xs[i] - L.xs[i - 1] > 84 || brk) && (
                    <g>
                      {brk && <rect x={xm - textW(label) / 2} y={L.yAxis - 10} width={textW(label)} height={20} rx={10} className="fill-surface stroke-line-2" />}
                      <text x={xm} y={brk ? L.yAxis + 4 : L.yAxis - 7} textAnchor="middle" className={cn("text-xs tabular-nums", brk ? "fill-ink-2" : "fill-ink-3")}>
                        {label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Spans: coverage brackets and anomalies */}
            {L.spans.map((s) => {
              const y = s.row * ROW_H + 18;
              const dashed = s.tone === "info" || s.tone === "low";
              return (
                <g key={s.key}>
                  <text x={s.x1 - 4} y={y - 5} className={cn("text-xs font-medium", TONE_TEXT[s.tone])}>
                    {s.label}
                  </text>
                  <path
                    d={s.x2 - s.x1 < 2 ? `M${s.x1} ${y}v${L.yFile - y - 16}` : `M${s.x1} ${y + 5}V${y}H${s.x2}V${y + 5}`}
                    fill="none"
                    className={TONE_STROKE[s.tone]}
                    strokeWidth="1.5"
                    strokeDasharray={dashed ? "3 3" : s.x2 - s.x1 < 2 ? "2 3" : undefined}
                  />
                </g>
              );
            })}

            {/* Connectors from thumbnails to their markers */}
            {ev.map((e, i) =>
              L.thumbOf.has(e.id) ? (
                <line key={`c-${e.id}`} x1={L.xs[i]} x2={L.xs[i]} y1={L.top + THUMB_H + 4} y2={L.yFile - 15} className="stroke-line-2" strokeWidth="1" />
              ) : null,
            )}
          </svg>

          {ev.map((e, i) => {
            const t = L.thumbOf.get(e.id);
            const url = t ? thumbUrl(t) : null;
            return url ? (
              <Thumb key={`t-${e.id}`} e={e} x={L.xs[i]} y={L.top + 4} url={url} pageSize={pageSize} selected={e.id === sel} onClick={() => setSel(e.id)} />
            ) : null;
          })}

          {ev.map((e, i) => {
            const y = e.origin === "file" ? L.yFile : L.yPram;
            const on = e.id === sel;
            const when = fmtWhen(e);
            return (
              <div key={e.id}>
                <button
                  ref={(el) => {
                    if (el) buttons.current.set(e.id, el);
                    else buttons.current.delete(e.id);
                  }}
                  type="button"
                  tabIndex={on || (!sel && i === 0) ? 0 : -1}
                  aria-pressed={on}
                  aria-label={`Event ${i + 1} of ${ev.length}: ${e.title}. ${when.date}${when.time ? `, ${when.time}` : ""}. ${e.time.label}.`}
                  onClick={() => setSel(e.id)}
                  onKeyDown={(k) => onKey(k, i)}
                  className={cn(
                    "absolute flex size-7 items-center justify-center rounded-full border-[1.5px] transition-shadow duration-150",
                    markerTone(e),
                    on && "ring-2 ring-ink-3 ring-offset-2 ring-offset-surface",
                  )}
                  style={{ left: L.xs[i] - 14, top: y - 14 }}
                >
                  <KindGlyph kind={e.kind} />
                </button>
                <EventLabel e={e} x={L.xs[i]} y={y + 20} selected={on} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-5 pt-2 text-xs text-ink-3 text-pretty">
        Spacing grows with the logarithm of the time between events, and a break marks a gap of more than a day, so years and seconds fit one strip. The label between two
        events gives the real interval.
      </p>
      <div className="grid gap-x-8 gap-y-4 px-5 pt-4 pb-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {selected ? <EventDetail e={selected} {...props} /> : <p className="text-sm text-ink-3">Choose an event to see its evidence.</p>}
        <StandsOut story={story} onSelect={(id) => id && setSel(id)} />
      </div>
      <Legend />
    </div>
  );
}

/* ---------- Detail, anomalies, legend ---------- */

function EventDetail({ e, onOpen, linkLabel }: { e: StoryEvent } & LifeStoryProps) {
  const w = fmtWhen(e);
  const main = e.link ? linkLabel(e.link, e) : null;
  const region: StoryRegion | null = e.region && e.link?.to !== "region" ? e.region : null;
  const regionLabel = region ? linkLabel({ to: "region", page: region.page, bbox: region.bbox }, e) : null;
  return (
    <section aria-live="polite" className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-ink">{e.title}</h3>
        <span className="text-xs text-ink-3">{e.origin === "file" ? "Evidence inside the file" : "Pramana's own record"}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-3">When</dt>
        <dd className="text-ink tabular-nums">
          {w.date}
          {w.time && w.time !== "date only" ? `, ${w.time}` : w.time ? " (date only)" : ""}
        </dd>
        <dt className="text-ink-3">Time source</dt>
        <dd className="flex items-center gap-1.5 text-ink-2">
          <TrustGlyph trust={e.time.trust} className="text-ink-2" />
          {e.time.label}
        </dd>
        {e.time.raw && (
          <>
            <dt className="text-ink-3">As written</dt>
            <dd className="font-mono text-xs leading-5 break-all text-ink-2">{e.time.raw}</dd>
          </>
        )}
        {e.actor && (
          <>
            <dt className="text-ink-3">{e.kind === "signed" || e.kind === "credentials" ? "Signer" : e.origin === "pramana" ? "By" : "Device"}</dt>
            <dd className="text-ink-2">
              {e.actor}
              {e.role && e.role !== "unknown" && <span className="text-ink-3"> ({e.role === "issuer" ? "issuer" : "applicant"})</span>}
              {e.simulated && <span className="ml-1 text-xs font-medium tracking-wide text-ink-3">SIMULATED trust list</span>}
            </dd>
          </>
        )}
        {e.tool && (
          <>
            <dt className="text-ink-3">Tool recorded</dt>
            <dd className="text-ink-2">{e.tool}</dd>
          </>
        )}
      </dl>
      <p className="mt-2 text-sm text-ink-2 text-pretty">{e.detail}</p>
      {(main || regionLabel) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {main && e.link && (
            <Button size="sm" onClick={() => onOpen(e.link!, e)}>
              {main}
            </Button>
          )}
          {regionLabel && region && (
            <Button size="sm" variant="ghost" onClick={() => onOpen({ to: "region", page: region.page, bbox: region.bbox }, e)}>
              {regionLabel}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

const BASIS: Record<string, string> = {
  structure: "From the file's structure",
  metadata: "From times and tools the file records (editable)",
  printed: "From the printed date",
};

function StandsOut({ story, onSelect }: { story: LifeStoryData; onSelect: (id: string | null) => void }) {
  return (
    <section className="min-w-0">
      <h3 className="text-sm font-semibold text-ink">What stands out</h3>
      {story.anomalies.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3 text-pretty">Nothing. No change after a signature, no editor or converter, and no date that disagrees with another.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {story.anomalies.map((a, i) => (
            <li key={`${a.code}-${i}`} className="py-2 first:pt-0">
              <button type="button" onClick={() => onSelect(a.to)} className="group w-full rounded text-left">
                <span className="flex items-center gap-2">
                  <SeverityIndicator severity={a.severity} className="shrink-0" />
                  <span className="text-sm font-medium text-ink group-hover:underline">{anomalyLabel(a)}</span>
                </span>
                <span className="mt-0.5 block text-sm text-ink-2 text-pretty">{a.detail}</span>
                <span className="mt-0.5 block text-xs text-ink-3">{BASIS[a.basis] ?? a.basis}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-5 py-3 text-xs text-ink-3">
      {TRUST_LEGEND.map((t) => (
        <span key={t.trust} className="inline-flex items-center gap-1.5">
          <TrustGlyph trust={t.trust} className="text-ink-2" />
          {t.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- The text alternative ---------- */

function StoryTable({ story, onOpen, linkLabel }: LifeStoryProps) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full text-sm">
        <caption className="sr-only">Life story events in time order, with the source of each time</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th scope="col" className="h-9 px-5 font-medium">
              Event
            </th>
            <th scope="col" className="px-3 font-medium">
              When (IST)
            </th>
            <th scope="col" className="px-3 font-medium">
              Time source
            </th>
            <th scope="col" className="px-3 font-medium">
              What the evidence says
            </th>
            <th scope="col" className="px-5 font-medium">
              <span className="sr-only">Evidence</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {story.events.map((e) => {
            const w = fmtWhen(e);
            const label = e.link ? linkLabel(e.link, e) : null;
            return (
              <tr key={e.id} className="align-top">
                <td className="px-5 py-2.5">
                  <div className={cn("font-medium", e.tone === "warning" ? "text-mismatch-fg" : "text-ink")}>{e.title}</div>
                  <div className="text-xs text-ink-3">{e.origin === "file" ? "In the file" : "Pramana record"}</div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-ink-2 tabular-nums">
                  {w.date}
                  {w.time && <div className="text-xs text-ink-3">{w.time}</div>}
                </td>
                <td className="px-3 py-2.5 text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <TrustGlyph trust={e.time.trust} />
                    {e.time.label}
                  </span>
                </td>
                <td className="max-w-xl px-3 py-2.5 text-ink-2 text-pretty">{e.detail}</td>
                <td className="px-5 py-2.5 text-right">
                  {label && e.link && (
                    <Button size="sm" variant="ghost" onClick={() => onOpen(e.link!, e)}>
                      {label}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
