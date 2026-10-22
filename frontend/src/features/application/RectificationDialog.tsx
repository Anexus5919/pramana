import { useEffect, useMemo, useState } from "react";
import { EvidenceClassBadge, SeverityChip } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Callout, ErrorBanner } from "../../components/ui/Feedback";
import { Label, Textarea } from "../../components/ui/Field";
import { CATEGORIES, categoryMeta, severityRank } from "../../lib/labels";
import type { Finding } from "../../types";
import { useRectification } from "./useWorkspace";

const DEFICIENCY = new Set(["completeness", "compliance", "validity"]);

export function RectificationDialog({
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
  const eligible = useMemo(
    () =>
      findings
        .filter((f) => !["dismissed", "resolved"].includes(f.review_status))
        .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)),
    [findings],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const mut = useRectification(appId);

  useEffect(() => {
    if (open) {
      setSelected(new Set(preselect?.length ? preselect : eligible.filter((f) => DEFICIENCY.has(f.category)).map((f) => f.id)));
      setMessage("");
      mut.reset();
    }
  }, [open]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const groups = CATEGORIES.map((c) => ({ c, items: eligible.filter((f) => f.category === c) })).filter((g) => g.items.length);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Request rectification"
      description="The institution sees the selected items with your message, the application returns to them for correction, and the round number increases."
      footer={
        <>
          <span className="mr-auto text-xs text-muted">{selected.size} selected</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selected.size}
            loading={mut.isPending}
            onClick={() =>
              mut.mutate(
                { findingIds: [...selected], message: message.trim() || null },
                { onSuccess: () => onClose() },
              )
            }
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Callout tone="info">
          Forensic and cross-application indicators are visible to the institution only through the items you select
          here. Select deficiencies the institution can correct.
        </Callout>
        {groups.length === 0 && <p className="text-sm text-muted">There are no open findings to include.</p>}
        {groups.map((g) => (
          <fieldset key={g.c}>
            <legend className="mb-1.5 text-[11px] font-semibold tracking-wider text-subtle-fg uppercase">
              {categoryMeta[g.c]?.label ?? g.c}
            </legend>
            <ul className="divide-y divide-line rounded-md border border-line">
              {g.items.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-subtle/60">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--primary)]"
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <SeverityChip severity={f.severity} />
                        <EvidenceClassBadge evidenceClass={f.evidence_class} />
                        <span className="font-mono text-[11px] text-subtle-fg">{f.code}</span>
                      </span>
                      <span className="mt-1 block text-sm font-medium text-fg">{f.title}</span>
                      <span className="block text-xs text-muted">{f.message}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
        <div>
          <Label htmlFor="rect-message" hint="(optional, shown to the institution)">
            Message
          </Label>
          <Textarea
            id="rect-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="For example: Upload a fire NOC valid for the academic year and correct the built-up area."
          />
        </div>
        {!!mut.error && <ErrorBanner error={mut.error} title="Could not send the request" />}
      </div>
    </Dialog>
  );
}
