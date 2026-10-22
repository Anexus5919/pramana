import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ChevronRight, CircleCheck, ListChecks, MessageSquareWarning, Pencil, Send } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, qk } from "../../api";
import { AppStatusBadge, Pill, SeverityChip } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Dialog } from "../../components/ui/Dialog";
import { Callout, EmptyState, ErrorBanner, PageLoading } from "../../components/ui/Feedback";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { categoryMeta, humanize } from "../../lib/labels";
import type { ApplicationDetail, Finding } from "../../types";
import { CitationBlock } from "../application/evidence/Citation";
import { RunProgress } from "../application/StageTimeline";
import { DeclaredDataView } from "../shared/DeclaredDataView";
import { DeclaredForm, type DeclaredDraft, draftErrors, fromDraft, toDraft } from "./DeclaredForm";
import { UploadSlot } from "./UploadSlot";

const EDITABLE = new Set(["draft", "rectification_requested"]);

const STEPS = [
  { key: "draft", label: "Prepare" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under scrutiny" },
];

function Stepper({ status }: { status: string }) {
  const idx = status === "draft" ? 0 : status === "submitted" || status === "validating" || status === "rectified" ? 1 : 2;
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Application progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={clsx(
              "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
              i < idx ? "bg-verified-dot text-white" : i === idx ? "bg-primary text-primary-on" : "bg-subtle text-subtle-fg",
            )}
            aria-current={i === idx ? "step" : undefined}
          >
            {i < idx ? <Check aria-hidden className="size-3" /> : i + 1}
          </span>
          <span className={clsx(i === idx ? "font-semibold text-fg" : "text-muted")}>{s.label}</span>
          {i < STEPS.length - 1 && <ChevronRight aria-hidden className="size-3.5 text-subtle-fg" />}
        </li>
      ))}
    </ol>
  );
}

function DeclaredSection({ app, editable }: { app: ApplicationDetail; editable: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DeclaredDraft>(() => toDraft(app.declared));
  const errors = draftErrors(draft);
  const save = useMutation({
    mutationFn: () => api.updateDeclared(app.id, fromDraft(draft)),
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: qk.application(app.id) });
    },
  });
  return (
    <Card aria-labelledby="inst-declared-title">
      <CardHeader
        id="inst-declared-title"
        title="Declared data"
        subtitle={editable ? "Editable until you submit" : "Locked while the application is with the scrutiny team"}
        actions={
          editable && !editing ? (
            <Button
              size="sm"
              icon={<Pencil className="size-3.5" />}
              onClick={() => {
                setDraft(toDraft(app.declared));
                setEditing(true);
              }}
            >
              Edit
            </Button>
          ) : undefined
        }
      />
      <div className="p-4">
        {editing ? (
          <div className="space-y-4">
            <DeclaredForm value={draft} onChange={setDraft} idPrefix="edit" />
            {errors.length > 0 && (
              <ul role="alert" className="list-disc rounded-md bg-mismatch-bg py-2 pr-3 pl-7 text-sm text-mismatch-fg">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {!!save.error && <ErrorBanner error={save.error} title="Could not save" />}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" loading={save.isPending} disabled={errors.length > 0} onClick={() => save.mutate()}>
                Save declared data
              </Button>
            </div>
          </div>
        ) : (
          <DeclaredDataView declared={app.declared ?? {}} />
        )}
      </div>
    </Card>
  );
}

function Deficiencies({ findings }: { findings: Finding[] }) {
  if (!findings.length) {
    return (
      <EmptyState icon={<CircleCheck className="size-6" />} title="No deficiencies listed" className="py-8">
        The automated checks found no deficiencies to report to you. The scrutiny team may still contact you.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {findings.map((f) => (
        <li key={f.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityChip severity={f.severity} />
            <span className="text-xs text-muted">{categoryMeta[f.category]?.label ?? humanize(f.category)}</span>
            {f.review_status === "evidence_requested" && <Pill tone="manual">Included in a rectification request</Pill>}
          </div>
          <p className="mt-1.5 text-sm font-medium text-fg">{f.title}</p>
          <p className="mt-0.5 text-sm text-muted">{f.message}</p>
          {f.rule?.citation && (
            <div className="mt-2">
              <CitationBlock citation={f.rule.citation} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function InstitutionApplicationPage() {
  const { appId = "" } = useParams();
  const qc = useQueryClient();
  const appQ = useQuery({ queryKey: qk.application(appId), queryFn: () => api.application(appId) });
  const app = appQ.data;
  const submitted = !!app && app.status !== "draft";
  const findingsQ = useQuery({ queryKey: qk.findings(appId), queryFn: () => api.findings(appId), enabled: submitted });
  const [confirm, setConfirm] = useState(false);
  const submit = useMutation({
    mutationFn: () => api.submit(appId),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ["application", appId] });
      void qc.invalidateQueries({ queryKey: qk.applications });
    },
  });

  if (appQ.isPending) return <PageLoading label="Loading application" />;
  if (appQ.error || !app) {
    const notFound = appQ.error instanceof ApiError && appQ.error.status === 404;
    return notFound ? (
      <EmptyState title="Application not found" action={<ButtonLink to="/portal" variant="primary">Back to my applications</ButtonLink>} />
    ) : (
      <ErrorBanner error={appQ.error} title="Could not load the application" />
    );
  }

  const editable = EDITABLE.has(app.status);
  const missingRequired = app.document_checklist.filter((s) => s.required && !s.uploaded);
  const openRect = app.rectifications.find((r) => r.status === "open");
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.application(app.id) });

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-surface p-5 shadow-xs">
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-subtle-fg">
          <Link to="/portal" className="hover:text-fg hover:underline">
            My applications
          </Link>
          <ChevronRight aria-hidden className="size-3" />
          <span className="font-mono" aria-current="page">
            {app.id}
          </span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">{app.category_label}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{app.institution.name}</span>
              <span>AY {app.academic_year}</span>
              <AppStatusBadge status={app.status} />
              <span className="text-xs">Round {app.round}</span>
              {app.submitted_at && <span className="text-xs">Submitted {fmtDate(app.submitted_at)}</span>}
            </div>
          </div>
          {editable && (
            <Button variant="primary" icon={<Send className="size-4" />} onClick={() => setConfirm(true)} disabled={submit.isPending}>
              {app.status === "rectification_requested" ? "Resubmit" : "Submit application"}
            </Button>
          )}
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <Stepper status={app.status} />
        </div>
      </div>

      {submit.isPending && <RunProgress title="Submitting and running the automated checks" />}
      {!!submit.error && <ErrorBanner error={submit.error} title="Submission failed" />}
      {submit.isSuccess && (
        <Callout tone="info" title="Submitted">
          Your application is with the scrutiny team. Any deficiencies found by the automated checks are listed below.
        </Callout>
      )}

      {openRect && (
        <Card aria-labelledby="rect-open-title" className="border-manual-dot/50">
          <CardHeader
            id="rect-open-title"
            icon={<MessageSquareWarning className="size-4 text-manual-fg" />}
            title="Rectification requested"
            subtitle={`Raised ${fmtDateTime(openRect.created_at)} for round ${openRect.round}. Correct these items, then resubmit.`}
          />
          <div className="space-y-3 p-4">
            {openRect.message && <p className="rounded-md bg-manual-bg px-3 py-2 text-sm text-manual-fg">{openRect.message}</p>}
            <ul className="space-y-2">
              {openRect.items.map((it) => (
                <li key={it.finding_id} className="rounded-md border border-line p-2.5">
                  <p className="text-sm font-medium text-fg">{it.title}</p>
                  <p className="text-xs text-muted">{it.message}</p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card aria-labelledby="docs-title">
          <CardHeader
            id="docs-title"
            icon={<ListChecks className="size-4" />}
            title="Document checklist"
            subtitle={
              missingRequired.length
                ? `${missingRequired.length} required ${missingRequired.length === 1 ? "document is" : "documents are"} still missing`
                : "All required documents uploaded"
            }
          />
          <ul className="space-y-3 p-4">
            {app.document_checklist.map((s) => (
              <UploadSlot
                key={s.doc_type}
                appId={app.id}
                slot={s}
                docs={app.documents.filter((d) => d.declared_type === s.doc_type)}
                editable={editable}
                onUploaded={refresh}
              />
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <DeclaredSection key={`${app.id}-${app.status}`} app={app} editable={editable} />
          {submitted && (
            <Card aria-labelledby="def-title">
              <CardHeader
                id="def-title"
                title="Deficiencies"
                subtitle="Preliminary results of the automated checks on your latest submission. The scrutiny team reviews each one."
              />
              {findingsQ.isPending ? (
                <div className="p-4 text-sm text-muted">Loading</div>
              ) : findingsQ.error ? (
                <div className="p-4">
                  <ErrorBanner error={findingsQ.error} title="Could not load deficiencies" />
                </div>
              ) : (
                <Deficiencies findings={findingsQ.data ?? []} />
              )}
            </Card>
          )}
          {app.rectifications.length > 0 && (
            <Card aria-labelledby="rect-hist-title">
              <CardHeader id="rect-hist-title" title="Rectification requests" />
              <ul className="divide-y divide-line">
                {app.rectifications.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={r.status === "open" ? "manual" : "verified"}>{r.status === "open" ? "Open" : "Responded"}</Pill>
                      <span className="text-xs text-muted">
                        Round {r.round}, raised {fmtDateTime(r.created_at)}
                        {r.responded_at && `, responded ${fmtDateTime(r.responded_at)}`}
                      </span>
                    </div>
                    {r.message && <p className="mt-1.5 text-sm text-fg">{r.message}</p>}
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-muted">
                      {r.items.map((it) => (
                        <li key={it.finding_id}>{it.title}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={app.status === "rectification_requested" ? "Resubmit application" : "Submit application"}
        description="After submission the documents and declared data are locked and automated checks run immediately."
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirm(false); submit.mutate(); }}>
              Submit now
            </Button>
          </>
        }
      >
        {missingRequired.length > 0 ? (
          <Callout tone="caution" title="Required documents missing">
            {missingRequired.map((s) => s.label).join(", ")}. You can still submit; the missing items will be reported as
            deficiencies.
          </Callout>
        ) : (
          <p className="text-sm text-muted">All required documents are uploaded.</p>
        )}
      </Dialog>
    </div>
  );
}
