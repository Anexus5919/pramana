import clsx from "clsx";
import { Ban, Check, Flag, Gavel, Inbox, MessageSquarePlus, Send } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { ErrorBanner } from "../../../components/ui/Feedback";
import { Label, Textarea } from "../../../components/ui/Field";
import type { Finding, ReviewAction } from "../../../types";
import { useReview } from "../useWorkspace";

const ACTIONS: { action: ReviewAction; label: string; icon: ReactNode; reason: "required" | "optional"; hint: string }[] = [
  {
    action: "acknowledge",
    label: "Acknowledge",
    icon: <Check className="size-3.5" />,
    reason: "optional",
    hint: "Seen and noted; no decision yet.",
  },
  {
    action: "accept",
    label: "Accept flag",
    icon: <Flag className="size-3.5" />,
    reason: "required",
    hint: "The indicator is valid and should be acted upon. Record why.",
  },
  {
    action: "dismiss",
    label: "Dismiss",
    icon: <Ban className="size-3.5" />,
    reason: "required",
    hint: "The indicator does not hold. Record the reason; it carries over to later runs.",
  },
  {
    action: "escalate_inspection",
    label: "Escalate for inspection",
    icon: <Gavel className="size-3.5" />,
    reason: "required",
    hint: "Needs physical or expert inspection. Record what should be checked.",
  },
  {
    action: "request_evidence",
    label: "Request evidence",
    icon: <Inbox className="size-3.5" />,
    reason: "optional",
    hint: "Ask for supporting evidence. Use Request rectification to send it to the institution.",
  },
  {
    action: "note",
    label: "Add note",
    icon: <MessageSquarePlus className="size-3.5" />,
    reason: "required",
    hint: "Internal note on this finding; does not change its status.",
  },
];

export function ReviewPanel({
  appId,
  finding,
  onRectify,
}: {
  appId: string;
  finding: Finding;
  onRectify?: () => void;
}) {
  const [active, setActive] = useState<ReviewAction | null>(null);
  const [note, setNote] = useState("");
  const review = useReview(appId);
  const spec = ACTIONS.find((a) => a.action === active);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    review.mutate(
      { findingId: finding.id, action: active, note: note.trim() || null },
      {
        onSuccess: () => {
          setActive(null);
          setNote("");
        },
      },
    );
  }

  const needsReason = spec?.reason === "required";

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Review actions">
        {ACTIONS.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={active === a.action ? "subtle" : "secondary"}
            icon={a.icon}
            aria-pressed={active === a.action}
            aria-expanded={active === a.action}
            onClick={() => {
              setActive(active === a.action ? null : a.action);
              review.reset();
            }}
            className={clsx(a.action === "dismiss" && active !== a.action && "text-muted")}
          >
            {a.label}
          </Button>
        ))}
        {onRectify && (
          <Button size="sm" variant="ghost" icon={<Send className="size-3.5" />} onClick={onRectify}>
            Include in rectification
          </Button>
        )}
      </div>
      {spec && (
        <form onSubmit={submit} className="mt-3 animate-fade-in rounded-md border border-line bg-subtle/50 p-3">
          <Label htmlFor="review-note" required={needsReason} hint={needsReason ? "(required)" : "(optional)"}>
            {spec.action === "note" ? "Note" : `Reason for ${spec.label.toLowerCase()}`}
          </Label>
          <Textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={needsReason && !note.trim() && review.isError ? true : undefined}
            autoFocus
          />
          <p className="mt-1 text-xs text-subtle-fg">{spec.hint}</p>
          {!!review.error && <ErrorBanner error={review.error} title="Could not record the review" className="mt-2" />}
          <div className="mt-2.5 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={review.isPending} disabled={needsReason && !note.trim()}>
              Record {spec.label.toLowerCase()}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
