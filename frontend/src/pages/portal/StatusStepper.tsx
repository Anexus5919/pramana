import { motion } from "motion/react";
import { appStatusMeta } from "../../lib/labels";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";
import { Tooltip } from "../../ui/Tooltip";

export const STEPS = [
  { key: "draft", label: "Draft", hint: "You are preparing the application. Documents and data can still change." },
  { key: "submitted", label: "Submitted", hint: "Sent to AICTE. Pramana checks the documents against the handbook rules." },
  { key: "under_review", label: "Under review", hint: "An AICTE officer is reviewing the application and the automatic checks." },
  { key: "rectification_requested", label: "Rectification requested", hint: "AICTE asked you to fix specific items. Only happens when something needs correcting." },
  { key: "rectified", label: "Rectified", hint: "You responded to the request and resubmitted. AICTE reviews it again." },
] as const;

/** Position of a status on the stepper; validating is part of the submission step. */
export function stepIndex(status: string): number {
  if (status === "validating") return 1;
  const i = STEPS.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

/** The two rectification steps only happen on request, so they read as a side path until reached. */
const OPTIONAL_FROM = 3;

function Block({ state, size }: { state: "done" | "current" | "todo" | "optional"; size: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-[4px] transition-colors duration-300",
        state === "done" && "bg-brand-500",
        state === "current" && "bg-brand-500 ring-4 ring-brand-400/25",
        state === "todo" && "bg-surface-3",
        state === "optional" && "border border-dashed border-line-2 bg-transparent",
      )}
      style={{ width: size, height: size }}
    >
      {(state === "done" || state === "current") && <span className="absolute inset-x-0 top-0 h-[2px] bg-white/40" />}
    </span>
  );
}

function blockState(i: number, current: number): "done" | "current" | "todo" | "optional" {
  if (i < current) return "done";
  if (i === current) return "current";
  return i >= OPTIONAL_FROM && current < OPTIONAL_FROM ? "optional" : "todo";
}

/** Small block row for cards; the tooltip names the current step. */
export function CompactStepper({ status, className }: { status: string; className?: string }) {
  const current = stepIndex(status);
  const label = appStatusMeta[status]?.label ?? STEPS[current].label;
  return (
    <Tooltip content={<span><b className="font-semibold">{label}.</b> {STEPS[current].hint}</span>}>
      <span
        tabIndex={0}
        role="img"
        aria-label={`Step ${current + 1} of ${STEPS.length}: ${label}`}
        className={cn("inline-flex items-center", className)}
      >
        {STEPS.map((s, i) => (
          <span key={s.key} className="flex items-center">
            {i > 0 && (
              <span
                className={cn(
                  "mx-[3px] block h-px w-2.5",
                  i <= current ? "bg-brand-400" : i >= OPTIONAL_FROM && current < OPTIONAL_FROM ? "border-t border-dashed border-line-2" : "bg-line-2",
                )}
              />
            )}
            <Block state={blockState(i, current)} size={9} />
          </span>
        ))}
      </span>
    </Tooltip>
  );
}

/** Labelled stepper for the application page: connectors draw up to the current step on first view. */
export function StatusStepper({ status, className }: { status: string; className?: string }) {
  const current = stepIndex(status);
  return (
    <ol className={cn("grid grid-cols-5", className)} aria-label="Application progress">
      {STEPS.map((s, i) => {
        const state = blockState(i, current);
        const reached = i <= current;
        const nextOptional = i + 1 >= OPTIONAL_FROM && current < OPTIONAL_FROM;
        return (
          <li key={s.key} className="relative flex min-w-0 flex-col items-center px-1 text-center" aria-current={i === current ? "step" : undefined}>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="absolute top-[9px] right-[calc(-50%+14px)] left-[calc(50%+14px)] h-[2px]">
                <span className={cn("absolute inset-0", nextOptional ? "border-t-2 border-dashed border-line-2" : "rounded-full bg-line")} />
                {i < current && (
                  <motion.span
                    className="absolute inset-0 origin-left rounded-full bg-brand-500"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.15 + i * 0.12, duration: dur.panel, ease: ease.out }}
                  />
                )}
              </span>
            )}
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12, duration: dur.ui, ease: ease.out }}
            >
              <Block state={state} size={20} />
            </motion.span>
            <Tooltip content={s.hint}>
              <span
                tabIndex={0}
                className={cn(
                  "mt-2.5 block max-w-full text-xs leading-snug text-balance",
                  i === current ? "font-semibold text-ink" : reached ? "font-medium text-ink-2" : "text-ink-4",
                )}
              >
                {s.label}
              </span>
            </Tooltip>
            {i === current && <span className="sr-only">current step</span>}
          </li>
        );
      })}
    </ol>
  );
}
