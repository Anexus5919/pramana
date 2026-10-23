import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export type StepStatus = "complete" | "current" | "upcoming" | "attention";

export interface Step {
  id: string;
  label: ReactNode;
  /** Short line under the label: a date, a count, "Action needed" */
  description?: ReactNode;
  status: StepStatus;
}

export interface StepperProps {
  steps: Step[];
  /** Accessible name, e.g. "Application progress" */
  label: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

function Marker({ status, index }: { status: StepStatus; index: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
        status === "complete" && "border-brand-solid bg-brand-solid text-white",
        status === "current" && "border-brand-solid bg-surface text-brand-ink ring-4 ring-brand-soft",
        status === "attention" && "border-manual-dot bg-manual-bg text-manual-fg ring-4 ring-manual-bg",
        status === "upcoming" && "border-line-2 bg-surface text-ink-3",
      )}
    >
      {status === "complete" ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
    </span>
  );
}

const STATUS_TEXT: Record<StepStatus, string> = {
  complete: "completed",
  current: "current step",
  attention: "needs your action",
  upcoming: "not started",
};

/** Linear progress for the institution: where the application is and what comes next. */
export function Stepper({ steps, label, orientation = "horizontal", className }: StepperProps) {
  const vertical = orientation === "vertical";
  return (
    <ol aria-label={label} className={cn(vertical ? "flex flex-col" : "flex w-full items-start", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const current = s.status === "current" || s.status === "attention";
        return (
          <li
            key={s.id}
            aria-current={current ? "step" : undefined}
            className={cn("relative min-w-0", vertical ? "flex gap-3 pb-6 last:pb-0" : "flex flex-1 flex-col gap-2 pr-3 last:flex-none last:pr-0")}
          >
            <div className={cn("flex items-center", vertical ? "flex-col self-stretch" : "w-full")}>
              <Marker status={s.status} index={i} />
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    s.status === "complete" ? "bg-brand-solid" : "bg-line-2",
                    vertical ? "mt-1 w-px flex-1" : "ml-2 h-px flex-1",
                  )}
                />
              )}
            </div>
            <div className={cn("min-w-0", vertical && "pt-0.5")}>
              <div className={cn("text-sm font-medium", s.status === "upcoming" ? "text-ink-3" : "text-ink")}>
                {s.label}
                <span className="sr-only">, {STATUS_TEXT[s.status]}</span>
              </div>
              {s.description && (
                <div className={cn("mt-0.5 text-xs", s.status === "attention" ? "font-medium text-manual-fg" : "text-ink-3")}>
                  {s.description}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
