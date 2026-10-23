import { RefreshCw, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../../api";
import { pluralize } from "../../../lib/format";
import { humanize, stageLabel } from "../../../lib/labels";
import { workspacePath } from "../../../shell/nav";
import { Button, ButtonLink, Callout, Drawer, IconButton, useToast } from "../../../ui2";
import { liveHeadline, LiveRunView } from "./LiveRunView";
import { currentStage } from "./useLiveRun";
import { REASON_LABEL, type useValidation } from "./useValidation";

type Validation = ReturnType<typeof useValidation>;

function completeText(added: number, resolved: number): string {
  return `Run complete: ${pluralize(added, "new finding")}, ${resolved} resolved`;
}

/** One status line under the header while a run is active, then its outcome; the details live in a drawer. */
export function RunCallout({ appId, v }: { appId: string; v: Validation }) {
  const { phase, runId, live, result, error } = v.state;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const toasted = useRef<Set<string>>(new Set());

  const added = result?.added.length ?? 0;
  const resolved = result?.run.resolved_since_previous?.length ?? 0;
  const doneKey = phase === "done" ? (runId ?? result?.run.id ?? null) : null;

  useEffect(() => {
    if (!doneKey || toasted.current.has(doneKey)) return;
    toasted.current.add(doneKey);
    if (live.status === "failed" || live.status === "interrupted") return;
    if (result) toast.success(completeText(added, resolved));
  }, [doneKey, live.status, result, added, resolved, toast]);

  if (phase === "idle") return null;

  const ended = !!runId && (live.status === "failed" || live.status === "interrupted");
  const cachedDocs = live.docs.filter((d) => d.cached).length;
  const progress = (
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
      View progress
    </Button>
  );

  let callout;
  if (phase === "error") {
    callout = (
      <Callout
        tone="danger"
        role="alert"
        title="Validation could not start"
        action={
          <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} onClick={() => void v.start()}>
            Run again
          </Button>
        }
      >
        {errorMessage(error)}
      </Callout>
    );
  } else if (ended) {
    callout = (
      <Callout
        tone="danger"
        role="alert"
        title={live.status === "interrupted" ? "The server stopped during this run" : "The run stopped with an error"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {progress}
            <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} onClick={() => void v.retry(runId!)}>
              Run again
            </Button>
            <IconButton size="sm" label="Dismiss" icon={<X />} onClick={v.dismiss} />
          </div>
        }
      >
        {live.error ?? "No reason was recorded."} The failure is in the audit trail.
      </Callout>
    );
  } else if (phase === "done") {
    callout = (
      <Callout
        tone="success"
        role="status"
        title={result ? completeText(added, resolved) : "Run complete"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {runId && cachedDocs > 0 && (
              <Button size="sm" variant="secondary" leadingIcon={<RefreshCw />} onClick={() => void v.reprocess()}>
                Re-read {pluralize(live.docs.length, "document")}
              </Button>
            )}
            {runId && (
              <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
                Details
              </Button>
            )}
            <ButtonLink size="sm" variant="secondary" to={workspacePath(appId, "findings")}>
              View findings
            </ButtonLink>
            <IconButton size="sm" label="Dismiss" icon={<X />} onClick={v.dismiss} />
          </div>
        }
      >
        {runId && cachedDocs > 0
          ? `${cachedDocs === live.docs.length ? "Every document was" : `${pluralize(cachedDocs, "document")} were`} read in an earlier run, so only the checks ran now.`
          : result
            ? `Ruleset ${result.run.ruleset_id}.`
            : null}
      </Callout>
    );
  } else {
    const stage = currentStage(live);
    const docsDone = live.docs.filter((d) => d.status).length;
    const body =
      phase === "starting"
        ? "Queuing the run."
        : [
            stage ? (stageLabel[stage] ?? humanize(stage)) : liveHeadline(live),
            live.docs.length ? `${docsDone} of ${live.docs.length} documents read` : null,
          ]
            .filter(Boolean)
            .join(", ");
    callout = (
      <Callout tone="info" role="status" title="Validation is running" action={runId ? progress : undefined}>
        {body}
        {live.reason && <span className="text-ink-3"> ({REASON_LABEL[live.reason] ?? humanize(live.reason)})</span>}
      </Callout>
    );
  }

  return (
    <>
      {callout}
      <Drawer
        open={open && !!runId}
        onClose={() => setOpen(false)}
        title="Validation run"
        description={liveHeadline(live)}
        width={560}
      >
        <div className="px-5 py-5">
          <p className="mb-5 text-xs text-ink-3">
            Runs on the server in the background. Updates by {live.transport === "polling" ? "polling" : "live stream"}; nothing here is estimated.
          </p>
          <LiveRunView s={live} />
        </div>
      </Drawer>
    </>
  );
}
