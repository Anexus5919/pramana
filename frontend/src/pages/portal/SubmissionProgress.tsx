import { useEffect, useRef } from "react";
import { pluralize } from "../../lib/format";
import { Callout, Stepper, type Step } from "../../ui2";
import { useElapsed } from "../application/live/LiveRunView";
import { RUN_STAGES, useLiveRun, type LiveState } from "../application/live/useLiveRun";

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
  const status = (i: number): Step["status"] =>
    complete || i < at ? "complete" : failed && i === at ? "attention" : i === at ? "current" : "upcoming";
  return [
    { id: "received", label: "Received", description: started ? "Documents locked for review" : "Waiting for a free worker", status: status(0) },
    {
      id: "read",
      label: "Reading documents",
      description: s.docs.length ? `${docsRead} of ${pluralize(s.docs.length, "document")} read` : undefined,
      status: status(1),
    },
    {
      id: "check",
      label: "Checking against the handbook",
      description: at >= 2 ? `${checksDone} of ${CHECK_STAGES.length} check groups done` : undefined,
      status: status(2),
    },
    { id: "ready", label: "Ready for AICTE review", status: status(3) },
  ];
}

/**
 * Stage-level progress of the automatic check after a submission, driven by the real run events.
 * It shows no checks, findings or forensic detail.
 */
export function SubmissionProgress({ runId, onDone }: { runId: string; onDone?: (status: string) => void }) {
  const s = useLiveRun(runId);
  const list = steps(s);
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
      ? `Checked in ${Math.max(1, Math.round(elapsed))} s. An AICTE officer reviews the results next; any request for corrections appears on this page.`
      : failed
        ? ""
        : `${current ? `${current.label}. ` : ""}${shown > 0 ? `${shown} s so far. ` : ""}You can leave this page; the check carries on.`;

  return (
    <div className="space-y-4">
      <Stepper orientation="vertical" label="Automatic check progress" steps={list} />
      {failed ? (
        <Callout tone="danger" role="alert" title="The check stopped">
          Nothing is lost; AICTE staff can restart it.
        </Callout>
      ) : (
        <p role="status" className="text-sm text-ink-3">
          {line}
        </p>
      )}
    </div>
  );
}
