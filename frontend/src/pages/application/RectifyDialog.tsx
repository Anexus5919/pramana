import { useEffect, useId, useMemo, useState } from "react";
import { errorMessage } from "../../api";
import { pluralize } from "../../lib/format";
import { severityRank } from "../../lib/labels";
import type { Finding } from "../../types";
import { Button, Callout, Checkbox, Code, Dialog, Field, PanelDivider, SeverityIndicator, Textarea, useToast } from "../../ui2";
import { isOpenFinding, isRectifiable, useRectification } from "./data";
import { useLetters } from "./officer/officerApi";

function bySeverity(a: Finding, b: Finding) {
  return (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
}

function FindingLabel({ f }: { f: Finding }) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <span className="pt-1">
        <SeverityIndicator severity={f.severity} showLabel={false} />
      </span>
      <span className="min-w-0">
        <span className="block">{f.title}</span>
        <Code className="block text-xs font-normal text-ink-3">{f.code}</Code>
      </span>
    </span>
  );
}

/**
 * Request rectification. Only completeness, compliance and validity findings can be
 * sent; forensic, cross-application and verification findings stay with officials.
 */
export function RectifyDialog({
  appId,
  open,
  onClose,
  findings,
  preselect,
  onDraftLetter,
}: {
  appId: string;
  open: boolean;
  onClose: () => void;
  findings: Finding[];
  preselect?: string[];
  /** Opens the deficiency letter editor for the picked findings, or resumes a saved draft */
  onDraftLetter?: (findingIds: string[], resumeId?: string | null) => void;
}) {
  const toast = useToast();
  const m = useRectification(appId);
  const listId = useId();
  const open_ = useMemo(() => findings.filter(isOpenFinding).sort(bySeverity), [findings]);
  const eligible = useMemo(() => open_.filter(isRectifiable), [open_]);
  const withheld = useMemo(() => open_.filter((f) => !isRectifiable(f)), [open_]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const draft = useLetters(appId, open && !!onDraftLetter).data?.find((l) => l.status === "draft");

  useEffect(() => {
    if (open) {
      const ok = new Set(eligible.map((f) => f.id));
      setPicked(new Set((preselect ?? []).filter((id) => ok.has(id))));
      setMessage("");
      m.reset();
    }
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allPicked = eligible.length > 0 && eligible.every((f) => picked.has(f.id));
  const canSend = picked.size > 0 || message.trim().length > 0;

  const submit = () =>
    m.mutate(
      { findingIds: [...picked], message: message.trim() || null },
      {
        onSuccess: (r) => {
          toast.success(
            "Rectification requested",
            `${r.items.length ? pluralize(r.items.length, "item") : "Your message"} sent to the institution. The application moves to round ${r.round}.`,
          );
          onClose();
        },
      },
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Request rectification"
      description="The institution sees each selected item as a deficiency to correct, in plain words without rule codes, together with your message."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="mr-auto">
            Cancel
          </Button>
          {onDraftLetter && draft && (
            <Button variant="ghost" onClick={() => onDraftLetter([], draft.id)}>
              Resume saved draft
            </Button>
          )}
          {onDraftLetter && (
            <Button variant="secondary" onClick={() => onDraftLetter([...picked])} disabled={!picked.size}>
              Draft deficiency letter
            </Button>
          )}
          <Button variant="primary" onClick={submit} disabled={!canSend} loading={m.isPending}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {m.error && (
          <Callout tone="danger" role="alert" title="The request was not sent">
            {errorMessage(m.error)}
          </Callout>
        )}
        <fieldset className="min-w-0" aria-describedby={withheld.length > 0 ? `${listId}-note` : undefined}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <legend className="text-sm font-medium text-ink">Items to correct</legend>
            {eligible.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPicked(allPicked ? new Set() : new Set(eligible.map((f) => f.id)))}>
                {allPicked ? "Clear all" : "Select all"}
              </Button>
            )}
          </div>
          {eligible.length === 0 ? (
            <p className="text-sm text-ink-3">No open completeness, compliance or validity findings. You can still write a message, or draft a deficiency letter.</p>
          ) : (
            <ul className="max-h-[300px] divide-y divide-line overflow-y-auto border-y border-line">
              {eligible.map((f) => (
                <li key={f.id} className="py-2.5">
                  <Checkbox
                    checked={picked.has(f.id)}
                    onChange={(c) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (c) n.add(f.id);
                        else n.delete(f.id);
                        return n;
                      })
                    }
                    label={<FindingLabel f={f} />}
                  />
                </li>
              ))}
            </ul>
          )}
          {withheld.length > 0 && (
            <>
              <PanelDivider label="Not shared with institutions" />
              <p id={`${listId}-note`} className="mb-2 text-sm text-ink-3">
                Forensic and cross-application indicators stay with officials. Describe what to correct in the message instead.
              </p>
              <ul className="max-h-[180px] divide-y divide-line overflow-y-auto border-y border-line">
                {withheld.map((f) => (
                  <li key={f.id} className="py-2.5">
                    <Checkbox checked={false} disabled onChange={() => undefined} label={<FindingLabel f={f} />} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
        <Field label="Message to the institution" hint="Plain language helps the institution respond in one round. Required when no item is selected.">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Please upload a current Fire NOC issued by the competent authority." />
        </Field>
      </div>
    </Dialog>
  );
}
