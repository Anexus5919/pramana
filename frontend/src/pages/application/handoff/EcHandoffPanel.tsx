import { Download, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../../api";
import { fmtBytes, fmtDate, fmtDateTime, pluralize } from "../../../lib/format";
import {
  Button,
  buttonStyles,
  Callout,
  DescriptionList,
  Dialog,
  Digest,
  Field,
  Input,
  Panel,
  PanelDivider,
  SimulatedTag,
  StatusBadge,
  Textarea,
  useToast,
} from "../../../ui2";
import { useWorkspace } from "../context";
import { useEcReports, usePrepareReport, useRecordForwarding, type EcReport } from "./api";

const DOC_WORDS: Record<string, string> = {
  verified: "verified",
  mismatch_detected: "mismatch detected",
  expired: "expired",
  verification_pending: "pending with the issuer",
  source_unavailable: "source unavailable",
  manual_review_required: "awaiting manual confirmation",
  not_checked: "no outside source",
  officer_reviewed: "reviewed by officer",
};
const GROUPS = ["open", "acknowledged", "resolved", "dismissed"] as const;

function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function findingsLine(r: EcReport): string {
  const parts = GROUPS.filter((g) => r.summary.findings[g]).map((g) => `${r.summary.findings[g]} ${g}`);
  return r.summary.findings_total ? parts.join(", ") : "None on the run";
}

function documentsLine(r: EcReport): string {
  const parts = Object.entries(r.summary.documents).map(([k, n]) => `${n} ${DOC_WORDS[k] ?? k.replace(/_/g, " ")}`);
  return parts.join(", ") || "No documents";
}

function roundsLine(r: EcReport): string {
  const s = r.summary;
  if (!s.correction_rounds) return "No correction round";
  const rounds = pluralize(s.correction_rounds, "correction round");
  if (!s.review_requests) return `${rounds}, no review request`;
  return s.review_requests_answered === s.review_requests
    ? `${rounds}, every review request answered (${s.review_requests_answered} of ${s.review_requests})`
    : `${rounds}, ${s.review_requests_answered} of ${s.review_requests} review requests answered`;
}

function ForwardDialog({ report, open, onClose }: { report: EcReport; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const m = useRecordForwarding(report.application_id);
  const [day, setDay] = useState(localDay());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) {
      setDay(localDay());
      setReference("");
      setNote("");
      setTried(false);
      m.reset();
    }
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const prepared = localDay(new Date(report.prepared_at));
  const dayError = tried && (!day || day > localDay() || day < prepared) ? `Choose a date from ${fmtDate(prepared)} to today.` : undefined;
  const refError = tried && reference.trim().length < 3 ? "Give the reference number the report was forwarded under." : undefined;
  const submit = () => {
    setTried(true);
    if (!day || day > localDay() || day < prepared || reference.trim().length < 3) return;
    m.mutate(
      { reportId: report.id, forwarded_on: day, reference: reference.trim(), note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success("Forwarding recorded", `Report version ${report.version} is recorded as forwarded to the Executive Committee.`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record forwarding to the Executive Committee"
      description={`Record that you forwarded report version ${report.version}. Pramana does not send it; this keeps the date and reference in the audit trail.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={m.isPending}>
            Record forwarding
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {m.error && (
          <Callout tone="danger" role="alert" title="The forwarding was not recorded">
            {errorMessage(m.error)}
          </Callout>
        )}
        <Field label="Date forwarded" required error={dayError} className="max-w-[220px]">
          <Input type="date" min={prepared} max={localDay()} value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Reference number" required error={refError} hint="The file or diary number the report went under, for example RB/EC/2026-27/0041.">
          <Input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note" hint="Optional. How and to whom it was forwarded.">
          <Textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function Downloads({ report, pack }: { report: EcReport; pack: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a href={report.pdf_url} download className={buttonStyles("secondary", "sm")}>
        <Download aria-hidden /> Report PDF
      </a>
      {pack && (
        <a href={report.pack_url} download className={buttonStyles("secondary", "sm")}>
          <Download aria-hidden /> Evidence pack ({fmtBytes(report.pack.size)})
        </a>
      )}
    </div>
  );
}

/**
 * Where the officer's decision goes next: the report Pramana prepared for AICTE's Executive Committee when the
 * scrutiny outcome was recorded, its digests and downloads, and the forwarding an official records by hand.
 */
export function EcHandoffPanel() {
  const { app, role } = useWorkspace();
  const q = useEcReports(app.id);
  const prepare = usePrepareReport(app.id);
  const toast = useToast();
  const [forwardOpen, setForwardOpen] = useState(false);
  const canForward = role === "officer" || role === "admin";
  const data = q.data;
  const r = data?.latest;
  if (!data || (!r && !data.outcome_without_report)) return null;

  const earlier = data.versions.filter((v) => !v.latest);
  return (
    <Panel
      title="For the Executive Committee"
      description={
        r
          ? `Report version ${r.version}, prepared ${fmtDateTime(r.prepared_at)} when the scrutiny outcome was recorded.`
          : "The scrutiny outcome is recorded; its report is not prepared yet."
      }
      actions={r ? <StatusBadge tone={r.status === "forwarded" ? "verified" : "pending"}>{r.status_label}</StatusBadge> : undefined}
    >
      <p className="mb-4 text-sm text-ink-2 text-pretty">
        AICTE's Executive Committee takes the decision on approval and the Council ratifies it. This report carries the scrutiny stage to them; Pramana decides
        nothing.
      </p>
      {data.outcome_without_report && (
        <Callout
          tone="warning"
          className="mb-4"
          title="The report for the latest outcome was not prepared"
          action={
            role === "officer" ? (
              <Button
                size="sm"
                loading={prepare.isPending}
                onClick={() =>
                  prepare.mutate(undefined, {
                    onSuccess: () => toast.success("Report prepared", "The report for the Executive Committee is ready."),
                    onError: (e) => toast.error("The report was not prepared", errorMessage(e)),
                  })
                }
              >
                Prepare report
              </Button>
            ) : undefined
          }
        >
          Preparing it failed when the outcome was recorded. The outcome stands; prepare the report again.
        </Callout>
      )}
      {r && (
        <>
          <DescriptionList
            labelWidth={148}
            items={[
              {
                label: "Outcome",
                value: <span className="font-medium">{r.outcome.label}</span>,
                hint: `${r.outcome.recorded_by?.name ?? "An official"}, ${fmtDateTime(r.outcome.recorded_at)}, ${r.outcome.round_label}`,
              },
              {
                label: "Findings",
                value: findingsLine(r),
                hint: r.summary.provisions ? `Related to ${pluralize(r.summary.provisions, "provision")}, quoted in the report` : undefined,
              },
              {
                label: "Documents",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {documentsLine(r)}
                    {r.summary.simulated_sources && <SimulatedTag />}
                  </span>
                ),
              },
              { label: "Correction rounds", value: roundsLine(r) },
              { label: "Report SHA-256", value: <Digest value={r.report_sha256} label="Report SHA-256" head={16} tail={10} /> },
              {
                label: "Evidence pack",
                value: <Digest value={r.pack.zip_sha256} label="Evidence pack SHA-256" head={16} tail={10} />,
                hint: `Signed ZIP ${r.pack.pack_id}, built with this report; verifies offline`,
              },
            ]}
          />
          <div className="mt-4">
            <Downloads report={r} pack={canForward} />
          </div>

          <PanelDivider label="Forwarding" />
          {r.forwarding ? (
            <div className="text-sm text-pretty">
              <p className="text-ink">
                Forwarded on {fmtDate(r.forwarding.forwarded_on)} under reference <span className="font-mono">{r.forwarding.reference}</span>.
              </p>
              <p className="mt-0.5 text-ink-3">
                Recorded by {r.forwarding.recorded_by ?? "an official"}, {fmtDateTime(r.forwarding.recorded_at)}.{" "}
                {r.forwarding.sent_by_pramana ? "Sent by Pramana's portal connector." : "Forwarded by an official; Pramana did not send it."}
              </p>
              {r.forwarding.note && <p className="mt-2 text-ink-2">{r.forwarding.note}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm text-ink-2 text-pretty">
                Not forwarded yet. Pramana does not send the report: the AICTE portal has no connection for it. Forward it, then record the date and
                reference here.
              </p>
              {canForward && (
                <Button className="shrink-0" leadingIcon={<Send aria-hidden />} onClick={() => setForwardOpen(true)}>
                  Record forwarding
                </Button>
              )}
            </div>
          )}

          {earlier.length > 0 && (
            <>
              <PanelDivider label="Earlier versions" />
              <ul className="divide-y divide-line">
                {earlier.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
                    <span className="font-medium text-ink">Version {v.version}</span>
                    <span className="min-w-0 flex-1 text-ink-2">
                      {v.outcome.label}, prepared {fmtDate(v.prepared_at)}.{" "}
                      {v.forwarding ? `Forwarded on ${fmtDate(v.forwarding.forwarded_on)}.` : "Not forwarded."} Replaced by version{" "}
                      {v.superseded_by_version}.
                    </span>
                    <a href={v.pdf_url} download className="text-sm whitespace-nowrap text-ink underline-offset-2 hover:underline">
                      Report PDF
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          {canForward && <ForwardDialog report={r} open={forwardOpen} onClose={() => setForwardOpen(false)} />}
        </>
      )}
    </Panel>
  );
}
