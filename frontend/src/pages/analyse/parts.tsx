import { motion, useReducedMotion } from "motion/react";
import { createContext, useContext, type ReactNode } from "react";
import { fmtMs } from "../../lib/format";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";
import type { AnalyseStep } from "./analyseApi";
import { STEP_LABEL } from "./summary";

/** The section the overview last sent the reader to; it pulses once on arrival. */
export const FlashContext = createContext<{ id: string; n: number } | null>(null);

export function Section({
  id,
  title,
  eyebrow,
  aside,
  description,
  children,
  className,
  bare = false,
}: {
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  aside?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No card chrome, for sections whose content is already a set of cards */
  bare?: boolean;
}) {
  const flash = useContext(FlashContext);
  const reduce = useReducedMotion();
  const lit = flash?.id === id;
  return (
    <motion.section
      id={`an-${id}`}
      aria-labelledby={`an-${id}-title`}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className={cn("relative min-w-0 scroll-mt-24", bare ? "rounded-panel" : "rounded-card border border-line bg-surface p-5 shadow-sm", className)}
    >
      {lit && !reduce && (
        <motion.span
          key={flash.n}
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-[inherit] ring-2 ring-brand-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 0.35, duration: 1.1, ease: ease.out, times: [0, 0.2, 1] }}
        />
      )}
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h2 id={`an-${id}-title`} className="font-display text-md font-semibold tracking-title text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-3 text-pretty">{description}</p>}
        </div>
        {aside && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{aside}</div>}
      </header>
      {children}
    </motion.section>
  );
}

export const actionCls =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

export function Quiet({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-[10px] border border-dashed border-line px-3 py-2.5 text-sm text-ink-3 text-pretty", className)}>{children}</p>;
}

/** Where the server's time went, one block per stage, widths proportional to the measured milliseconds. */
export function StepTimeline({ steps }: { steps: AnalyseStep[] }) {
  const reduce = useReducedMotion();
  const total = steps.reduce((s, x) => s + x.ms, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full gap-[3px] overflow-hidden" role="img" aria-label={`Server time by stage: ${steps.map((s) => `${STEP_LABEL[s.step] ?? s.step} ${fmtMs(s.ms)}`).join(", ")}`}>
        {steps.map((s, i) => (
          <motion.span
            key={`${s.step}-${i}`}
            aria-hidden
            initial={{ scaleX: reduce ? 1 : 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: reduce ? 0 : 0.1 + i * 0.05, duration: dur.panel, ease: ease.out }}
            style={{ flexGrow: Math.max(s.ms, total * 0.012), flexBasis: 0, transformOrigin: "left" }}
            className={cn("h-full min-w-[3px] rounded-[3px]", i % 2 ? "bg-brand-300" : "bg-brand-500")}
          />
        ))}
      </div>
      <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
        {steps.map((s, i) => (
          <li key={`${s.step}-${i}`} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-[2px]", i % 2 ? "bg-brand-300" : "bg-brand-500")} />
            {STEP_LABEL[s.step] ?? s.step} <span className="tabular text-ink-2">{fmtMs(s.ms)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
