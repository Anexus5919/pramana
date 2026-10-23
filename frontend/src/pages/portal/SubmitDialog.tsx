import { Send } from "lucide-react";
import { errorMessage } from "../../api";
import { pluralize } from "../../lib/format";
import type { ChecklistSlot } from "../../types";
import type { Readiness } from "./readiness/types";
import { Button, Callout, Dialog } from "../../ui2";

/** Confirms a submission or resubmission. Submit stays disabled while a required document is missing. */
export function SubmitDialog({
  open,
  onClose,
  onConfirm,
  resubmit,
  missing,
  required,
  pending,
  error,
  readiness,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resubmit: boolean;
  missing: ChecklistSlot[];
  required: number;
  pending: boolean;
  error: unknown;
  /** The latest readiness check, when one has run */
  readiness?: Readiness | null;
}) {
  const blocked = missing.length > 0;
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      title={resubmit ? "Resubmit" : "Submit for review"}
      description="After you submit, documents and figures are locked unless AICTE asks for corrections."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" leadingIcon={<Send aria-hidden />} loading={pending} disabled={blocked} onClick={onConfirm} data-autofocus>
            {resubmit ? "Resubmit" : "Submit"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {blocked ? (
          <div>
            <p className="text-sm text-ink">
              {pluralize(missing.length, "required document is", "required documents are")} still missing. Upload{" "}
              {missing.length === 1 ? "it" : "them"} first:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
              {missing.map((m) => (
                <li key={m.doc_type}>{m.label}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink">
            All {pluralize(required, "required document is", "required documents are")} uploaded. Pramana then reads them and checks them against
            the handbook; an AICTE officer reviews the result.
          </p>
        )}
        {!blocked && readiness && readiness.counts.fix > 0 && (
          <Callout tone="warning" title={`The readiness check lists ${pluralize(readiness.counts.fix, "item")} to fix`}>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {readiness.groups
                .flatMap((g) => g.items)
                .filter((i) => i.status === "fix")
                .slice(0, 4)
                .map((i) => (
                  <li key={i.id}>{i.title}</li>
                ))}
            </ul>
            <p className="mt-2">
              AICTE is likely to raise {readiness.counts.fix === 1 ? "it" : "them"}. You can {resubmit ? "resubmit" : "submit"} now, or cancel and
              fix {readiness.counts.fix === 1 ? "it" : "them"} first.
            </p>
          </Callout>
        )}
        {!blocked && readiness && readiness.counts.fix === 0 && (
          <p className="text-sm text-ink-3">The readiness check found nothing to fix. AICTE officials still review the application.</p>
        )}
        {error != null && (
          <Callout tone="danger" role="alert" title={resubmit ? "Not resubmitted" : "Not submitted"}>
            {errorMessage(error)}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
