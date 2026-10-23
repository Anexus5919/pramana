import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { pluralize } from "../../lib/format";
import { SectionCard } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";
import { useElapsed } from "../application/live/LiveRunView";
import { RUN_STAGES, useLiveRun, type LiveState } from "../application/live/useLiveRun";

type StepState = "done" | "current" | "failed" | "pending";

interface Step {
  key: string;
  label: string;
  detail: string;
  state: StepState;
}

// After reading, these server stages are shown to the applicant as one "checking" step
const CHECK_STAGES = RUN_STAGES.filter((k) => k !== "document_processing");

function steps(s: LiveState): Step[] {
  const failed = s.status === "failed" || s.status === "interrupted";
  const started = s.status !== "queued";
  const read = !!s.stages.document_processing;
  const checksDone = CHECK_STAGES.filter((k) => s.stages[k]).length;
  const checked = checksDone === CHECK_STAGES.length;
  const complete = s.status === "complete";
  const docsRead = s.docs.filter((d) => d.status).length;
  const at = !started ? 0 : !read ? 1 : !checked ? 2 : 3;
  const state = (i: number): StepState => (i < at || complete ? "done" : failed && i === at ? "failed" : i === at ? "current" : "pending");
  return [
    { key: "received", label: "Received", detail: started ? "Documents locked for review" : "Waiting for a free worker", state: state(0) },
    {
      key: "read",
      label: "Reading documents",
      detail: s.docs.length ? `${docsRead} of ${pluralize(s.docs.length, "document")} read` : "Text and scans",
      state: state(1),
    },
    {
      key: "check",
      label: "Checking against the handbook",
      detail: checksDone ? `${checksDone} of ${CHECK_STAGES.length} check groups done` : "Rules, issuers and records",
      state: state(2),
    },
    { key: "ready", label: "Ready for AICTE review", detail: complete ? "An officer reviews the results" : "Next", state: state(3) },
  ];
}

function Block({ state }: { state: StepState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-[6px] transition-colors duration-300",
        state === "done" && "bg-brand-500 text-white",
        state === "current" && "bg-brand-200",
        state === "failed" && "bg-mismatch-dot text-white",
        state === "pending" && "border border-dashed border-line-2 bg-transparent",
      )}
    >
      {(state === "done" || state === "failed") && <span className="absolute inset-x-0 top-0 h-[2px] bg-white/40" />}
      {state === "current" && <span className="absolute inset-0 shimmer-bg animate-shimmer" />}
      <AnimatePresence initial={false}>
        {state === "done" && (
          <motion.span key="ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: dur.ui, ease: ease.out }}>
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
        )}
        {state === "failed" && (
          <motion.span key="x" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: dur.ui, ease: ease.out }}>
            <X className="size-3.5" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Stage-level progress of the automatic check after submission. It shows no checks, findings or forensic detail. */
export function SubmissionProgress({ runId, onDone }: { runId: string; onDone?: (status: string) => void }) {
  const s = useLiveRun(runId);
  const list = steps(s);
  const live = s.status === "queued" || s.status === "running";
  const failed = s.status === "failed" || s.status === "interrupted";
  const elapsed = useElapsed(s.startedAt ?? s.queuedAt, s.finishedAt, live);
  const current = list.find((x) => x.state === "current");

  const reported = useRef(false);
  useEffect(() => {
    if (!s.done || reported.current) return;
    reported.current = true;
    onDone?.(s.status);
  }, [s.done, s.status, onDone]);

  return (
    <SectionCard
      eyebrow="Automatic check"
      title={s.status === "complete" ? "Checked against the handbook rules" : failed ? "The automatic check did not finish" : "Checking your application"}
      description={
        failed
          ? "Nothing is lost. AICTE staff can see this and start the check again; you do not need to resubmit."
          : s.status === "complete"
            ? `Finished in ${elapsed.toFixed(1)} s. An AICTE officer reviews the results.`
            : "This runs on AICTE's server. You can leave this page; the result appears here when it is ready."
      }
    >
      <p className="sr-only" aria-live="polite">
        {current ? `${current.label}: ${current.detail}` : s.status === "complete" ? "Automatic check complete" : failed ? "Automatic check did not finish" : ""}
      </p>
      <ol className="relative space-y-3" aria-label="Automatic check progress">
        {list.map((x, i) => (
          <li key={x.key} className="relative flex items-start gap-3" aria-current={x.state === "current" ? "step" : undefined}>
            {i < list.length - 1 && (
              <span aria-hidden className={cn("absolute top-7 bottom-[-10px] left-[11px] w-[2px] rounded-full", x.state === "done" ? "bg-brand-400" : "bg-line")} />
            )}
            <Block state={x.state} />
            <span className="min-w-0 pt-0.5">
              <span className={cn("block text-sm", x.state === "pending" ? "text-ink-4" : x.state === "failed" ? "font-semibold text-mismatch-fg" : "font-medium text-ink")}>
                {x.label}
              </span>
              <span className="block text-xs text-ink-3 tabular">{x.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      {live && (
        <p className="mt-4 font-mono text-xs text-ink-3 tabular" aria-hidden>
          {elapsed.toFixed(1)} s elapsed
        </p>
      )}
    </SectionCard>
  );
}
