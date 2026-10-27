import { useState } from "react";
import { errorMessage } from "../../../../api";
import { verificationMeta } from "../../../../lib/labels";
import type { DocumentDetail } from "../../../../types";
import { Button, Callout, Field, Textarea, useToast, VerificationBadge } from "../../../../ui2";
import { useWorkspace } from "../../context";
import { useOfficerReview } from "../../data";
import { MIN_NOTE } from "./shared";

/**
 * For a document no issuing body can confirm: say so plainly, and let an officer or verifier record that they
 * examined it. The review reads "Reviewed by officer", never verified.
 */
export function OfficerReview({ doc, status }: { doc: DocumentDetail; status: string }) {
  const { app, role } = useWorkspace();
  const toast = useToast();
  const m = useOfficerReview(app.id);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const short = note.trim().length < MIN_NOTE;
  const canReview = role === "officer" || role === "verifier";

  if (status !== "not_checked" || doc.superseded) return null;

  return (
    <section aria-labelledby="officer-review-title" className="space-y-3 border-b border-line px-5 py-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="officer-review-title" className="text-sm font-medium text-ink">
            Officer review
          </h3>
          <VerificationBadge status="not_checked" />
        </div>
        <p className="text-sm text-ink-3 text-pretty">{verificationMeta.not_checked.meaning}</p>
      </div>
      {canReview ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (short) return;
            m.mutate(
              { docId: doc.id, note: note.trim() },
              {
                onSuccess: () => {
                  toast.success("Review recorded: Reviewed by officer", "It is not a confirmation from an issuing body. Your note is in the audit trail.");
                  setNote("");
                  setTouched(false);
                },
              },
            );
          }}
        >
          <Field
            label="What you examined"
            required
            hint="Recorded as Reviewed by officer, never as verified."
            error={touched && short ? `Write at least ${MIN_NOTE} characters.` : undefined}
          >
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: matched the amount and UTR number against the bank statement"
              invalid={touched && short}
            />
          </Field>
          {m.error && (
            <Callout tone="danger" role="alert">
              {errorMessage(m.error)}
            </Callout>
          )}
          <div className="flex justify-end">
            <Button variant="primary" type="submit" loading={m.isPending}>
              Record review
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-ink-3">A scrutiny officer or the verification cell can record a review of this document.</p>
      )}
    </section>
  );
}
