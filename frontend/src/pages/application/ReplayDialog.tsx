import { Loader2 } from "lucide-react";
import { fmtDate } from "../../lib/format";
import type { ReplayResult } from "../../types";
import { Button, Code, DescriptionList, Dialog, Digest, ErrorState, StatusBadge } from "../../ui2";

/** Replays a run under its pinned ruleset and as-of date, then compares the two report digests. */
export function ReplayDialog({
  open,
  onClose,
  pending,
  result,
  error,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  result: ReplayResult | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  const same = !!result?.report_identical;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={result ? `Replay of round ${result.original.round}` : "Replay a run"}
      description="The run is executed again under its pinned ruleset and as-of date. Identical digests mean the same inputs produced the same report."
      footer={
        <Button variant={result ? "primary" : "secondary"} onClick={onClose}>
          Done
        </Button>
      }
    >
      {error ? (
        <ErrorState error={error} title="Replay could not run" onRetry={onRetry} />
      ) : !result ? (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-3">
          <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          {pending ? "Replaying on the server" : "Waiting to start"}
        </p>
      ) : (
        <div className="space-y-5">
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge tone={same ? "verified" : "mismatch"}>{same ? "Reproduced identically" : "Differs"}</StatusBadge>
            <span className="text-sm text-ink-3">
              {same ? "Every character of the replayed digest matches the original." : "The replayed report is not the same as the original."}
            </span>
          </div>
          <DescriptionList
            labelWidth={148}
            items={[
              { label: "Ruleset", value: <Code>{result.original.ruleset_id}</Code> },
              { label: "As of", value: fmtDate(result.original.as_of) },
              { label: "Inputs", value: result.inputs_identical ? "Inputs identical" : "Inputs changed" },
              { label: "Original report", value: <Digest value={result.original.report_digest} label="Original report digest" head={16} tail={12} /> },
              { label: "Replayed report", value: <Digest value={result.replay.report_digest} label="Replayed report digest" head={16} tail={12} /> },
            ]}
          />
          {!same && (
            <p className="text-sm text-ink-3 text-pretty">
              Rules and the as-of date were pinned, so the difference comes from state that can change between runs, such as peer applications in the same year
              or whether an issuer source was available.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
