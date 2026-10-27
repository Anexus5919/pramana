import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../api";
import { fmtDate, fmtDateTime, fmtRelative, pluralize } from "../../../lib/format";
import { workspacePath } from "../../../shell/nav";
import {
  Button,
  ButtonLink,
  Callout,
  Code,
  DataTable,
  DescriptionList,
  Dialog,
  Drawer,
  ErrorState,
  Field,
  Panel,
  Select,
  SeverityIndicator,
  SimulatedTag,
  Skeleton,
  StatusBadge,
  Textarea,
  Tooltip,
  useToast,
  type Column,
} from "../../../ui2";
import { detectionWords } from "../../../conversation/labels";
import { roundLabel, type Tone } from "../../../lib/labels";
import { useWorkspace } from "../context";
import { useVerifications } from "../data";
import { useRecordOutcome, useRunWatch, useWatch, type ApplicationWatch, type WatchItem } from "./api";

const STATE: Record<string, { tone: Tone; label: string }> = {
  ok: { tone: "verified", label: "Confirmed" },
  revoked: { tone: "mismatch", label: "Revoked" },
  suspended: { tone: "mismatch", label: "Suspended" },
  not_found: { tone: "mismatch", label: "Not in registry" },
  record_changed: { tone: "mismatch", label: "Record differs" },
  expired: { tone: "expired", label: "Expired" },
  source_unavailable: { tone: "unavail", label: "No response" },
};
const CHANGE: Record<string, string> = {
  revoked: "revoked by the issuer",
  suspended: "suspended by the issuer",
  not_found: "no longer found in the issuer registry",
  record_changed: "issuer record now differs from the document",
  expired: "validity ended since the outcome",
  source_unavailable: "issuer registry did not respond",
  restored: "confirmed by the issuer again",
};

export function fmtIn(v: string | null | undefined): string {
  if (!v) return "not scheduled";
  const s = Math.round((new Date(v).getTime() - Date.now()) / 1000);
  if (s <= 60) return "due now";
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} d`;
}

function issuerName(s: string): string {
  return s.replace(/\s*\(SIMULATED\)\s*/i, "");
}

const MIN_REASON = 10;

export function OutcomeDialog({
  open,
  onClose,
  watch,
  reviewPending = 0,
  reviewLink,
}: {
  open: boolean;
  onClose: () => void;
  watch: ApplicationWatch | undefined;
  /** Review requests without a cell reply: the server refuses the outcome until each is answered */
  reviewPending?: number;
  reviewLink?: string;
}) {
  const { app } = useWorkspace();
  const toast = useToast();
  const m = useRecordOutcome(app.id);
  const ver = useVerifications(app.id, open);
  const options = watch?.outcomes ?? [];
  const [outcome, setOutcome] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const watchable = (ver.data ?? []).filter((a) => a.run_id === app.latest_run?.id && a.channel === "issuer_registry" && a.status === "verified").length;

  useEffect(() => {
    if (open) {
      setOutcome("");
      setReason("");
      setTried(false);
      m.reset();
    }
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reasonError = tried && reason.trim().length < MIN_REASON ? `Write a reason of at least ${MIN_REASON} characters.` : undefined;
  const outcomeError = tried && !outcome ? "Choose the outcome the authority decided." : undefined;
  const words = detectionWords(reason);
  const blocked = reviewPending > 0;
  const submit = () => {
    setTried(true);
    if (blocked || !outcome || reason.trim().length < MIN_REASON) return;
    m.mutate(
      { outcome, reason: reason.trim() },
      {
        onSuccess: (w) => {
          toast.success("Scrutiny outcome recorded", `Watching ${pluralize(w.items.length, "certificate")} from the issuer registries (SIMULATED) every ${w.interval_hours} h.`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record scrutiny outcome"
      description="Record the outcome the authority decided, with the reason. Pramana keeps it in the audit trail; it does not approve or reject."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={m.isPending} disabled={blocked}>
            Record outcome
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {blocked ? (
          <Callout
            tone="warning"
            role="status"
            title="Reply to the institution's review request first"
            action={
              reviewLink ? (
                <ButtonLink size="sm" to={reviewLink} onClick={onClose} trailingIcon={<ArrowRight aria-hidden />}>
                  Open the request
                </ButtonLink>
              ) : undefined
            }
          >
            The institution asked the AICTE Scrutiny Cell to look again at {reviewPending === 1 ? "an item" : `${reviewPending} items`}. Reply first; the outcome can be
            recorded after that. Requesting another rectification stays possible.
          </Callout>
        ) : (
          m.error && (
            <Callout tone="danger" role="alert" title="The outcome was not recorded">
              {errorMessage(m.error)}
            </Callout>
          )
        )}
        <Field label="Outcome" required error={outcomeError}>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Choose an outcome</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Reason"
          required
          error={reasonError}
          hint="The institution reads this reason in its portal, and it is kept in the audit trail. Say what was decided and why; do not describe how an indicator was found."
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        {words.length > 0 && (
          <p className="-mt-2 flex items-start gap-1.5 text-xs font-medium text-manual-fg">
            <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>
              This mentions {words.map((w) => `"${w}"`).join(", ")}, which describes how something was found. You can still record it; consider stating the
              deficiency instead.
            </span>
          </p>
        )}
        <p className="text-sm text-ink-3 text-pretty">
          {ver.isPending
            ? "Counting the certificates that issuer registries confirmed on the latest run."
            : `After you record it, the ${pluralize(watchable, "certificate")} confirmed by an issuer registry on the latest run ${watchable === 1 ? "is" : "are"} rechecked every ${watch?.interval_hours ?? 24} h. A revocation, expiry or missing record raises a finding; it never changes the recorded outcome.`}
        </p>
      </div>
    </Dialog>
  );
}

function WatchedDrawer({ open, onClose, items }: { open: boolean; onClose: () => void; items: WatchItem[] }) {
  const columns: Column<WatchItem>[] = [
    {
      id: "label",
      header: "Certificate",
      cell: (i) => (
        <span className="block min-w-0">
          <span className="block text-sm font-medium text-ink">{i.label}</span>
          <Code className="text-xs break-all">{i.ref_no}</Code>
        </span>
      ),
      sortValue: (i) => i.label,
    },
    {
      id: "issuer",
      header: "Issuer",
      cell: (i) => (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
          {issuerName(i.issuer)}
          <SimulatedTag />
        </span>
      ),
    },
    { id: "valid", header: "Valid until", cell: (i) => (i.valid_until ? fmtDate(i.valid_until) : <span className="text-ink-4">Not given</span>) },
    {
      id: "state",
      header: "State",
      cell: (i) => {
        const st = STATE[i.state] ?? { tone: "unchecked" as Tone, label: i.state };
        return (
          <StatusBadge tone={st.tone} title={i.detail ?? undefined}>
            {st.label}
          </StatusBadge>
        );
      },
      sortValue: (i) => i.state,
    },
    {
      id: "checked",
      header: "Last checked",
      cell: (i) => <span title={i.last_checked_at ? fmtDateTime(i.last_checked_at) : undefined}>{i.last_checked_at ? fmtRelative(i.last_checked_at) : "Not yet"}</span>,
    },
    {
      id: "open",
      header: <span className="sr-only">Issuer record</span>,
      cell: (i) => (
        <Link to={`/issuers?code=${encodeURIComponent(i.issuer_code)}&ref=${encodeURIComponent(i.ref_no)}`} className="text-sm whitespace-nowrap text-ink underline-offset-2 hover:underline">
          Open record
        </Link>
      ),
    },
  ];
  return (
    <Drawer open={open} onClose={onClose} width={760} title="Watched certificates" description="Rechecked with the issuer registries on a schedule. The registries are simulated in this prototype.">
      <DataTable rows={items} columns={columns} rowKey={(i) => i.id} label="Watched certificates" density="compact" />
    </Drawer>
  );
}

/** After the decision: the recorded scrutiny outcome and the re-verification watch it started. */
export function WatchCard() {
  const { app } = useWorkspace();
  const toast = useToast();
  const q = useWatch(app.id);
  const run = useRunWatch();
  const [listOpen, setListOpen] = useState(false);
  const w = q.data;

  const runNow = () =>
    run.mutate(undefined, {
      onSuccess: (r) => {
        const mine = r.changes.filter((c) => c.application_id === app.id);
        if (mine.length) toast.info(`Watch found ${pluralize(mine.length, "change")} here`, mine.map((c) => `${c.label}: ${CHANGE[c.change] ?? c.change}`).join(". "));
        else
          toast.success(
            "Watch run complete",
            `${pluralize(r.run.checked, "certificate")} checked across all watched applications${r.changes.length ? `, ${pluralize(r.changes.length, "change")} elsewhere` : ", no changes"}.`,
          );
      },
      onError: (e) => toast.error("The watch did not run", errorMessage(e)),
    });

  return (
    <Panel
      title="After the decision"
      actions={
        w?.outcome ? (
          <Button size="sm" variant="secondary" leadingIcon={<RefreshCw />} loading={run.isPending} onClick={runNow}>
            Run watch now
          </Button>
        ) : undefined
      }
    >
      {q.isPending ? (
        <div role="status">
          <span className="sr-only">Loading the watch</span>
          <Skeleton className="h-24" />
        </div>
      ) : q.error || !w ? (
        <ErrorState compact error={q.error} title="Could not load the watch" onRetry={() => void q.refetch()} />
      ) : !w.outcome ? (
        <p className="text-sm text-ink-2 text-pretty">
          No scrutiny outcome recorded yet. Use Decide to record one; certificates confirmed by issuers are then rechecked every {w.interval_hours} h.
        </p>
      ) : (
        <div className="space-y-5">
          <DescriptionList
            items={[
              { label: "Outcome", value: <span className="font-medium">{w.outcome.label}</span> },
              { label: "Reason", value: w.outcome.reason },
              { label: "Recorded by", value: w.outcome.recorded_by ?? "An official" },
              { label: "Date", value: fmtDateTime(w.outcome.created_at) },
              { label: "Round", value: roundLabel(w.outcome.round) },
              {
                label: "Next check",
                value: w.scheduler_enabled ? (
                  <Tooltip content={w.next_check ? fmtDateTime(w.next_check) : "Not scheduled"}>
                    <span tabIndex={0} className="rounded">
                      {fmtIn(w.next_check)}
                    </span>
                  </Tooltip>
                ) : (
                  "Scheduler off; run on request"
                ),
                hint: w.last_run ? `Last checked ${fmtRelative(w.last_run.finished_at)}` : undefined,
              },
              {
                label: "Watched certificates",
                value: w.items.length ? (
                  <button type="button" onClick={() => setListOpen(true)} className="rounded text-left text-ink underline underline-offset-2 hover:text-ink-2">
                    View {pluralize(w.items.length, "watched certificate")}
                  </button>
                ) : (
                  "None confirmed by an issuer on the run the outcome was recorded against"
                ),
              },
            ]}
          />
          {w.events.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">Events</h3>
              <ul className="divide-y divide-line">
                {w.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <SeverityIndicator severity={e.severity} />
                    <span className={e.change === "restored" ? "min-w-0 flex-1 text-ink-3" : "min-w-0 flex-1 text-ink"}>
                      {e.label}: {CHANGE[e.change] ?? e.change}
                    </span>
                    <span className="text-xs text-ink-3" title={fmtDateTime(e.created_at)}>
                      {fmtRelative(e.created_at)}
                    </span>
                    {e.finding_id && (
                      <Link to={workspacePath(app.id, "findings", { finding: e.finding_id })} className="text-sm text-ink underline-offset-2 hover:underline">
                        Open finding
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <WatchedDrawer open={listOpen} onClose={() => setListOpen(false)} items={w.items} />
        </div>
      )}
    </Panel>
  );
}
