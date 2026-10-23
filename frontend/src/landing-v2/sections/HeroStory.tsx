import { ArrowDown, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useScroll, type MotionValue } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Certificate } from "../illustrations/Certificate";
import { Hand, RING, type Pose } from "../illustrations/Hand";
import type { EyeMode, LookSource } from "../lib/gaze";
import { useReducedMotionPref, useSequence, useViewport } from "../lib/hooks";
import { WORKSPACE_URL } from "../links";
import { CheckList, ReviewNote, StepPills, STORY_COPY } from "./story-parts";

type HP = { x: number; y: number; r: number; s: number };
type Box = { x: number; y: number; w: number };
type Layout = {
  scale: number;
  W: number;
  H: number;
  wide: boolean;
  hero: { rose: HP; tang: HP };
  hold: { rose: HP; tang: HP };
  card: Box;
  caption: Box;
  side: Box;
};

function computeLayout(vw: number, vh: number): Layout {
  if (vw >= 900) {
    const scale = Math.min(Math.max(vh / 820, 0.7), 1.3, vw / 1480);
    const W = vw / scale;
    const H = vh / scale;
    const cx = W / 2;
    const cardW = 440;
    const cardTop = Math.max(190, H * 0.54 - 160);
    const colW = Math.min(340, cx - 420 - 40);
    return {
      scale,
      W,
      H,
      wide: true,
      hero: { rose: { x: cx + 262, y: H * 0.56, r: -5, s: 0.8 }, tang: { x: cx + 486, y: H * 0.525, r: 6, s: 0.8 } },
      hold: { rose: { x: cx - 210, y: cardTop - 26, r: 7, s: 0.7 }, tang: { x: cx + 210, y: cardTop - 26, r: -7, s: 0.7 } },
      card: { x: cx - cardW / 2, y: cardTop, w: cardW },
      caption: { x: cx - 420 - colW, y: cardTop - 8, w: colW },
      side: { x: cx + 420, y: cardTop - 8, w: colW },
    };
  }
  const scale = Math.min(vw / 390, 1.6);
  const W = vw / scale;
  const H = vh / scale;
  const cx = W / 2;
  const cardW = 300;
  const cardTop = Math.max(236, H * 0.31);
  return {
    scale,
    W,
    H,
    wide: false,
    hero: { rose: { x: cx - 62, y: H - 168, r: -6, s: 0.44 }, tang: { x: cx + 64, y: H - 180, r: 6, s: 0.44 } },
    hold: { rose: { x: cx - 142, y: cardTop - 16, r: 8, s: 0.42 }, tang: { x: cx + 142, y: cardTop - 16, r: -8, s: 0.42 } },
    card: { x: cx - cardW / 2, y: cardTop, w: cardW },
    caption: { x: 20, y: 26, w: W - 40 },
    side: { x: 20, y: cardTop + 232, w: W - 40 },
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type HandMV = { x: MotionValue<number>; y: MotionValue<number>; r: MotionValue<number>; s: MotionValue<number> };

function useHandMV(): HandMV {
  return { x: useMotionValue(0), y: useMotionValue(0), r: useMotionValue(0), s: useMotionValue(1) };
}

function setHand(mv: HandMV, a: HP, b: HP, k: number, ringX: number) {
  mv.x.set(lerp(a.x, b.x, k) - ringX);
  mv.y.set(lerp(a.y, b.y, k) - RING.y);
  mv.r.set(lerp(a.r, b.r, k));
  mv.s.set(lerp(a.s, b.s, k));
}

function center(el: Element | null | undefined) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function HandSlot({
  mv,
  hue,
  mirror,
  pose,
  look,
  mode,
  tap,
  leanOn,
  lift,
  label,
}: {
  mv: HandMV;
  hue: "rose" | "tang";
  mirror: boolean;
  pose: Pose;
  look: LookSource;
  mode: EyeMode;
  tap: number;
  leanOn: boolean;
  lift: { x?: number; y: number; r: number };
  label: string;
}) {
  const rx = mirror ? 360 - RING.x : RING.x;
  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0 h-[1300px] w-[360px]"
      style={{ x: mv.x, y: mv.y, rotate: mv.r, scale: mv.s, originX: rx / 360, originY: RING.y / 1300 }}
    >
      <motion.div
        className="h-full w-full"
        style={{ originX: rx / 360, originY: RING.y / 1300 }}
        animate={{ x: lift.x ?? 0, y: lift.y, rotate: lift.r }}
        transition={{ type: "spring", stiffness: 170, damping: 18 }}
      >
        <Hand
          hue={hue}
          mirror={mirror}
          pose={pose}
          tap={tap}
          eye={{ look, mode }}
          lean={{ max: 7, enabled: leanOn }}
          height={1300}
          label={label}
          className="h-full w-full overflow-visible"
        />
      </motion.div>
    </motion.div>
  );
}

function Nav() {
  return (
    <nav aria-label="Main" className="pointer-events-auto mx-auto flex max-w-[1520px] items-center justify-between px-5 pt-5 sm:px-10 sm:pt-7">
      <a href="#top" className="flex items-center gap-2.5 rounded-full" aria-label="Pramana, home">
        <svg viewBox="-48 -34 96 68" className="h-7 w-10" aria-hidden>
          <path d="M -44 0 C -26 -36 26 -36 44 0 C 26 36 -26 36 -44 0 Z" fill="#1B1530" />
          <circle r="15" fill="#F8C22E" />
          <circle r="7" fill="#1B1530" />
        </svg>
        <span className="font-display text-[1.6rem] font-[780] tracking-tight">pramana</span>
      </a>
      <div className="flex items-center gap-1 sm:gap-2">
        <a href="#how" className="hidden rounded-full px-4 py-2 text-[0.95rem] font-semibold hover:bg-ink/8 md:inline-block">
          How it reads
        </a>
        <a href="#lens" className="hidden rounded-full px-4 py-2 text-[0.95rem] font-semibold hover:bg-ink/8 md:inline-block">
          Look closer
        </a>
        <a href="#numbers" className="hidden rounded-full px-4 py-2 text-[0.95rem] font-semibold hover:bg-ink/8 lg:inline-block">
          Numbers
        </a>
        <a data-look href={WORKSPACE_URL} className="pill pill-dark ml-1 px-4! py-2.5! text-[0.9rem]!">
          Workspace
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
    </nav>
  );
}

export function HeroCopy({ children }: { children?: ReactNode }) {
  return (
    <div className="pointer-events-none mx-auto flex h-full max-w-[1520px] flex-col justify-start px-5 pt-[92px] sm:px-10 min-[900px]:justify-center min-[900px]:pt-0 min-[900px]:pb-6">
      <div className="max-w-[min(46vw,700px)] max-[899px]:max-w-none">
        <div className="pointer-events-auto mb-5 flex flex-wrap gap-2 sm:mb-7">
          <span className="chip bg-ink text-white">Smart India Hackathon 2026</span>
          <span className="chip bg-white/70 text-ink">Problem statement 26261, AICTE</span>
        </div>
        <h1 className="font-display text-[clamp(2.35rem,5vw,6.2rem)] leading-[0.98] text-ink">
          <span className="block font-[380]">Look closely at</span>
          <span className="block font-[800]">every approval.</span>
        </h1>
        <p className="mt-5 max-w-[34rem] text-[clamp(1rem,1.25vw,1.22rem)] leading-relaxed text-ink-2 sm:mt-7">
          Pramana reads every document in an institution's approval application and checks it against evidence: digital
          signatures, issuer QR codes, issuer registries and 29 cited APH rules.
        </p>
        <div className="pointer-events-auto mt-6 flex flex-wrap items-center gap-3 sm:mt-9">
          <a data-look href={WORKSPACE_URL} className="pill pill-dark">
            Open the workspace
            <ArrowUpRight className="size-[1.1em]" aria-hidden />
          </a>
          <a data-look href="#story" className="pill pill-ghost">
            See how it reads
            <ArrowDown className="size-[1.1em]" aria-hidden />
          </a>
        </div>
        <p className="mt-5 text-[0.85rem] font-medium text-ink-2 sm:mt-7">Decision support only. All demo data is synthetic.</p>
        {children}
      </div>
    </div>
  );
}

export function StatementBand({ height }: { height?: number }) {
  return (
    <section
      aria-label="What Pramana does"
      className="relative z-20 flex items-center justify-center rounded-[40px] bg-white px-6 py-24 sm:rounded-[56px]"
      style={height ? { minHeight: height } : undefined}
    >
      <p className="max-w-[21ch] text-center font-display text-[clamp(2.1rem,4.6vw,5rem)] leading-[1.06] font-[560] text-balance text-ink">
        Every approval, read against its evidence.{" "}
        <span className="font-[380] text-ink-2">Officials decide;</span>{" "}
        <span
          className="font-[800] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
          style={{
            backgroundImage: "linear-gradient(transparent 58%, #F8C22E 58%, #F8C22E 90%, transparent 90%)",
          }}
        >
          Pramana shows the proof.
        </span>
      </p>
    </section>
  );
}

export function HeroStory() {
  const reduced = useReducedMotionPref();
  return reduced ? <StaticHeroStory /> : <ScrollHeroStory />;
}

// Reduced motion: no pinning, no gaze, both story states laid out side by side
function StaticHeroStory() {
  return (
    <div id="top">
      <div className="relative overflow-hidden bg-sun">
        <Nav />
        <div className="grid min-[900px]:min-h-[calc(100svh-90px)] min-[900px]:grid-cols-[1.1fr_1fr]">
          <div className="pb-6 [&>div]:pt-10 min-[900px]:[&>div]:pt-0">
            <HeroCopy />
          </div>
          <div className="flex items-end justify-center gap-0 self-end" aria-hidden>
            <Hand hue="rose" mirror pose="ok" height={700} className="h-[min(62vh,620px)] w-auto" />
            <Hand hue="tang" pose="ok" height={700} className="-ml-6 h-[min(66vh,660px)] w-auto" />
          </div>
        </div>
      </div>
      <div className="bg-sun px-3 sm:px-5">
        <StatementBand />
      </div>
      <section id="story" aria-label="How Pramana looks at a certificate" className="bg-sun px-5 py-20 sm:px-10">
        <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-2">
          <div>
            <StepPills step={1} />
            <h2 className="mt-4 font-display text-[2.2rem] leading-[1.02] font-[780]">{STORY_COPY.check.title}</h2>
            <p className="mt-3 max-w-[34rem] text-[1.02rem] leading-relaxed text-ink-2">{STORY_COPY.check.body}</p>
            <div className="mt-8 flex flex-wrap items-start gap-6">
              <div className="relative">
                <Certificate
                  id="panchganga"
                  width={360}
                  signature="intact"
                  highlight={{ signature: "ok", qr: "ok", number: "ok" }}
                />
                <span className="absolute -top-4 right-10 rounded-full bg-ok px-4 py-2 text-[0.85rem] font-bold text-white">
                  3 of 3 checks hold
                </span>
              </div>
              <Hand hue="rose" mirror pose="ok" height={520} top={40} className="h-40 w-auto" label="A hand making an OK sign: confirmed" />
            </div>
            <div className="mt-6 max-w-[30rem]">
              <CheckList shown={3} />
            </div>
          </div>
          <div>
            <StepPills step={2} />
            <h2 className="mt-4 font-display text-[2.2rem] leading-[1.02] font-[780]">{STORY_COPY.review.title}</h2>
            <p className="mt-3 max-w-[34rem] text-[1.02rem] leading-relaxed text-ink-2">{STORY_COPY.review.body}</p>
            <div className="mt-8 flex flex-wrap items-start gap-6">
              <Certificate id="krishna-r3" width={360} signature="changed" highlight={{ validity: "alert" }} />
              <Hand
                hue="tang"
                pose="open"
                height={520}
                top={40}
                eye={{ mode: "open" }}
                className="h-40 w-auto"
                label="An open palm with an eye: wait, a person must review"
              />
            </div>
            <div className="mt-6 max-w-[30rem]">
              <ReviewNote show />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScrollHeroStory() {
  const vp = useViewport();
  const L = computeLayout(vp.w, vp.h);
  const bandH = Math.round(vp.h * 0.92);
  const storyLen = Math.round(vp.h * 2.7);
  const total = vp.h + Math.round(bandH * 0.72) + storyLen + Math.round(vp.h * 0.35) + vp.h;

  const wrapRef = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const topRef = useRef(0);
  const rose = useHandMV();
  const tang = useHandMV();
  const cardY = useMotionValue(600);
  const [hero, setHero] = useState(true);
  const [step, setStep] = useState(-1);

  const { scrollY } = useScroll();
  const update = useCallback(() => {
    const t = window.scrollY - topRef.current;
    const k = easeInOut(clamp01(t / (vp.h * 0.72)));
    setHand(rose, L.hero.rose, L.hold.rose, k, 360 - RING.x);
    setHand(tang, L.hero.tang, L.hold.tang, k, RING.x);
    const c = easeInOut(clamp01((t - vp.h * 0.45) / (vp.h * 0.95)));
    cardY.set((1 - c) * (L.H * 0.75));
    const s = (t - (vp.h + bandH * 0.72)) / storyLen;
    setStep(s < 0 ? -1 : s < 0.06 ? 0 : s < 0.5 ? 1 : 2);
    setHero(t < vp.h * 0.3);
  }, [L, vp.h, bandH, storyLen, rose, tang, cardY]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el) topRef.current = el.getBoundingClientRect().top + window.scrollY;
    update();
  }, [update, total]);
  useMotionValueEvent(scrollY, "change", update);

  const seq1 = useSequence(step >= 1, [0, 1250, 1950, 2650, 3450], step >= 2);
  const seq2 = useSequence(step >= 2, [0, 1150, 1850, 2700]);
  const checked = step >= 2 ? 3 : Math.max(0, Math.min(3, seq1));
  const confirmed = step >= 2 || seq1 >= 4;
  const flagged = step >= 2 && seq2 >= 1;
  const opened = step >= 2 && seq2 >= 3;

  const field = (root: HTMLDivElement | null, f: string) => () => center(root?.querySelector(`[data-field="${f}"]`));
  let look: LookSource = "auto";
  if (!hero) {
    if (step >= 2) look = seq2 <= 0 ? () => center(scanRef.current) : field(card2Ref.current, "validity");
    else if (step === 1) {
      const order = ["signature", "qr", "number", "institution"];
      look = seq1 <= 0 ? () => center(scanRef.current) : field(card1Ref.current, order[Math.min(seq1 - 1, 3)]);
    } else look = () => center(card1Ref.current);
  }
  const roseMode: EyeMode = flagged ? "narrow" : "open";
  const tangMode: EyeMode = flagged && !opened ? "narrow" : "open";
  const copy = step >= 2 ? STORY_COPY.review : STORY_COPY.check;
  const storyOn = step >= 0;

  return (
    <div id="top" ref={wrapRef} className="relative bg-sun" style={{ height: total }}>
      <div className="sticky top-0 z-10 overflow-hidden" style={{ height: vp.h }}>
        <div
          className="absolute top-0 left-0"
          style={{ width: L.W, height: L.H, transform: `scale(${L.scale})`, transformOrigin: "0 0" }}
        >
          <HandSlot
            mv={rose}
            hue="rose"
            mirror
            pose="ok"
            look={look}
            mode={roseMode}
            tap={confirmed ? 1 : 0}
            leanOn={hero}
            lift={{ y: 0, r: 0 }}
            label="A pink hand making an OK sign, the ring of thumb and finger framing a watching eye"
          />
          <HandSlot
            mv={tang}
            hue="tang"
            mirror={false}
            pose={opened ? "open" : "ok"}
            look={opened ? "ahead" : look}
            mode={tangMode}
            tap={confirmed ? 1 : 0}
            leanOn={hero}
            lift={opened ? (L.wide ? { y: -40, r: 9 } : { x: -34, y: -30, r: 10 }) : { y: 0, r: 0 }}
            label={
              opened
                ? "The orange hand opens into a raised palm with an eye: wait, a person must review"
                : "An orange hand making an OK sign, the ring of thumb and finger framing a watching eye"
            }
          />

          <motion.div className="absolute" style={{ left: L.card.x, top: L.card.y, width: L.card.w, y: cardY }}>
            <motion.div
              ref={card1Ref}
              className="absolute top-0 left-0"
              initial={false}
              animate={step >= 2 ? { x: -90, opacity: 0, rotate: -6 } : { x: 0, opacity: 1, rotate: -1.5 }}
              transition={{ type: "spring", stiffness: 140, damping: 20 }}
            >
              <Certificate
                id="panchganga"
                width={L.card.w}
                signature={checked >= 1 ? "intact" : "plain"}
                highlight={{
                  signature: checked >= 1 ? "ok" : undefined,
                  qr: checked >= 2 ? "ok" : undefined,
                  number: checked >= 3 ? "ok" : undefined,
                }}
              />
              <AnimatePresence>
                {confirmed && step < 2 && (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
                    animate={{ scale: 1, opacity: 1, rotate: -3 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 16 }}
                    className="absolute -top-5 right-16 rounded-full bg-ok px-4 py-2 text-[0.85rem] font-bold whitespace-nowrap text-white shadow-[0_4px_0_rgba(18,122,62,0.3)]"
                    role="status"
                  >
                    3 of 3 checks hold
                  </motion.span>
                )}
              </AnimatePresence>
              {step === 1 && seq1 === 0 && <Scan ref={scanRef} />}
            </motion.div>
            <motion.div
              ref={card2Ref}
              className="absolute top-0 left-0"
              initial={false}
              animate={step >= 2 ? { x: 0, opacity: 1, rotate: 1.5 } : { x: 110, opacity: 0, rotate: 6 }}
              transition={{ type: "spring", stiffness: 140, damping: 20 }}
              aria-hidden={step < 2}
            >
              <Certificate
                id="krishna-r3"
                width={L.card.w}
                signature={flagged ? "changed" : "plain"}
                highlight={{ validity: flagged ? "alert" : undefined }}
              />
              {step >= 2 && seq2 === 0 && <Scan ref={scanRef} />}
            </motion.div>
          </motion.div>

          <motion.div
            className="absolute"
            style={{ left: L.caption.x, top: L.caption.y, width: L.caption.w }}
            initial={false}
            animate={{ opacity: storyOn ? 1 : 0, y: storyOn ? 0 : 20 }}
            transition={{ duration: 0.45 }}
            aria-hidden={!storyOn}
          >
            <StepPills step={step} />
            <div aria-live="polite">
              <p className="mt-4 text-[0.8rem] font-bold tracking-[0.14em] text-ink-2 uppercase">{copy.kicker}</p>
              <h2 className={`mt-1.5 font-display leading-[1.02] font-[780] ${L.wide ? "text-[2.35rem]" : "text-[1.7rem]"}`}>
                {copy.title}
              </h2>
              {L.wide && <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-2">{copy.body}</p>}
            </div>
          </motion.div>

          <motion.div
            className="absolute"
            style={{ left: L.side.x, top: L.side.y + (L.wide ? 64 : 0), width: L.side.w }}
            initial={false}
            animate={{ opacity: storyOn ? 1 : 0 }}
            transition={{ duration: 0.45 }}
            aria-hidden={!storyOn}
          >
            {step < 2 ? <CheckList shown={checked} compact={!L.wide} /> : <ReviewNote show={flagged} />}
          </motion.div>
        </div>
      </div>

      <div
        id="story"
        aria-hidden
        className="absolute"
        style={{ top: vp.h + Math.round(bandH * 0.72) + Math.round(storyLen * 0.08) }}
      />
      <div className="absolute inset-x-0 top-0 z-20" style={{ pointerEvents: "none" }}>
        <section aria-label="Introduction" style={{ height: vp.h }} className="relative">
          <div className="absolute inset-x-0 top-0">
            <Nav />
          </div>
          <HeroCopy />
        </section>
        <div className="pointer-events-auto px-3 sm:px-5">
          <StatementBand height={bandH} />
        </div>
      </div>
    </div>
  );
}

function Scan({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1em]" aria-hidden>
      <motion.div
        ref={ref}
        className="scan-bar absolute inset-x-0 h-14"
        initial={{ top: "-14%" }}
        animate={{ top: "100%" }}
        transition={{ duration: 1.1, ease: "easeInOut" }}
      />
    </div>
  );
}
