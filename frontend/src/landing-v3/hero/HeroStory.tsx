import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { OutlineButton } from "../../landing/kit";
import { WorkspaceLink } from "../workspace";
import { type Beats, computeLayout, Engine, type Layout, T } from "./engine";
import { FallbackGround, FallbackHands } from "./Fallback";
import StaticStory from "./StaticStory";
import { Certificate, CheckList, ReviewNote, STORY_COPY, StepPills } from "./StoryParts";

const GroundScene = lazy(() => import("./GroundScene"));

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// "See how it works" skips the pinned story instead of racing through it
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    window.scrollTo({ top, behavior: "auto" });
    return;
  }
  const lead = window.innerHeight * 0.6;
  if (top - window.scrollY > lead * 2) window.scrollTo({ top: top - lead, behavior: "instant" });
  requestAnimationFrame(() => window.scrollTo({ top, behavior: "smooth" }));
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,box-shadow,color,transform] duration-200 active:scale-[0.97] select-none";

function HeroCopy({ wide }: { wide: boolean }) {
  return (
    <div className="flex flex-col items-start">
      <span className="inline-flex items-center gap-2 rounded-full border border-(--lp-brand-200) bg-white/70 px-3 py-1 text-[12px] font-semibold tracking-[0.04em] text-(--lp-brand-700) backdrop-blur-md">
        <span className="grid grid-cols-2 gap-[2px]" aria-hidden>
          <span className="size-[4px] rounded-[1px] bg-(--lp-brand-500)" />
          <span className="size-[4px] rounded-[1px] bg-(--lp-brand-300)" />
          <span className="size-[4px] rounded-[1px] bg-(--lp-brand-300)" />
          <span className="size-[4px] rounded-[1px] bg-(--lp-brand-500)" />
        </span>
        SIH 2026 · PS 26261 · AICTE
      </span>
      <h1
        id="hero-title"
        className="lp-display mt-5 text-[clamp(40px,min(4.6vw,8.2vh),92px)] leading-[0.98] font-semibold text-(--lp-ink)"
      >
        Every approval,
        <br />
        checked against
        <br />
        its evidence.
      </h1>
      <p className="mt-4 max-w-[450px] text-[15px] leading-[1.5] text-(--lp-ink-2) sm:text-[17px]">
        Signatures, records and rules, verified at the source. Officials decide; Pramana shows the proof.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-7">
        <WorkspaceLink
          className={`${btnBase} ${wide ? "h-12 px-6 text-[15px]" : "h-11 px-5 text-[14px]"} bg-(--lp-brand-500) text-white shadow-[0_10px_30px_-10px_rgb(139_61_255/0.7),inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-(--lp-brand-600)`}
        >
          Open the workspace <ArrowRight className="size-4" aria-hidden />
        </WorkspaceLink>
        <OutlineButton onClick={() => jumpTo("how")} className={wide ? "" : "h-11! px-5! text-[14px]!"}>
          See how it works
        </OutlineButton>
      </div>
    </div>
  );
}

function StoryCaption({ beats, wide }: { beats: Beats; wide: boolean }) {
  const copy = STORY_COPY[beats.step];
  return (
    <div>
      <StepPills step={beats.step} />
      <div aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={beats.step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="lp-eyebrow mt-5">{copy.kicker}</p>
            <h2 className={`lp-display mt-2 leading-[1.04] font-semibold text-(--lp-ink) ${wide ? "text-[clamp(30px,2.7vw,44px)]" : "text-[25px]"}`}>
              {copy.title}
            </h2>
            {wide && <p className="mt-3 max-w-[440px] text-[16px] leading-relaxed text-(--lp-ink-2)">{copy.body}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={wide ? "mt-6" : "mt-4"}>
        {beats.step === 0 ? <CheckList shown={beats.checked} compact={!wide} /> : <ReviewNote show={beats.flagged} compact={!wide} />}
      </div>
    </div>
  );
}

function ScanLine({ refEl }: { refEl: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={refEl} className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-0" aria-hidden>
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgb(139_61_255/0.16),transparent)]" />
      <div className="absolute inset-x-3 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-(--lp-brand-500)/70" />
    </div>
  );
}

export default function HeroStory() {
  const reduced = !!useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const wrapRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const cardRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const scanRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const fadeRef = useRef<HTMLDivElement>(null);
  const handsCanvasRef = useRef<HTMLCanvasElement>(null);
  const ratioRef = useRef(0.8);
  const renderRef = useRef<((t: number) => void) | null>(null);

  const [layout, setLayout] = useState<Layout>(() =>
    computeLayout(typeof window === "undefined" ? 1440 : window.innerWidth, typeof window === "undefined" ? 900 : window.innerHeight, 0.8),
  );
  const engine = useMemo(() => new Engine(layout, reduced), []); // eslint-disable-line react-hooks/exhaustive-deps
  engine.reduced = reduced;
  const [beats, setBeats] = useState<Beats>(engine.beats);
  const [glFailed, setGlFailed] = useState(() => !webglAvailable() || new URLSearchParams(window.location.search).has("nogl"));
  const [glReady, setGlReady] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __v3?: Engine }).__v3 = engine;
    engine.onBeats = setBeats;
    return () => {
      engine.onBeats = null;
    };
  }, [engine]);

  // the layout follows the stage size and the measured certificate shape
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const section = sectionRef.current;
    if (!stage || !section) return;
    const measure = () => {
      const card = cardRefs[0].current;
      if (card && card.offsetWidth > 0) ratioRef.current = card.offsetHeight / card.offsetWidth;
      const L = computeLayout(stage.clientWidth, stage.clientHeight, ratioRef.current);
      engine.setLayout(L);
      setLayout((old) => (JSON.stringify(old) === JSON.stringify(L) ? old : L));
      engine.sectionTop = section.getBoundingClientRect().top + window.scrollY;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    if (cardRefs[0].current) ro.observe(cardRefs[0].current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (section) engine.sectionTop = section.getBoundingClientRect().top + window.scrollY;
  }, [engine, layout]);

  // pointer, focus and blink inputs for the eyes
  useEffect(() => {
    const move = (e: PointerEvent) => {
      engine.pointer.x = e.clientX;
      engine.pointer.y = e.clientY;
      engine.pointer.has = e.pointerType !== "touch";
    };
    const down = (e: PointerEvent) => {
      move(e);
      engine.blink();
      if (e.pointerType === "touch") engine.touch(e.clientX, e.clientY);
    };
    const leave = () => {
      engine.pointer.has = false;
    };
    const over = (e: PointerEvent) => {
      engine.focus = (e.target as Element | null)?.closest?.("a,button,[data-look]") ?? null;
    };
    const focusIn = (e: FocusEvent) => {
      engine.focus = (e.target as Element | null)?.closest?.("a,button,[data-look]") ?? null;
    };
    const focusOut = () => {
      engine.focus = null;
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
    };
  }, [engine]);

  // pause off-screen or in a hidden tab
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // never leave the hero empty if WebGL does not come up
  useEffect(() => {
    if (glReady || glFailed) return;
    const t = window.setTimeout(() => setGlFailed(true), 6000);
    return () => window.clearTimeout(t);
  }, [glReady, glFailed]);

  const visualReady = glReady || glFailed;
  useEffect(() => {
    if (visualReady) engine.startIntro();
  }, [visualReady, engine]);

  const writeDom = useCallback(() => {
    const F = engine.frame;
    const L = engine.layout;
    const copy = copyRef.current;
    if (copy) {
      copy.style.opacity = String(F.copy);
      copy.style.transform = `translate3d(0, ${(-28 * (1 - F.copy)).toFixed(2)}px, 0)`;
      copy.style.visibility = F.copy < 0.01 ? "hidden" : "visible";
    }
    const cap = captionRef.current;
    if (cap) {
      cap.style.opacity = String(F.caption);
      cap.style.transform = `translate3d(0, ${(18 * (1 - F.caption)).toFixed(2)}px, 0)`;
      cap.style.visibility = F.caption < 0.01 ? "hidden" : "visible";
    }
    for (let i = 0; i < 2; i++) {
      const wrap = wrapRefs[i].current;
      const card = cardRefs[i].current;
      if (!wrap || !card) continue;
      const y = F.cardY[i];
      card.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      const bottom = y + L.card.h;
      const line = L.clipY + Math.max(0, L.clipY - bottom) * 2.4;
      wrap.style.clipPath = `inset(-400px -400px ${Math.max(0, L.h - line).toFixed(1)}px -400px)`;
      wrap.style.visibility = y > L.clipY + 4 ? "hidden" : "visible";
      const scan = scanRefs[i].current;
      if (scan) {
        const on = F.scan && F.scan.card === i;
        scan.style.opacity = on ? "1" : "0";
        if (on) scan.style.transform = `translate3d(0, calc(${(F.scan!.p * L.card.h).toFixed(1)}px - 50%), 0)`;
      }
    }
    if (fadeRef.current) fadeRef.current.style.opacity = String(F.fade);
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = !reduced && inView && tabVisible && visualReady;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const step = (t: number) => {
      engine.tick(t);
      writeDom();
      if (!glFailed) renderRef.current?.(t);
      else if (handsCanvasRef.current) FallbackHands.draw(handsCanvasRef.current, engine);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, engine, writeDom, glFailed]);

  // reduced motion: one still frame with the hands already up
  useEffect(() => {
    if (!reduced || !visualReady) return;
    const t = performance.now();
    engine.tick(t);
    writeDom();
    if (!glFailed) renderRef.current?.(t + 1);
    else if (handsCanvasRef.current) FallbackHands.draw(handsCanvasRef.current, engine);
  }, [reduced, visualReady, layout, engine, writeDom, glFailed]);

  const L = layout;
  const sectionH = reduced ? L.h : Math.round((T.end + 1) * L.h);

  return (
    <>
    <section ref={sectionRef} id="top" aria-labelledby="hero-title" className="relative" style={{ height: sectionH }}>
      <div ref={stageRef} className="sticky top-0 h-svh w-full overflow-clip bg-(--lp-peach)">
        {glFailed ? (
          <>
            <FallbackGround layout={L} />
            <canvas ref={handsCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
          </>
        ) : (
          <>
            <FallbackGround layout={L} grid={false} />
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: glReady ? 1 : 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={null}>
                <GroundScene
                  engine={engine}
                  onReady={(render) => {
                    renderRef.current = render;
                    setGlReady(true);
                  }}
                  onFail={() => setGlFailed(true)}
                />
              </Suspense>
            </motion.div>
          </>
        )}

        <span className="sr-only">
          Two hands, one violet and one rose, rise out of a floor of purple blocks. Each hand makes an OK sign around a watching eye.
        </span>

        <div
          ref={copyRef}
          className={`pointer-events-none absolute ${L.wide ? "flex items-center" : ""}`}
          style={
            L.wide
              ? { left: L.copy.x, width: L.copy.w, top: 0, height: L.h, paddingTop: 88, paddingBottom: L.h * 0.06 }
              : { left: L.copy.x, width: L.copy.w, top: Math.max(96, L.h * 0.13) }
          }
        >
          <motion.div
            className="pointer-events-auto relative isolate"
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            {/* the copy may sit over the block floor, so the soft light behind it extends down with it */}
            <div
              aria-hidden
              className="pointer-events-none absolute -z-10"
              style={{
                inset: L.wide ? "-16% -22% -20% -26%" : "-10% -12% -14% -12%",
                background:
                  "radial-gradient(closest-side, rgb(255 249 244 / 0.86), rgb(255 247 241 / 0.6) 48%, rgb(255 246 240 / 0.22) 78%, rgb(255 246 240 / 0) 100%)",
              }}
            />
            <HeroCopy wide={L.wide} />
          </motion.div>
        </div>

        {!reduced && (
          <>
            {[0, 1].map((i) => (
              <div key={i} ref={wrapRefs[i]} className="pointer-events-none absolute inset-0" style={{ visibility: "hidden" }} aria-hidden={i === 0 ? beats.step !== 0 : beats.step !== 1}>
                <div ref={cardRefs[i]} className="absolute top-0" style={{ left: L.card.x, width: L.card.w }} data-look>
                  {i === 0 ? (
                    <Certificate
                      id="panchganga"
                      width={L.card.w}
                      signature={beats.checked >= 1 ? "intact" : "plain"}
                      highlight={{
                        signature: beats.checked >= 1 ? "ok" : undefined,
                        qr: beats.checked >= 2 ? "ok" : undefined,
                        number: beats.checked >= 3 ? "ok" : undefined,
                      }}
                    >
                      <ScanLine refEl={scanRefs[0]} />
                    </Certificate>
                  ) : (
                    <Certificate
                      id="krishna-r3"
                      width={L.card.w}
                      signature={beats.flagged ? "changed" : "plain"}
                      highlight={{ validity: beats.flagged ? "alert" : undefined }}
                    >
                      <ScanLine refEl={scanRefs[1]} />
                    </Certificate>
                  )}
                  {i === 0 && (
                    <AnimatePresence>
                      {beats.confirmed && beats.step === 0 && (
                        <motion.div
                          key="badge"
                          className="absolute inset-x-0 -top-12 flex justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <motion.span
                            initial={{ scale: 0.6, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ type: "spring", stiffness: 380, damping: 20 }}
                            className="inline-flex items-center gap-2 rounded-full bg-(--lp-verified-fg) px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap text-white shadow-[0_8px_20px_-8px_rgb(18_114_58/0.7)]"
                            role="status"
                          >
                            <span className="size-1.5 rounded-full bg-white/80" aria-hidden />3 of 3 checks hold
                          </motion.span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            ))}

            <div
              ref={captionRef}
              className="absolute"
              style={{ left: L.caption.x, top: L.caption.y, width: L.caption.w, visibility: "hidden" }}
            >
              <StoryCaption beats={beats} wide={L.wide} />
            </div>

            <div
              ref={fadeRef}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ opacity: 0, background: "linear-gradient(to bottom, transparent 0%, transparent 30%, var(--lp-canvas) 90%)" }}
            />
          </>
        )}
      </div>
    </section>
    {reduced && <StaticStory />}
    </>
  );
}
