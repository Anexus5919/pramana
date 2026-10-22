import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useInView,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Reveal, Section, dur, ease, spring } from "../kit";
import { palette } from "../palette";
import NocCard, { CARD_H, CARD_W, type CardRegions } from "./b/NocCard";

type Region = "date" | "sign" | "qr" | "none";
type Mode = "lens" | "wipe";

const LENS_R = 84;
const MAG = 1.1;

const LENS_CAPTION: Record<Region, string> = {
  date: "Revision 3 drew 30-06-2027 over 30-06-2025 after the fire officer signed.",
  sign: "The fire officer's signature is intact, but it covers Revision 1 only. Anything drawn later sits outside it.",
  qr: "The signed QR still says 30-06-2025. The page now disagrees with its own QR.",
  none: "Move the lens over the card to see the signed revision.",
};

const REVISIONS = [
  {
    n: 1,
    title: "Signed by the fire officer",
    meta: "01-07-2024 11:42 · bytes 0 to 48,211",
    note: "Covered by the signature. Chain ends at CCA India root.",
    tone: "verified" as const,
  },
  {
    n: 2,
    title: "Form field filled",
    meta: "02-07-2024 09:10 · incremental update",
    note: "A change the signature's permissions allow.",
    tone: "pending" as const,
  },
  {
    n: 3,
    title: "Text drawn over page 1",
    meta: "14-03-2026 18:27 · incremental update",
    note: "Not covered by any signature. Overlaps Valid Up To.",
    tone: "mismatch" as const,
  },
];

function wipeCaption(v: number) {
  if (v < 50) return "Revision 1 is what the fire officer signed on 01-07-2024: Valid Up To 30-06-2025.";
  if (v < 150) return "Revision 2 filled a form field, a change the signature's permissions allow. The date is unchanged.";
  return LENS_CAPTION.date;
}

// Keep dd-mm-yyyy dates on one line
function nowrapDates(text: string) {
  return text.split(/(\d{2}-\d{2}-\d{4})/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function wipeRevision(v: number) {
  return v < 50 ? 1 : v < 150 ? 2 : 3;
}

// The x-ray stage: revision 3 on the page, revision 1 revealed under a circular lens or a scrubbed wipe
function XrayStage({
  mode,
  setMode,
  region,
  setRegion,
  scrub,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  region: Region;
  setRegion: (r: Region) => void;
  scrub: number;
}) {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const regions: CardRegions = { date: useRef(null), sign: useRef(null), qr: useRef(null) };
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const rest = useRef({ x: 300, y: 380 });
  const rects = useRef<Record<Exclude<Region, "none">, DOMRect | null>>({ date: null, sign: null, qr: null });
  const hovering = useRef(false);

  const lx = useMotionValue(300);
  const ly = useMotionValue(380);
  const wipe = useMotionValue(0);
  const lensClip = useMotionTemplate`circle(${LENS_R / MAG}px at ${lx}px ${ly}px)`;
  const origin = useMotionTemplate`${lx}px ${ly}px`;
  const wipeRight = useTransform(wipe, (w) => 100 - w);
  const wipeClip = useMotionTemplate`inset(0 ${wipeRight}% 0 0)`;
  const wipeX = useTransform(wipe, (w) => (w / 100) * CARD_W);
  const lensX = useTransform(lx, (v) => v - LENS_R);
  const lensY = useTransform(ly, (v) => v - LENS_R);

  // Card-local rectangles of the regions the caption reacts to
  const measure = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const c = card.getBoundingClientRect();
    const s = scaleRef.current;
    for (const key of ["date", "sign", "qr"] as const) {
      const el = regions[key].current;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      rects.current[key] = new DOMRect((r.left - c.left) / s, (r.top - c.top) / s, r.width / s, r.height / s);
    }
    const d = rects.current.date;
    if (d) rest.current = { x: d.x + d.width / 2, y: d.y + d.height / 2 };
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = Math.min(1, el.clientWidth / CARD_W);
      scaleRef.current = s;
      setScale(s);
      requestAnimationFrame(() => {
        measure();
        if (!hovering.current) {
          lx.set(rest.current.x);
          ly.set(rest.current.y);
        }
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [lx, ly, measure]);

  // Wipe follows the scrubber
  useEffect(() => {
    const target = (200 - scrub) / 2;
    if (reduced) wipe.set(target);
    else animate(wipe, target, { duration: dur.ui, ease: ease.out });
  }, [scrub, reduced, wipe]);


  function regionAt(x: number, y: number): Region {
    const pad = 26;
    for (const key of ["date", "sign", "qr"] as const) {
      const r = rects.current[key];
      if (r && x >= r.x - pad && x <= r.right + pad && y >= r.y - pad && y <= r.bottom + pad) return key;
    }
    return "none";
  }

  function local(e: PointerEvent) {
    const c = cardRef.current!.getBoundingClientRect();
    const s = scaleRef.current;
    return { x: Math.max(0, Math.min(CARD_W, (e.clientX - c.left) / s)), y: Math.max(0, Math.min(CARD_H, (e.clientY - c.top) / s)) };
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType === "touch") return;
    hovering.current = true;
    if (mode !== "lens") setMode("lens");
    const p = local(e);
    lx.set(p.x);
    ly.set(p.y);
    const r = regionAt(p.x, p.y);
    if (r !== region) setRegion(r);
  }

  function onLeave() {
    hovering.current = false;
    const t = rest.current;
    if (reduced) {
      lx.set(t.x);
      ly.set(t.y);
    } else {
      animate(lx, t.x, spring.soft);
      animate(ly, t.y, spring.soft);
    }
    if (mode === "lens") setRegion("date");
  }

  // Touch: tap to move the lens there
  function onDown(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    if (mode !== "lens") setMode("lens");
    const p = local(e);
    animate(lx, p.x, spring.snappy);
    animate(ly, p.y, spring.snappy);
    setRegion(regionAt(p.x, p.y));
  }

  // First view: the lens starts beside the date on the edited page, then glides over it to reveal the signed value
  const inView = useInView(wrapRef, { once: true, margin: "0px 0px -25% 0px" });
  const introDone = useRef(false);
  useEffect(() => {
    if (!inView || introDone.current || reduced) return;
    introDone.current = true;
    const t = rest.current;
    lx.set(Math.min(CARD_W - LENS_R, t.x + 190));
    ly.set(t.y - 6);
    setRegion("none");
    const id = window.setTimeout(() => {
      if (hovering.current) return;
      animate(lx, t.x, { duration: 1.1, ease: ease.inOut });
      animate(ly, t.y, { duration: 1.1, ease: ease.inOut });
      window.setTimeout(() => !hovering.current && setRegion("date"), 650);
    }, 900);
    return () => window.clearTimeout(id);
  }, [inView, reduced, lx, ly, setRegion]);

  const lens = mode === "lens";

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      style={{ height: CARD_H * scale }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerDown={onDown}
    >
      <div
        ref={cardRef}
        className="lp-shadow-lg absolute top-0 left-1/2 origin-top-left overflow-hidden rounded-[6px] [@media(pointer:fine)]:cursor-none"
        style={{ width: CARD_W, height: CARD_H, transform: `translateX(${(-CARD_W * scale) / 2}px) scale(${scale})` }}
        role="img"
        aria-label="Synthetic fire safety certificate for Krishna Valley College, Karad. On the page, Valid Up To reads 30-06-2027. The signed revision underneath reads 30-06-2025 with the issuer signature intact."
      >
        <NocCard rev={3} regions={regions} />

        {/* Revision 1, clipped to the lens or the wipe */}
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={
            lens
              ? { clipPath: lensClip, WebkitClipPath: lensClip, transformOrigin: origin, scale: MAG }
              : { clipPath: wipeClip, WebkitClipPath: wipeClip }
          }
        >
          <NocCard rev={1} />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(0deg, rgb(116 40 234 / 0.045) 0px, rgb(116 40 234 / 0.045) 1px, transparent 1px, transparent 3px)",
            }}
          />
        </motion.div>

        {/* Lens ring */}
        <AnimatePresence>
          {lens && (
            <motion.div
              key="lens"
              aria-hidden
              className="pointer-events-none absolute top-0 left-0"
              style={{ x: lensX, y: lensY }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.ui }}
            >
              <div
                className="relative rounded-full"
                style={{
                  width: LENS_R * 2,
                  height: LENS_R * 2,
                  border: "2px solid rgb(255 255 255 / 0.95)",
                  background: `radial-gradient(circle, transparent 62%, ${palette.brand[500]}22 88%, ${palette.brand[600]}40 100%)`,
                  boxShadow: `0 0 0 1px ${palette.brand[600]}80, 0 22px 50px -16px rgb(43 15 92 / 0.55), inset 0 0 0 5px rgb(255 255 255 / 0.18), inset 0 0 22px ${palette.brand[500]}38`,
                }}
              >
                {[0, 90, 180, 270].map((a) => (
                  <span
                    key={a}
                    className="absolute top-1/2 left-1/2 h-[2px] w-[9px] rounded-full bg-white"
                    style={{ transform: `rotate(${a}deg) translateX(${LENS_R - 12}px) translateY(-1px)`, transformOrigin: "0 0" }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-center">
                <span
                  className="lp-mono rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] text-white"
                  style={{ background: palette.brand[600], boxShadow: "0 6px 16px -6px rgb(43 15 92 / 0.6)" }}
                >
                  REVISION 1 · SIGNED
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wipe divider */}
        {!lens && (
          <motion.div aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-0 w-0" style={{ x: wipeX }}>
            <div className="absolute inset-y-0 -left-px w-[2px]" style={{ background: palette.brand[500] }} />
            <div
              className="lp-mono absolute top-4 -translate-x-full rounded-l-full py-1 pr-2 pl-2.5 text-[10px] font-semibold whitespace-nowrap text-white"
              style={{ background: palette.brand[600] }}
            >
              REV 1
            </div>
            <div
              className="lp-mono absolute top-4 rounded-r-full py-1 pr-2.5 pl-2 text-[10px] font-semibold whitespace-nowrap"
              style={{ background: palette.status.mismatch.bg, color: palette.status.mismatch.fg }}
            >
              REV 3
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function SeeThroughEdits() {
  const [mode, setMode] = useState<Mode>("lens");
  const [region, setRegion] = useState<Region>("date");
  const [scrub, setScrub] = useState(200);

  const caption = mode === "lens" ? LENS_CAPTION[region] : wipeCaption(scrub);
  const captionKey = mode === "lens" ? `l-${region}` : `w-${wipeRevision(scrub)}`;
  const activeRev = mode === "lens" ? null : wipeRevision(scrub);
  const tone = mode === "lens" ? (region === "none" ? "neutral" : region === "sign" ? "verified" : "mismatch") : activeRev === 3 ? "mismatch" : "verified";

  function onScrub(v: number) {
    setMode("wipe");
    setScrub(v);
  }

  function onScrubKey(e: KeyboardEvent<HTMLInputElement>) {
    const stops = [0, 100, 200];
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onScrub([...stops].reverse().find((s) => s < scrub) ?? 0);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onScrub(stops.find((s) => s > scrub) ?? 200);
    }
  }

  const dot =
    tone === "mismatch" ? palette.status.mismatch.dot : tone === "verified" ? palette.status.verified.dot : palette.brand[400];

  return (
    <Section
      id="edits"
      eyebrow="Document forensics"
      title="See through edits."
      lede="A signed PDF keeps every revision it ever saved. Pramana opens each one, checks which bytes the signature actually covers, and shows what changed after the officer signed."
    >
      <div className="mt-14 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
        <Reveal className="min-w-0">
          <div className="relative overflow-hidden rounded-[28px] border border-(--lp-line) bg-[linear-gradient(160deg,var(--lp-lilac),var(--lp-rose)_55%,var(--lp-peach))] p-4 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage: "radial-gradient(rgb(255 255 255 / 0.7) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
              }}
            />
            <XrayStage mode={mode} setMode={setMode} region={region} setRegion={setRegion} scrub={scrub} />
          </div>
        </Reveal>

        <Reveal delay={0.1} className="min-w-0 lg:sticky lg:top-28">
          <p className="lp-eyebrow">What the lens shows</p>
          <div className="mt-3 min-h-[124px] sm:min-h-[104px]" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={captionKey}
                className="lp-display flex gap-3 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-(--lp-ink) sm:text-[26px]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: dur.ui, ease: ease.out }}
              >
                <span aria-hidden className="mt-[0.55em] size-2.5 shrink-0 rounded-[3px]" style={{ background: dot }} />
                <span>{nowrapDates(caption)}</span>
              </motion.p>
            </AnimatePresence>
          </div>

          <ol className="mt-8 space-y-2" aria-label="Revisions in this file">
            {REVISIONS.map((r) => {
              const st = palette.status[r.tone];
              const lit = activeRev === null ? r.n !== 2 : activeRev === r.n;
              const tag = activeRev === null ? (r.n === 1 ? "Under the lens" : r.n === 3 ? "On the page" : null) : activeRev === r.n ? "Showing" : null;
              return (
                <li
                  key={r.n}
                  className="relative flex gap-3 rounded-[14px] border p-3.5 transition-[opacity,border-color,background-color] duration-200"
                  style={{
                    opacity: lit ? 1 : 0.55,
                    borderColor: lit ? `${st.dot}55` : "var(--lp-line)",
                    background: lit ? `${st.bg}` : "var(--lp-surface)",
                  }}
                >
                  <span
                    aria-hidden
                    className="lp-mono grid size-8 shrink-0 place-items-center rounded-[8px] text-[12px] font-bold text-white"
                    style={{ background: st.dot, boxShadow: `inset 0 -3px 0 rgb(0 0 0 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.3)` }}
                  >
                    {r.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[14px] font-semibold text-(--lp-ink)">
                        Revision {r.n}: {r.title}
                      </p>
                      {tag && (
                        <span
                          className="rounded-full px-2 py-px text-[10.5px] font-semibold"
                          style={{ color: st.fg, background: "rgb(255 255 255 / 0.7)" }}
                        >
                          {tag}
                        </span>
                      )}
                    </div>
                    <p className="lp-mono mt-0.5 text-[11.5px] text-(--lp-ink-3)">{r.meta}</p>
                    <p className="mt-1 text-[13px] text-(--lp-ink-2)">{r.note}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 rounded-[14px] border border-(--lp-line) bg-(--lp-surface) p-4">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="rev-scrub" className="text-[13px] font-semibold text-(--lp-ink)">
                Scrub revisions
              </label>
              <span className="text-[12px] text-(--lp-ink-3)">Keyboard and touch</span>
            </div>
            <input
              id="rev-scrub"
              type="range"
              min={0}
              max={200}
              step={1}
              value={scrub}
              onChange={(e) => onScrub(Number(e.target.value))}
              onKeyDown={onScrubKey}
              aria-valuetext={`Revision ${wipeRevision(scrub)}`}
              className="mt-3 w-full cursor-pointer accent-(--lp-brand-500)"
            />
            <div className="lp-mono mt-1 flex justify-between text-[11px] text-(--lp-ink-3)">
              <span>Rev 1 signed</span>
              <span>Rev 2</span>
              <span>Rev 3 on file</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-[12.5px] text-(--lp-ink-2)">
            <span
              className="lp-mono inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] font-semibold text-white"
              style={{ background: palette.ev[0] }}
            >
              E1 cryptographic
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] font-semibold"
              style={{ background: palette.status.mismatch.bg, color: palette.status.mismatch.fg }}
            >
              Modified after signing
            </span>
            <span>Page 1, Valid Up To. The signature's byte range ends before revision 3.</span>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
