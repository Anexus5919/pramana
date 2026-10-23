import { ArrowRight } from "lucide-react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { lazy, type PointerEvent, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { OutlineButton, PrimaryLink, scrollToId, useWorkspaceHref } from "../kit";
import { computeLayout, createEyeState, type EyeLayout, now } from "./eyeState";
import StaticEye from "./StaticEye";
import Tiles from "./Tiles";

const EyeScene = lazy(() => import("./EyeScene"));

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Hero() {
  const href = useWorkspaceHref();
  const reduced = !!useReducedMotion();
  const stateRef = useRef(createEyeState());
  const state = stateRef.current;
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<EyeLayout | null>(null);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [glFailed, setGlFailed] = useState(() => !webglAvailable());

  // never leave the hero empty: fall back to the flat block eye if WebGL does not come up
  useEffect(() => {
    if (ready || glFailed) return;
    const t = window.setTimeout(() => setGlFailed(true), 6000);
    return () => window.clearTimeout(t);
  }, [ready, glFailed]);

  // eye geometry follows the stage and the copy block
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const copy = copyRef.current;
    if (!stage || !copy) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      const l = computeLayout(r.width, r.height, copy.offsetWidth, copy.offsetHeight);
      state.layout = l;
      setLayout(l);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(copy);
    return () => ro.disconnect();
  }, [state]);

  // pause rendering off-screen or in a hidden tab
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "0px" });
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const frameloop = reduced ? "demand" : inView && tabVisible ? "always" : "never";
  state.running = frameloop === "always";

  // scrolling past the hero closes the eyelids
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const c = Math.min(1, Math.max(0, (p - 0.04) / 0.82));
    state.scrollClose = c * c * (3 - 2 * c);
  });
  const copyOpacity = useTransform(scrollYProgress, [0, 0.42], [1, 0]);
  const copyY = useTransform(scrollYProgress, [0, 0.5], [0, -28]);
  const layerOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  // once the lids have closed, the block wall dissolves into the page instead of ending on a hard edge
  const handoff = useTransform(scrollYProgress, [0.72, 1], [0, 1]);

  const toNdc = (e: PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const p = toNdc(e);
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.inside = true;
    state.pointer.lastMove = now();
  };

  const onDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a,button,h1,p,[data-tile],[data-pill]")) return;
    const p = toNdc(e);
    state.pulses.push({ x: p.x, y: p.y, t0: now() });
    if (state.pulses.length > 4) state.pulses.shift();
    setHinted(true);
  };

  return (
    <section ref={sectionRef} id="top" aria-labelledby="hero-title" className="relative h-[175svh]">
      <div
        ref={stageRef}
        className="lp-sky sticky top-0 h-svh w-full overflow-hidden"
        onPointerMove={onMove}
        onPointerLeave={() => {
          state.pointer.inside = false;
        }}
        onPointerDown={onDown}
      >
        {layout && glFailed && <StaticEye layout={layout} />}
        {layout && !glFailed && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <Suspense fallback={<StaticEye layout={layout} />}>
              <EyeScene
                state={state}
                layout={layout}
                frameloop={frameloop}
                reduced={reduced}
                onReady={() => setReady(true)}
                onFail={() => setGlFailed(true)}
              />
            </Suspense>
          </motion.div>
        )}

        {layout && (ready || glFailed) && (
          <motion.div className="absolute inset-0" style={{ opacity: layerOpacity }}>
            <Tiles state={state} layout={layout} reduced={reduced} />
          </motion.div>
        )}

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: handoff,
            background: "linear-gradient(to bottom, transparent 0%, transparent 35%, var(--lp-canvas) 92%)",
          }}
        />

        <div className="pointer-events-none absolute inset-0 grid place-items-center px-5">
          <motion.div
            ref={copyRef}
            className="pointer-events-auto flex max-w-[540px] flex-col items-center text-center"
            style={{ opacity: copyOpacity, y: copyY }}
          >
            <motion.span
              data-pill
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-(--lp-brand-200) bg-white/70 px-3 py-1 text-[12px] font-semibold tracking-[0.04em] text-(--lp-brand-700) backdrop-blur-md"
            >
              <span className="grid grid-cols-2 gap-[2px]" aria-hidden>
                <span className="size-[4px] rounded-[1px] bg-(--lp-brand-500)" />
                <span className="size-[4px] rounded-[1px] bg-(--lp-brand-300)" />
                <span className="size-[4px] rounded-[1px] bg-(--lp-brand-300)" />
                <span className="size-[4px] rounded-[1px] bg-(--lp-brand-500)" />
              </span>
              SIH 2026 · PS 26261 · AICTE
            </motion.span>
            <motion.h1
              id="hero-title"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
              className="lp-display mt-5 text-[clamp(38px,min(4.5vw,7.1vh),64px)] leading-[0.98] font-semibold text-(--lp-ink)"
            >
              Every approval,
              <br />
              checked against
              <br />
              its evidence.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
              className="mt-5 max-w-[440px] text-[15px] leading-[1.55] text-(--lp-ink-2) sm:text-[16px]"
            >
              Pramana reads each document, verifies signatures and issuer records, and links what one application hides to
              what another reveals. Officials decide; Pramana shows the proof.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.26 }}
              className="mt-7 flex flex-wrap items-center justify-center gap-3"
            >
              <PrimaryLink to={href}>
                Open the workspace <ArrowRight className="size-4" aria-hidden />
              </PrimaryLink>
              <OutlineButton onClick={() => scrollToId("how")}>See how it works</OutlineButton>
            </motion.div>
          </motion.div>
        </div>

        {!reduced && layout && !layout.compact && (
          <motion.div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center" style={{ opacity: layerOpacity }}>
            <motion.p
              data-pill
              className="lp-glass rounded-full px-4 py-1.5 text-[12px] font-medium text-(--lp-ink-2)"
              initial={{ opacity: 0 }}
              animate={{ opacity: hinted ? 0 : 1 }}
              transition={{ duration: 0.6, delay: hinted ? 0 : 2.2 }}
            >
              The eye follows your cursor. Click anywhere to send a scan. Hover a document to read its finding.
            </motion.p>
          </motion.div>
        )}
      </div>
    </section>
  );
}
