import { Award, BookUser, Building2, Check, LandPlot, type LucideIcon, QrCode, Signature, Stamp, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { palette } from "../palette";
import { type EyeLayout, type EyeState, lidEdge, now } from "./eyeState";

type Outcome = "verified" | "manual" | "mismatch";
type Doc = { icon: LucideIcon; name: string; finding: string; outcome: Outcome };

const DOCS: Doc[] = [
  { icon: Signature, name: "Fire NOC", finding: "Issuer signature intact", outcome: "verified" },
  { icon: BookUser, name: "Faculty list", finding: "3 IDs also listed at other colleges", outcome: "manual" },
  { icon: Award, name: "Degree certificate", finding: "Signed QR matches the printed text", outcome: "verified" },
  { icon: Stamp, name: "Fire NOC, revision 3", finding: "Modified after signing", outcome: "mismatch" },
  { icon: QrCode, name: "Affiliation letter", finding: "QR payload verified with the issuer key", outcome: "verified" },
  { icon: LandPlot, name: "Land deed", finding: "Survey number cited in another application", outcome: "manual" },
  { icon: Building2, name: "Building completion", finding: "Not found in issuer registry", outcome: "mismatch" },
  { icon: Award, name: "AICTE approval letter", finding: "Issuer signature intact", outcome: "verified" },
];

const TONE: Record<Outcome, { dot: string; fg: string; bg: string; label: string; tone: number }> = {
  verified: { ...palette.status.verified, label: "Verified", tone: 0 },
  manual: { ...palette.status.manual, label: "Manual review", tone: 1 },
  mismatch: { ...palette.status.mismatch, label: "Mismatch", tone: 2 },
};

type Phase = "travel" | "read" | "mark" | "out";
type Sim = {
  id: number;
  doc: Doc;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bend: number;
  travel: number;
  elapsed: number;
  phase: Phase;
  phaseT: number;
  paused: boolean;
  side: 1 | -1;
  slot: number;
  spin: number;
  el: HTMLDivElement | null;
};
type View = { id: number; doc: Doc; phase: Phase; side: 1 | -1 };

const SLOTS = [-30, -10, 10, 30];
const READ_T = 0.95;
const MARK_T = 1.5;
const OUT_T = 0.6;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeTile(id: number, l: EyeLayout, side: 1 | -1, slot: number, doc: Doc): Sim {
  const fromTop = Math.random() < 0.5;
  const x0 = side * l.apertureA * (0.56 + Math.random() * 0.24);
  const e = lidEdge(l, x0);
  const y0 = (fromTop ? e.top : e.bottom) * 0.84;
  const ang = (SLOTS[slot] * Math.PI) / 180;
  const r = l.irisR * 1.0;
  const x1 = side * Math.cos(ang) * r;
  const y1 = Math.sin(ang) * r;
  return {
    id,
    doc,
    x0,
    y0,
    x1,
    y1,
    bend: (fromTop ? 1 : -1) * (24 + Math.random() * 30),
    travel: 5.2 + Math.random() * 1.6,
    elapsed: 0,
    phase: "travel",
    phaseT: 0,
    paused: false,
    side,
    slot,
    spin: (Math.random() - 0.5) * 16,
    el: null,
  };
}

function place(t: Sim) {
  if (!t.el) return;
  const p = Math.min(1, t.elapsed / t.travel);
  const k = easeInOut(p);
  const dx = t.x1 - t.x0;
  const dy = t.y1 - t.y0;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.sin(Math.PI * k) * t.bend;
  const x = t.x0 + dx * k + (-dy / len) * bend;
  const y = t.y0 + dy * k + (dx / len) * bend;
  const scale = 0.78 + 0.22 * k;
  const rot = t.spin * (1 - k);
  const fade = t.phase === "travel" ? Math.min(1, p / 0.12) : 1;
  t.el.style.transform = `translate(${x.toFixed(1)}px, ${(-y).toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
  t.el.style.opacity = fade.toFixed(3);
}

export default function Tiles({ state, layout, reduced }: { state: EyeState; layout: EyeLayout; reduced: boolean }) {
  const sims = useRef(new Map<number, Sim>());
  const [views, setViews] = useState<View[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const nextId = useRef(1);
  const docIdx = useRef(0);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const sync = () =>
    setViews([...sims.current.values()].map((s) => ({ id: s.id, doc: s.doc, phase: s.phase, side: s.side })));

  useEffect(() => {
    sims.current.clear();
    if (layout.compact) {
      setViews([]);
      return;
    }
    if (reduced) {
      const fixed: [1 | -1, number, number][] = [
        [-1, 1, 0],
        [1, 2, 3],
        [-1, 3, 1],
        [1, 0, 5],
      ];
      fixed.forEach(([side, slot, d], i) => {
        const s = makeTile(i + 1, layout, side, slot, DOCS[d]);
        s.elapsed = s.travel;
        s.phase = "mark";
        s.bend = 0;
        sims.current.set(s.id, s);
      });
      sync();
      return;
    }
    let raf = 0;
    let last = now();
    let spawnAt = last + 0.4;
    let side: 1 | -1 = 1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = now();
      const dt = Math.min(0.05, t - last);
      last = t;
      if (!state.running) {
        spawnAt += dt;
        return;
      }
      const l = layoutRef.current;
      let changed = false;
      if (t > spawnAt && sims.current.size < 5) {
        const busy = new Set([...sims.current.values()].filter((s) => s.side === side).map((s) => s.slot));
        const free = [0, 1, 2, 3].filter((i) => !busy.has(i));
        if (free.length) {
          const slot = free[Math.floor(Math.random() * free.length)];
          const doc = DOCS[docIdx.current++ % DOCS.length];
          const s = makeTile(nextId.current++, l, side, slot, doc);
          sims.current.set(s.id, s);
          changed = true;
        }
        side = side === 1 ? -1 : 1;
        spawnAt = t + 1.5 + Math.random() * 0.9;
      }
      for (const s of sims.current.values()) {
        if (s.paused) continue;
        if (s.phase === "travel") {
          s.elapsed += dt;
          if (s.elapsed >= s.travel) {
            s.phase = "read";
            s.phaseT = 0;
            changed = true;
            const ang = Math.atan2(s.y1, s.x1);
            state.reads.push({ angle: ang, t0: t, tone: TONE[s.doc.outcome].tone });
            if (state.reads.length > 4) state.reads.shift();
          }
        } else {
          s.phaseT += dt;
          const limit = s.phase === "read" ? READ_T : s.phase === "mark" ? MARK_T : OUT_T;
          if (s.phaseT >= limit) {
            changed = true;
            s.phaseT = 0;
            if (s.phase === "read") s.phase = "mark";
            else if (s.phase === "mark") s.phase = "out";
            else sims.current.delete(s.id);
          }
        }
        place(s);
      }
      if (changed) sync();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layout.compact, reduced, state]);

  // re-place static tiles when the layout changes under reduced motion
  useEffect(() => {
    if (!reduced) return;
    for (const s of sims.current.values()) {
      const fresh = makeTile(s.id, layout, s.side, s.slot, s.doc);
      Object.assign(s, { x0: fresh.x0, y0: fresh.y0, x1: fresh.x1, y1: fresh.y1, bend: 0, spin: 0 });
      place(s);
    }
  }, [layout, reduced]);

  const readNow = (id: number) => {
    const s = sims.current.get(id);
    if (!s || s.phase !== "travel") return;
    // read in place: the path freezes at the current point
    s.phase = "read";
    s.phaseT = 0;
    s.paused = false;
    const k = easeInOut(Math.min(1, s.elapsed / s.travel));
    const ang = Math.atan2(s.y0 + (s.y1 - s.y0) * k, s.x0 + (s.x1 - s.x0) * k);
    state.reads.push({ angle: ang, t0: now(), tone: TONE[s.doc.outcome].tone });
    if (state.reads.length > 4) state.reads.shift();
    sync();
  };

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute top-1/2 left-1/2 h-0 w-0">
        {views.map((v) => {
          const tone = TONE[v.doc.outcome];
          const Icon = v.doc.icon;
          const showLabel = hovered === v.id || v.phase === "mark";
          return (
            <div
              key={v.id}
              data-tile
              ref={(el) => {
                const s = sims.current.get(v.id);
                if (s && el && s.el !== el) {
                  s.el = el;
                  place(s);
                }
              }}
              className="pointer-events-auto absolute top-0 left-0 cursor-pointer will-change-transform"
              style={{ opacity: 0 }}
              onPointerEnter={() => {
                const s = sims.current.get(v.id);
                if (s) s.paused = true;
                setHovered(v.id);
              }}
              onPointerLeave={() => {
                const s = sims.current.get(v.id);
                if (s) s.paused = false;
                setHovered((h) => (h === v.id ? null : h));
              }}
              onClick={() => readNow(v.id)}
            >
              <motion.div
                animate={
                  v.phase === "out"
                    ? { opacity: 0, scale: 0.6, filter: "blur(6px)" }
                    : { opacity: 1, scale: hovered === v.id ? 1.08 : 1, filter: "blur(0px)" }
                }
                transition={{ duration: v.phase === "out" ? OUT_T : 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <div
                  className="relative grid size-[62px] place-items-center overflow-hidden rounded-[14px]"
                  style={{
                    background: `linear-gradient(160deg, #ffffff 0%, ${palette.brand[50]} 55%, ${palette.lilac} 100%)`,
                    boxShadow: `0 6px 0 ${palette.voxel.side}, 0 7px 0 ${palette.brand[700]}, 0 22px 34px -12px rgb(60 20 110 / 0.45), inset 0 1px 0 #fff`,
                    outline: v.phase === "read" ? `2px solid ${palette.brand[400]}` : "none",
                  }}
                >
                  <Icon size={28} strokeWidth={1.8} color={palette.brand[700]} />
                  {v.phase === "read" && (
                    <motion.span
                      className="absolute inset-x-0 h-6"
                      style={{
                        background: `linear-gradient(180deg, transparent, ${palette.brand[400]}66 70%, ${palette.brand[500]})`,
                        boxShadow: `0 2px 10px ${palette.brand[500]}`,
                      }}
                      initial={{ top: "-30%" }}
                      animate={{ top: "100%" }}
                      transition={{ duration: READ_T * 0.85, ease: "linear" }}
                    />
                  )}
                </div>
                <AnimatePresence>
                  {(v.phase === "mark" || v.phase === "out") && (
                    <motion.span
                      key="mark"
                      className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full ring-2 ring-white"
                      style={{ background: tone.dot }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 520, damping: 22 }}
                    >
                      {v.doc.outcome === "verified" && <Check size={14} strokeWidth={3} color="#fff" />}
                      {v.doc.outcome === "mismatch" && <X size={14} strokeWidth={3} color="#fff" />}
                      {v.doc.outcome === "manual" && <span className="size-2 rounded-full bg-white" />}
                    </motion.span>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {showLabel && v.phase !== "out" && (
                    <motion.div
                      key="label"
                      initial={{ opacity: 0, x: v.side * -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`lp-glass lp-shadow-md absolute top-1/2 w-max max-w-[240px] -translate-y-1/2 rounded-xl px-3 py-2 text-left ${v.side === 1 ? "left-[76px]" : "right-[76px]"}`}
                    >
                      <span className="block text-[12px] font-semibold text-(--lp-ink)">{v.doc.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-(--lp-ink-2)">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: tone.dot }} />
                        {v.doc.finding}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
