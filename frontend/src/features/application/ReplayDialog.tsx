import clsx from "clsx";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Digest } from "../../components/ui/Digest";
import { ErrorBanner } from "../../components/ui/Feedback";
import { fmtDate } from "../../lib/format";
import type { ReplayResult } from "../../types";
import { RunProgress } from "./StageTimeline";

function Row({ label, a, b, same }: { label: string; a: string | null; b: string | null; same: boolean }) {
  return (
    <tr className="border-b border-line last:border-0">
      <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-muted">
        {label}
      </th>
      <td className="py-2 pr-3">
        <Digest value={a} length={16} label={`original ${label}`} />
      </td>
      <td className="py-2 pr-3">
        <Digest value={b} length={16} label={`replay ${label}`} />
      </td>
      <td className="py-2 text-right">
        <span className={clsx("text-xs font-semibold", same ? "text-verified-fg" : "text-mismatch-fg")}>
          {same ? "Identical" : "Differs"}
        </span>
      </td>
    </tr>
  );
}

export function ReplayDialog({
  open,
  onClose,
  pending,
  result,
  error,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  result: ReplayResult | undefined;
  error: unknown;
}) {
  const identical = !!result && result.inputs_identical && result.report_identical;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Replay latest run"
      description="Re-runs the validation under the ruleset pinned by hash and the original as-of date, then compares the input and report digests."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {pending && <RunProgress title="Replaying under the pinned ruleset" />}
      {!!error && <ErrorBanner error={error} title="Replay failed" />}
      {result && (
        <div className="animate-fade-in space-y-4">
          <div
            className={clsx(
              "flex items-start gap-3 rounded-lg border p-4",
              identical
                ? "border-verified-dot/40 bg-verified-bg text-verified-fg"
                : "border-mismatch-dot/40 bg-mismatch-bg text-mismatch-fg",
            )}
          >
            {identical ? <CircleCheck className="mt-0.5 size-5 shrink-0" /> : <CircleAlert className="mt-0.5 size-5 shrink-0" />}
            <div>
              <p className="text-base font-semibold">{identical ? "Reproduced identically" : "Differs"}</p>
              <p className="mt-0.5 text-sm">
                {identical
                  ? "Same inputs and the same report under the pinned ruleset. The result can be reproduced on demand."
                  : !result.inputs_identical
                    ? "The inputs changed since the original run (documents, declared data or reference records), so a different report is expected."
                    : "Inputs are identical but the report differs. This needs investigation before relying on either run."}
              </p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-subtle-fg uppercase">
                <th scope="col" className="py-1.5 font-semibold">Digest</th>
                <th scope="col" className="py-1.5 font-semibold">Original {result.original.id}</th>
                <th scope="col" className="py-1.5 font-semibold">Replay {result.replay.id}</th>
                <th scope="col" className="py-1.5 text-right font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="Input digest"
                a={result.original.input_digest}
                b={result.replay.input_digest}
                same={result.inputs_identical}
              />
              <Row
                label="Report digest"
                a={result.original.report_digest}
                b={result.replay.report_digest}
                same={result.report_identical}
              />
              <Row
                label="Ruleset hash"
                a={result.original.ruleset_hash}
                b={result.replay.ruleset_hash}
                same={result.original.ruleset_hash === result.replay.ruleset_hash}
              />
            </tbody>
          </table>
          <p className="text-xs text-muted">
            Both runs evaluated as of {fmtDate(result.replay.as_of)} with ruleset {result.replay.ruleset_id} and engine{" "}
            {result.replay.engine_version}. The replay is recorded as a separate run and in the audit log.
          </p>
        </div>
      )}
    </Dialog>
  );
}
