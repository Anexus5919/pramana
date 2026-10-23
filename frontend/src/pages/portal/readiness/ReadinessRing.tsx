import { cn } from "../../../ui2";
import type { ReadinessGroup, ReadinessStatus } from "./types";

/** Geometry in SVG units; the ring scales with its container. */
const C = 100;
const R = 78;
const W = 11;
const CIRC = 2 * Math.PI * R;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

interface Segment {
  id: string;
  group: string;
  status: ReadinessStatus;
  advice: boolean;
  requested: boolean;
  title: string;
  start: number;
  len: number;
}

/**
 * Lay the requirements around the circle, one segment each, grouped with a wider gap between groups.
 * `closed` removes every gap, so a fully met checklist reads as one unbroken ring.
 */
function layout(groups: ReadinessGroup[], closed: boolean): Segment[] {
  const used = groups.filter((g) => g.items.length > 0);
  const n = used.reduce((s, g) => s + g.items.length, 0);
  if (n === 0) return [];
  const k = used.length;
  const gapItem = closed ? 0 : n > 24 ? 1.6 : 2.6;
  const gapGroup = closed || k < 2 ? (closed ? 0 : gapItem) : 9;
  const len = (360 - k * gapGroup - (n - k) * gapItem) / n;
  const out: Segment[] = [];
  let a = gapGroup / 2;
  for (const g of used) {
    g.items.forEach((it, j) => {
      out.push({
        id: it.id,
        group: g.id,
        status: it.status,
        advice: !!it.advice,
        requested: it.requested,
        title: it.title,
        start: a,
        len,
      });
      a += len + (j < g.items.length - 1 ? gapItem : 0);
    });
    a += gapGroup;
  }
  return out;
}

const STROKE: Record<ReadinessStatus, string> = {
  met: "var(--verified-dot)",
  fix: "var(--expired-dot)",
  waiting: "var(--line-2)",
};

const STATUS_WORD: Record<ReadinessStatus, string> = { met: "met", fix: "to fix", waiting: "checked after upload" };

function polar(deg: number, r: number): [number, number] {
  const t = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(t), C + r * Math.sin(t)];
}

export interface ReadinessRingProps {
  groups: ReadinessGroup[];
  /** The requirement highlighted from the list, if any */
  active: string | null;
  activeGroup: string | null;
  onActive: (id: string | null) => void;
  checking: boolean;
  label: string;
  className?: string;
}

/**
 * The checklist as a ring: one segment per requirement, filled in as each is met. Orange segments are still to
 * fix, thin grey ones wait for a document; an amber dot marks a met requirement with a note, and a tick marks
 * what AICTE asked about in a rectification round. When every segment is met the gaps close into one ring.
 */
export function ReadinessRing({ groups, active, activeGroup, onActive, checking, label, className }: ReadinessRingProps) {
  const all = groups.flatMap((g) => g.items);
  const fix = all.filter((i) => i.status === "fix").length;
  const ready = all.length > 0 && all.every((i) => i.status === "met");
  const segs = layout(groups, ready);
  const dim = (s: Segment) => (active ? s.id !== active : activeGroup ? s.group !== activeGroup : false);

  return (
    <div className={cn("relative aspect-square w-full", className)}>
      <svg viewBox="0 0 200 200" role="img" aria-label={label} className="block size-full overflow-visible">
        <style>{`
          @keyframes readiness-draw { from { stroke-dashoffset: 42; } to { stroke-dashoffset: 0; } }
          @keyframes readiness-seal { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
        {/* Inner hairline: the structure the segments sit on */}
        <circle cx={C} cy={C} r={R - W / 2 - 7} fill="none" stroke="var(--line)" strokeWidth={1} />
        {ready && (
          // Covers the hairline seams between closed segments
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={STROKE.met}
            strokeWidth={W}
            style={{ animation: `readiness-seal 200ms ${EASE} 420ms both` }}
          />
        )}
        <g transform={`rotate(-90 ${C} ${C})`}>
          {segs.map((s) => {
            const on = active === s.id;
            const thin = s.status === "waiting";
            return (
              <circle
                key={s.id}
                cx={C}
                cy={C}
                r={R}
                fill="none"
                stroke={STROKE[s.status]}
                strokeWidth={thin ? 4 : on ? W + 4 : W}
                strokeDasharray={`${(s.len / 360) * CIRC} ${CIRC}`}
                strokeDashoffset={-(s.start / 360) * CIRC}
                opacity={dim(s) ? 0.3 : 1}
                pointerEvents="stroke"
                onMouseEnter={() => onActive(s.id)}
                onMouseLeave={() => onActive(null)}
                style={{
                  transition: `stroke-dasharray 420ms ${EASE}, stroke-dashoffset 420ms ${EASE}, stroke 200ms ${EASE}, stroke-width 150ms ${EASE}, opacity 150ms ${EASE}`,
                }}
              >
                <title>{`${s.title}: ${STATUS_WORD[s.status]}`}</title>
              </circle>
            );
          })}
        </g>
        {segs.map((s) => {
          const mid = s.start + s.len / 2;
          const marks = [];
          if (s.requested) {
            const [x1, y1] = polar(mid, R + W / 2 + 3);
            const [x2, y2] = polar(mid, R + W / 2 + 10);
            marks.push(<line key="r" x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-2)" strokeWidth={1.75} strokeLinecap="round" />);
          }
          if (s.advice) {
            const [x, y] = polar(mid, R + W / 2 + (s.requested ? 14 : 6));
            marks.push(<circle key="a" cx={x} cy={y} r={2.6} fill="var(--manual-dot)" />);
          }
          return marks.length ? (
            <g key={`m-${s.id}`} opacity={dim(s) ? 0.3 : 1} aria-hidden>
              {marks}
            </g>
          ) : null;
        })}
        {checking && (
          <g className="animate-spin" style={{ transformOrigin: `${C}px ${C}px`, animationDuration: "1.4s" }} aria-hidden>
            <circle
              cx={C}
              cy={C}
              r={R - W / 2 - 7}
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={`${0.16 * 2 * Math.PI * (R - W / 2 - 7)} 999`}
            />
          </g>
        )}
        {ready && (
          <path
            d="M 84 99 L 95 110 L 117 87"
            fill="none"
            stroke="var(--verified-fg)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={42}
            transform="translate(0 -9)"
            style={{ animation: `readiness-draw 360ms ${EASE} 480ms both` }}
          />
        )}
      </svg>
      <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {ready ? (
          <span className="mt-12 text-sm font-medium text-verified-fg">All met</span>
        ) : all.length === 0 ? (
          <span className="text-sm text-ink-3">Checking</span>
        ) : (
          <>
            <span className="text-2xl leading-none font-semibold text-ink">{fix}</span>
            <span className="mt-1 text-sm text-ink-3">to fix</span>
          </>
        )}
      </div>
    </div>
  );
}

/** A short arc in a requirement's colour, the same mark the ring uses, for list rows and the key. */
export function StatusArc({ status, className }: { status: ReadinessStatus; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M 3 11.5 A 6.5 6.5 0 0 1 13 11.5"
        fill="none"
        stroke={STROKE[status]}
        strokeWidth={status === "waiting" ? 1.75 : 3}
        strokeLinecap="butt"
      />
    </svg>
  );
}
