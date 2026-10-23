import { Send } from "lucide-react";
import { errorMessage } from "../../api";
import { pluralize } from "../../lib/format";
import type { ChecklistSlot } from "../../types";
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
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resubmit: boolean;
  missing: ChecklistSlot[];
  required: number;
  pending: boolean;
  error: unknown;
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
        {error != null && (
          <Callout tone="danger" role="alert" title={resubmit ? "Not resubmitted" : "Not submitted"}>
            {errorMessage(error)}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
