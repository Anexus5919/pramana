import { Send } from "lucide-react";
import { errorMessage } from "../../api";
import { useLang } from "../../i18n";
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
  const { t, tn } = useLang();
  const blocked = missing.length > 0;
  const fix = readiness?.counts.fix ?? 0;
  const raise = resubmit
    ? tn(fix, "AICTE is likely to raise it. You can resubmit now, or cancel and fix it first.", "AICTE is likely to raise them. You can resubmit now, or cancel and fix them first.")
    : tn(fix, "AICTE is likely to raise it. You can submit now, or cancel and fix it first.", "AICTE is likely to raise them. You can submit now, or cancel and fix them first.");
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      title={resubmit ? t("Resubmit") : t("Submit for review")}
      description={t("After you submit, documents and figures are locked unless AICTE asks for corrections.")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" leadingIcon={<Send aria-hidden />} loading={pending} disabled={blocked} onClick={onConfirm} data-autofocus>
            {resubmit ? t("Resubmit") : t("Submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {blocked ? (
          <div>
            <p className="text-sm text-ink">
              {tn(missing.length, "{n} required document is still missing. Upload it first:", "{n} required documents are still missing. Upload them first:")}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
              {missing.map((m) => (
                <li key={m.doc_type}>{t(m.label)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink">
            {tn(
              required,
              "All {n} required document is uploaded. Pramana then reads them and checks them against the handbook; an AICTE officer reviews the result.",
              "All {n} required documents are uploaded. Pramana then reads them and checks them against the handbook; an AICTE officer reviews the result.",
            )}
          </p>
        )}
        {!blocked && readiness && readiness.counts.fix > 0 && (
          <Callout tone="warning" title={tn(readiness.counts.fix, "The readiness check lists {n} item to fix", "The readiness check lists {n} items to fix")}>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {readiness.groups
                .flatMap((g) => g.items)
                .filter((i) => i.status === "fix")
                .slice(0, 4)
                .map((i) => (
                  <li key={i.id}>{i.title}</li>
                ))}
            </ul>
            <p className="mt-2">{raise}</p>
          </Callout>
        )}
        {!blocked && readiness && readiness.counts.fix === 0 && (
          <p className="text-sm text-ink-3">{t("The readiness check found nothing to fix. AICTE officials still review the application.")}</p>
        )}
        {error != null && (
          <Callout tone="danger" role="alert" title={resubmit ? t("Not resubmitted") : t("Not submitted")}>
            {errorMessage(error)}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
