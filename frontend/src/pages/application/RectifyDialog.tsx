import { useEffect, useMemo, useState } from "react";
import { pluralize } from "../../lib/format";
import { severityRank } from "../../lib/labels";
import type { Finding } from "../../types";
import { SeverityMeter } from "../../ui/Blocks";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Checkbox, Field, Textarea } from "../../ui/Field";
import { ErrorState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { useRectification } from "./data";

const OPEN = new Set(["open", "acknowledged", "accepted", "evidence_requested", "escalated"]);

export function RectifyDialog({
  appId,
  open,
  onClose,
  findings,
  preselect,
}: {
  appId: string;
  open: boolean;
  onClose: () => void;
  findings: Finding[];
  preselect?: string[];
}) {
  const toast = useToast();
  const m = useRectification(appId);
  const candidates = useMemo(
    () => findings.filter((f) => OPEN.has(f.review_status)).sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)),
    [findings],
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) {
      setPicked(new Set(preselect ?? []));
      setMessage("");
      m.reset();
    }
    // reset only when the dialog opens
  }, [open]);

  const submit = () =>
    m.mutate(
      { findingIds: [...picked], message: message.trim() || null },
      {
        onSuccess: (r) => {
          toast.success("Rectification requested", `${pluralize(r.items.length, "item")} sent to the institution. The application moves to round ${r.round}.`);
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
      description="The institution sees each selected finding as a deficiency to correct, with your message. Selected findings move to evidence requested."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!picked.size} loading={m.isPending}>
            Send {picked.size ? pluralize(picked.size, "item") : "request"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {m.error && <ErrorState compact error={m.error} title="The request was not sent" />}
        <fieldset>
          <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-ink-2">
            <span>Findings to include</span>
            <button
              type="button"
              className="text-xs font-medium text-brand-ink hover:underline"
              onClick={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map((f) => f.id)))}
            >
              {picked.size === candidates.length ? "Clear all" : "Select all"}
            </button>
          </legend>
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-3">There are no open findings to include.</p>
          ) : (
            <ul className="max-h-[320px] divide-y divide-line overflow-y-auto rounded-[12px] border border-line">
              {candidates.map((f) => (
                <li key={f.id} className="px-3 py-2.5">
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
                    label={
                      <span className="flex items-center gap-2">
                        <SeverityMeter severity={f.severity} />
                        {f.title}
                      </span>
                    }
                    description={<span className="font-mono">{f.code}</span>}
                  />
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <Field label="Message to the institution" hint="Optional. Plain language helps the institution respond in one round.">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Please upload a current Fire NOC issued by the competent authority." />
        </Field>
      </div>
    </Dialog>
  );
}
