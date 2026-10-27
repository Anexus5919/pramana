import { useEffect, useRef } from "react";
import { useLang, type T } from "../../i18n";
import { Callout, Stepper, type Step } from "../../ui2";
import { useElapsed } from "../application/live/LiveRunView";
import { RUN_STAGES, useLiveRun, type LiveState } from "../application/live/useLiveRun";

// After reading, these server stages are shown to the applicant as one "checking" step
const CHECK_STAGES = RUN_STAGES.filter((k) => k !== "document_processing");

function steps(s: LiveState, t: T, tn: (n: number, one: string, other: string, vars?: Record<string, string | number>) => string): Step[] {
  const failed = s.status === "failed" || s.status === "interrupted";
  const started = s.status !== "queued";
  const read = !!s.stages.document_processing;
  const checksDone = CHECK_STAGES.filter((k) => s.stages[k]).length;
  const checked = checksDone === CHECK_STAGES.length;
  const complete = s.status === "complete";
  const docsRead = s.docs.filter((d) => d.status).length;
  const at = !started ? 0 : !read ? 1 : !checked ? 2 : 3;
  const status = (i: number): Step["status"] =>
    complete || i < at ? "complete" : failed && i === at ? "attention" : i === at ? "current" : "upcoming";
  return [
    {
      id: "received",
      label: t("Received"),
      description: started ? t("Documents locked for review") : t("Waiting for a free worker"),
      status: status(0),
    },
    {
      id: "read",
      label: t("Reading documents"),
      description: s.docs.length ? tn(s.docs.length, "{read} of {n} document read", "{read} of {n} documents read", { read: docsRead }) : undefined,
      status: status(1),
    },
    {
      id: "check",
      label: t("Checking against the handbook"),
      description: at >= 2 ? t("{done} of {n} check groups done", { done: checksDone, n: CHECK_STAGES.length }) : undefined,
      status: status(2),
    },
    { id: "ready", label: t("Ready for AICTE review"), status: status(3) },
  ];
}

/**
 * Stage-level progress of the automatic check after a submission, driven by the real run events.
 * It shows no checks, findings or forensic detail.
 */
export function SubmissionProgress({ runId, onDone }: { runId: string; onDone?: (status: string) => void }) {
  const s = useLiveRun(runId);
  const { t, tn } = useLang();
  const list = steps(s, t, tn);
  const live = s.status === "queued" || s.status === "running";
  const failed = s.status === "failed" || s.status === "interrupted";
  const elapsed = useElapsed(s.startedAt ?? s.queuedAt, s.finishedAt, live);
  const current = list.find((x) => x.status === "current");

  const reported = useRef(false);
  useEffect(() => {
    if (!s.done || reported.current) return;
    reported.current = true;
    onDone?.(s.status);
  }, [s.done, s.status, onDone]);

  // Screen readers hear the step and a time that changes at most every 5 s, not a ticking clock
  const shown = Math.floor(elapsed / 5) * 5;
  const line =
    s.status === "complete"
      ? t("Checked in {s} s. An AICTE officer reviews the results next; any request for corrections appears on this page.", {
          s: Math.max(1, Math.round(elapsed)),
        })
      : failed
        ? ""
        : [current ? t("{step}.", { step: String(current.label) }) : null, shown > 0 ? t("{s} s so far.", { s: shown }) : null, t("You can leave this page; the check carries on.")]
            .filter(Boolean)
            .join(" ");

  return (
    <div className="space-y-4">
      <Stepper orientation="vertical" label={t("Automatic check progress")} steps={list} />
      {failed ? (
        <Callout tone="danger" role="alert" title={t("The check stopped")}>
          {t("Nothing is lost; AICTE staff can restart it.")}
        </Callout>
      ) : (
        <p role="status" className="text-sm text-ink-3">
          {line}
        </p>
      )}
    </div>
  );
}
