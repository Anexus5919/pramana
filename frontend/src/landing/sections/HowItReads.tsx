import { motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Section, SimTag, ease, spring } from "../kit";
import { STAGE_H, STAGE_W, StoryStage } from "./a/StoryStage";

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Intake",
    body: "The file is hashed with SHA-256 the moment it arrives and encrypted at rest. Every later finding cites this exact digest, so nobody can swap the file underneath a decision.",
  },
  {
    title: "Understand",
    body: "OCR and layout analysis find every word box on the page. Fields such as the certificate number and the validity date are lifted out together with the page region they came from.",
  },
  {
    title: "Verify",
    body: (
      <>
        The PDF signature is validated up the chain to the CCA India root, the signed QR is decoded, and the issuer's registry is asked
        whether the certificate exists.{" "}
        <span className="mt-2 flex items-center gap-2 text-[13px] text-(--lp-ink-3)">
          <SimTag /> Issuer registries are simulated in this prototype.
        </span>
      </>
    ),
  },
  {
    title: "Check",
    body: "Each field is tested against the APH rule it answers to, and the rule is cited by annexure and page. A date that disagrees with the issuer is a mismatch, not a guess.",
  },
  {
    title: "Review",
    body: "Pramana raises a finding with its evidence attached. An official accepts or dismisses it, and either way has to say why. Try it on the card.",
  },
];

function useIsDesktop() {
  const [is, setIs] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIs(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return is;
}

const TOP_TRIM = 40;

// Fixed-size stage scaled to the width of its container
function ScaledStage({ step, live }: { step: number; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1.08, el.clientWidth / STAGE_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative w-full" style={{ height: (STAGE_H - TOP_TRIM) * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale}) translateY(-${TOP_TRIM}px)` }}>
        <StoryStage step={step} live={live} />
      </div>
    </div>
  );
}

function Rail({ step, onPick }: { step: number; onPick: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s.title}>
          <button
            type="button"
            onClick={() => onPick(i)}
            aria-current={i === step ? "step" : undefined}
            className="group flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 text-[12px] font-semibold transition-colors"
          >
            <span className="relative grid size-6 place-items-center">
              <span
                className={`absolute inset-0 rounded-[6px] transition-colors duration-300 ${
                  i < step ? "bg-(--lp-voxel-top)" : i === step ? "bg-(--lp-brand-500)" : "bg-(--lp-surface-3) group-hover:bg-(--lp-line-2)"
                }`}
              />
              <span className={`lp-mono relative text-[10px] ${i === step ? "text-white" : "text-(--lp-ink-2)"}`}>{i + 1}</span>
            </span>
            <span className={`hidden xl:inline ${i === step ? "text-(--lp-ink)" : "text-(--lp-ink-3) group-hover:text-(--lp-ink-2)"}`}>{s.title}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function StepText({
  i,
  active,
  onActive,
  register,
}: {
  i: number;
  active: boolean;
  onActive: (i: number) => void;
  register: (i: number, el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const centered = useInView(ref, { margin: "-48% 0px -48% 0px" });
  useEffect(() => {
    if (centered) onActive(i);
  }, [centered, i, onActive]);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        register(i, el);
      }}
      data-story-step={i}
      className="flex min-h-[78vh] items-center"
    >
      <motion.div animate={{ opacity: active || reduced ? 1 : 0.75 }} transition={{ duration: 0.35, ease: ease.out }} className="max-w-md">
        <p className="lp-mono text-[12px] font-semibold text-(--lp-brand-600)">0{i + 1}</p>
        <h3 className="lp-display mt-2 text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-(--lp-ink)">{STEPS[i].title}</h3>
        <div className="mt-4 text-[17px] leading-relaxed text-(--lp-ink-2)">{STEPS[i].body}</div>
      </motion.div>
    </div>
  );
}

function MobileStep({ i }: { i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -25% 0px" });
  return (
    <div ref={ref} className="border-t border-(--lp-line) pt-8">
      <p className="lp-mono text-[12px] font-semibold text-(--lp-brand-600)">0{i + 1}</p>
      <h3 className="lp-display mt-1 text-[28px] leading-tight font-semibold tracking-[-0.03em] text-(--lp-ink)">{STEPS[i].title}</h3>
      <div className="mt-3 text-[16px] leading-relaxed text-(--lp-ink-2)">{STEPS[i].body}</div>
      <div className="mt-6 min-h-[200px]">{seen && <ScaledStage step={i} live />}</div>
    </div>
  );
}

export default function HowItReads() {
  const desktop = useIsDesktop();
  const [step, setStep] = useState(0);
  const els = useRef<(HTMLElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageSeen = useInView(stageRef, { once: true });
  const register = (i: number, el: HTMLElement | null) => {
    els.current[i] = el;
  };
  const pick = (i: number) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    els.current[i]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  };
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="How Pramana reads an application."
      lede="Follow one fire safety certificate through the five stages every document goes through. Scroll, or pick a stage."
    >
      {desktop ? (
        <div className="mt-6 grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12">
          <div>
            {STEPS.map((_, i) => (
              <StepText key={i} i={i} active={i === step} onActive={setStep} register={register} />
            ))}
          </div>
          <div className="relative">
            <div className="sticky top-[12vh] flex h-[80vh] flex-col justify-center" ref={stageRef}>
              <div className="relative rounded-[28px] border border-white/70 bg-[linear-gradient(150deg,#fff3ea_0%,#fdeef5_50%,#f1ebff_100%)] p-6 lp-shadow-md">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <Rail step={step} onPick={pick} />
                  <motion.span
                    key={step}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={spring.snappy}
                    className="lp-eyebrow shrink-0"
                    aria-live="polite"
                  >
                    Stage {step + 1} of 5
                  </motion.span>
                </div>
                <ScaledStage step={step} live={stageSeen} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-12 space-y-14">
          {STEPS.map((_, i) => (
            <MobileStep key={i} i={i} />
          ))}
        </div>
      )}
    </Section>
  );
}
