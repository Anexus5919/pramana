import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, qk } from "../../api";
import { useOutcomeView } from "../../conversation/api";
import { useDateFormat, useT } from "../../i18n";
import { roundLabel } from "../../lib/labels";
import type { ApplicationDetail, DocumentSummary, Finding } from "../../types";
import {
  ApplicationStatusBadge,
  Button,
  ButtonLink,
  Callout,
  Code,
  EmptyState,
  ErrorState,
  MetaList,
  Page,
  PageHeader,
  Panel,
  PanelDivider,
  Skeleton,
  Stepper,
  useToast,
} from "../../ui2";
import { useLetters } from "../application/officer/officerApi";
import { DeclaredFigures, INTAKE_HELP, NumbersEditor, ProgrammesEditor, ProgrammesTable, declaredProgrammes } from "./DeclaredEditor";
import { fieldErrors, fromDraft, programmeErrors, toDraft, type DeclaredDraft } from "./declared";
import { NextStepPanel } from "./NextStep";
import { OutcomePanel } from "./OutcomePanel";
import { EDITABLE, checklistSourceText, currentDocs, latestRectification, missingRequired, openRectification, portalStage, progressSteps } from "./progress";
import { ReadinessPanel } from "./readiness/ReadinessPanel";
import type { Readiness } from "./readiness/types";
import { DeficiencyLetterPanel, itemDocType } from "./RectificationLetter";
import { RunHistoryPanel } from "./RunHistory";
import { SubmitDialog } from "./SubmitDialog";
import { UploadSlot } from "./UploadSlot";

function PageSkeleton() {
  const t = useT();
  return (
    <Page width="narrow" role="status">
      <span className="sr-only">{t("Loading the application")}</span>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="mt-5 h-12" />
      </div>
      <Skeleton className="h-28" rounded="lg" />
      <Skeleton className="h-[480px]" rounded="lg" />
    </Page>
  );
}

function DocumentsPanel({
  app,
  docs,
  editable,
  firstMissing,
  flags,
}: {
  app: ApplicationDetail;
  docs: Map<string, DocumentSummary>;
  editable: boolean;
  firstMissing?: string;
  flags: Map<string, "requested" | "replaced">;
}) {
  const t = useT();
  const slots = [...app.document_checklist].sort((a, b) => Number(b.required) - Number(a.required));
  const source = checklistSourceText(app.checklist_source, t);
  return (
    <Panel
      id="documents"
      title={t("Documents")}
      padding="none"
      description={
        <>
          {editable
            ? t("PDF, JPG or PNG. A new upload replaces the earlier file.")
            : app.status === "closed"
              ? t("This application is closed, so its documents can no longer change.")
              : app.status === "withdrawn"
                ? t("This application is withdrawn, so its documents can no longer change.")
                : t("Documents are locked while AICTE reviews the application.")}
          {source && <span className="mt-1 block text-xs">{source}</span>}
        </>
      }
    >
      <ul className="divide-y divide-line border-t border-line">
        {slots.map((s) => (
          <UploadSlot
            key={s.doc_type}
            appId={app.id}
            slot={s}
            doc={docs.get(s.doc_type)}
            editable={editable}
            emphasis={s.doc_type === firstMissing}
            flag={flags.get(s.doc_type)}
          />
        ))}
      </ul>
    </Panel>
  );
}

/** A request from the readiness check to open the figures for editing and put the keyboard on one field. */
export interface FigureRequest {
  key: string;
  n: number;
}

function DeclaredPanel({
  app,
  editable,
  onEditing,
  request,
}: {
  app: ApplicationDetail;
  editable: boolean;
  onEditing: (on: boolean) => void;
  request?: FigureRequest | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const [draft, setDraftState] = useState<DeclaredDraft | null>(null);
  const [tried, setTried] = useState(false);
  const setDraft = useCallback(
    (d: DeclaredDraft | null) => {
      setDraftState(d);
      onEditing(d !== null);
    },
    [onEditing],
  );
  const save = useMutation({
    mutationFn: (d: DeclaredDraft) => api.updateDeclared(app.id, fromDraft(d)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.application(app.id) });
      setDraft(null);
      setTried(false);
      toast.success(t("Declared figures saved"), t("The readiness check runs again with the new figures."));
    },
  });
  // Editors take a state setter; this one only acts while a draft is open
  const edit = (u: DeclaredDraft | ((d: DeclaredDraft) => DeclaredDraft)) =>
    setDraftState((d) => (d ? (typeof u === "function" ? u(d) : u) : d));
  const errs = draft ? { ...programmeErrors(draft), ...fieldErrors(draft) } : {};
  const hasErr = Object.keys(errs).length > 0;
  const programmes = declaredProgrammes(app.declared);
  // A readiness item asked for a field: open the editor once per request, then focus that field
  const handled = useRef(0);
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    if (!request || request.n === handled.current || !editable) return;
    handled.current = request.n;
    focusKey.current = request.key;
    if (!draft) setDraft(toDraft(app.declared));
  }, [request, editable, draft, setDraft, app.declared]);
  useEffect(() => {
    const key = focusKey.current;
    if (!key || !draft) return;
    focusKey.current = null;
    const el =
      key === "programmes"
        ? document.getElementById("declared")?.querySelector<HTMLInputElement>("input")
        : document.getElementById(`declared-${key}`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  });

  return (
    <Panel
      id="declared"
      title={t("Declared figures")}
      description={draft ? t("Correct what is wrong, then save. Pramana compares these figures with your documents.") : undefined}
      actions={
        editable && !draft ? (
          <Button leadingIcon={<Pencil />} onClick={() => setDraft(toDraft(app.declared))}>
            {t("Edit")}
          </Button>
        ) : undefined
      }
      footer={
        draft ? (
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              onClick={() => {
                setTried(true);
                if (!hasErr) save.mutate(draft);
              }}
            >
              {t("Save changes")}
            </Button>
          </>
        ) : undefined
      }
    >
      {draft ? (
        <>
          <h3 className="text-xs font-medium text-ink-3">{t("Programmes")}</h3>
          <p className="mt-1 mb-4 text-sm text-ink-3 text-pretty">{t(INTAKE_HELP)}</p>
          <ProgrammesEditor draft={draft} setDraft={edit} errors={tried ? errs : {}} />
          <PanelDivider label={t("Figures")} />
          <NumbersEditor draft={draft} setDraft={edit} errors={tried ? errs : {}} />
          {save.error && (
            <Callout tone="danger" role="alert" title={t("Not saved")} className="mt-5">
              {save.error instanceof Error ? save.error.message : String(save.error)}
            </Callout>
          )}
          {tried && hasErr && (
            <p role="alert" className="mt-5 text-sm font-medium text-mismatch-fg">
              {t("Some figures need a fix before you can save. They are marked above.")}
            </p>
          )}
        </>
      ) : (
        <>
          <h3 className="mb-1 text-xs font-medium text-ink-3">{t("Programmes")}</h3>
          <ProgrammesTable programmes={programmes} />
          <PanelDivider label={t("Figures")} />
          <DeclaredFigures declared={app.declared} />
        </>
      )}
    </Panel>
  );
}

/** Findings an AICTE officer asked about that the open request does not already list. Title and message only. */
function AskedAboutPanel({ findings, rectifying }: { findings: Finding[]; rectifying: boolean }) {
  const t = useT();
  if (findings.length === 0) return null;
  return (
    <Panel
      title={t("Items AICTE asked about")}
      description={
        rectifying
          ? t("The reviewing officer also asked about these. Cover them in your corrections.")
          : t("The reviewing officer asked about these. If AICTE needs corrections, the request appears on this page.")
      }
      padding="none"
    >
      <ul className="divide-y divide-line border-t border-line">
        {findings.map((f) => (
          <li key={f.id} className="px-5 py-3">
            <h3 className="text-sm font-medium text-ink">{f.title}</h3>
            <p className="mt-0.5 text-sm text-ink-2 text-pretty">{f.message}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const ASKED_STATUSES = new Set(["rectification_requested", "under_review"]);

/** ?show=letter or ?show=outcome from a notification: scroll to that panel once it is on the page, then drop the flag. */
function useShowParam(ready: boolean) {
  const [sp, setSp] = useSearchParams();
  const show = sp.get("show");
  useEffect(() => {
    if (!show || !ready) return;
    // The panels load their own data; give them a moment to render before looking
    const timer = window.setTimeout(() => {
      const el = document.getElementById(show === "outcome" ? "outcome" : "letter");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      const next = new URLSearchParams(sp);
      next.delete("show");
      setSp(next, { replace: true });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [show, ready, sp, setSp]);
}

export default function InstitutionApplicationPage() {
  const { appId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const date = useDateFormat();
  const [confirm, setConfirm] = useState(false);
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [figure, setFigure] = useState<FigureRequest | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const q = useQuery({ queryKey: qk.application(appId), queryFn: () => api.application(appId), enabled: !!appId });
  // A check still running after a reload is followed again from its saved progress
  const active = useQuery({ queryKey: qk.activeRun(appId), queryFn: () => api.activeRun(appId), enabled: !!appId });
  useEffect(() => {
    if (active.data?.run && !liveRun) setLiveRun(active.data.run.id);
  }, [active.data, liveRun]);

  const app = q.data;
  const rect = app ? openRectification(app) : undefined;
  // After a resubmission the round's conversation stays on the page, read-only for documents
  const convRect = rect ?? (app ? latestRectification(app) : undefined);
  useShowParam(!!app);
  const letters = useLetters(appId, !!rect);
  const askedEnabled = !!app && ASKED_STATUSES.has(app.status);
  const findings = useQuery({ queryKey: qk.findings(appId), queryFn: () => api.findings(appId), enabled: askedEnabled });
  const docs = useMemo(() => currentDocs(app?.documents ?? []), [app?.documents]);
  const outcome = useOutcomeView(appId);

  const runDone = useCallback(
    (status: string) => {
      void qc.invalidateQueries({ queryKey: qk.application(appId) });
      void qc.invalidateQueries({ queryKey: qk.applications });
      if (status === "complete") toast.success(t("Automatic check complete"), t("An AICTE officer reviews your application next."));
    },
    [qc, appId, toast, t],
  );

  const submit = useMutation({
    mutationFn: () => api.submit(appId),
    onSuccess: async (res) => {
      const resubmitted = app?.status === "rectification_requested";
      setConfirm(false);
      if (res.run?.background) setLiveRun(res.run.id);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.application(appId) }), qc.invalidateQueries({ queryKey: qk.applications })]);
      toast.success(
        resubmitted ? t("Resubmitted to AICTE") : t("Submitted to AICTE"),
        res.run?.background
          ? t("The automatic check is running. Its progress shows under Next step.")
          : t("The automatic check has finished. An AICTE officer reviews it next."),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  if (q.isPending) return <PageSkeleton />;
  if (!app) {
    const notFound = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403);
    return (
      <Page width="narrow">
        {notFound ? (
          <EmptyState
            title={t("Application not found")}
            description={t("It may belong to another institution, or the link may be old. Your applications are listed on the Applications page.")}
            action={
              <ButtonLink variant="primary" size="lg" to="/portal">
                {t("Back to applications")}
              </ButtonLink>
            }
          />
        ) : (
          <ErrorState error={q.error} title={t("Could not load the application")} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        )}
      </Page>
    );
  }

  const editable = EDITABLE.has(app.status);
  const missing = missingRequired(app, docs);
  const required = app.document_checklist.filter((s) => s.required).length;
  const stage = portalStage(app, missing.length, !!liveRun);
  const finalLetter = rect ? letters.data?.find((l) => l.rectification_id === rect.id && l.status === "final") : undefined;
  const itemCount = finalLetter ? finalLetter.items.length : (rect?.items.length ?? 0);
  const listed = new Set(rect?.items.map((i) => i.finding_id) ?? []);
  const asked = askedEnabled ? (findings.data ?? []).filter((f) => f.review_status === "evidence_requested" && !listed.has(f.id)) : [];

  // A requested document counts as corrected once a copy newer than the request is uploaded
  const flags = new Map<string, "requested" | "replaced">();
  for (const type of (rect?.items ?? []).map(itemDocType)) {
    if (!type || !rect) continue;
    const d = docs.get(type);
    flags.set(type, d?.uploaded_at && d.uploaded_at > rect.created_at ? "replaced" : "requested");
  }
  const docLabel = (type: string) => {
    const label = app.document_checklist.find((s) => s.doc_type === type)?.label;
    return label && t(label);
  };

  /** Scrolls a checklist row into view and puts the keyboard on its upload button. */
  function showSlot(docType: string) {
    const row = document.getElementById(`slot-${docType}`);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    row?.querySelector<HTMLButtonElement>(`[data-upload="${docType}"]`)?.focus({ preventScroll: true });
  }

  return (
    <Page width="narrow">
      <PageHeader
        back={{ to: "/portal", label: t("Applications") }}
        title={t(app.category_label)}
        status={<ApplicationStatusBadge status={app.status} />}
        context={
          <MetaList
            items={[
              <Code key="id">{app.id}</Code>,
              t("AY {year}", { year: app.academic_year }),
              roundLabel(app.round, t),
              app.submitted_at ? t("Submitted {date}", { date: date(app.submitted_at) }) : null,
            ]}
          />
        }
      >
        <Stepper label={t("Application progress")} steps={progressSteps(app, missing.length, t, date)} />
      </PageHeader>

      <NextStepPanel
        app={app}
        stage={stage}
        missing={missing}
        itemCount={itemCount}
        liveRun={liveRun}
        onRunDone={runDone}
        onGoToDocuments={() => missing[0] && showSlot(missing[0].doc_type)}
        onSubmit={() => {
          submit.reset();
          setConfirm(true);
        }}
        editing={editing}
        readinessFix={editable && readiness?.application_id === app.id ? readiness.counts.fix : null}
        outcomeRecorded={!!outcome.data?.outcome}
      />

      {editable && !rect && (
        <ReadinessPanel app={app} onShowDocument={showSlot} onEditFigure={(key) => setFigure((f) => ({ key, n: (f?.n ?? 0) + 1 }))} onResult={setReadiness} />
      )}
      <OutcomePanel appId={app.id} />
      {convRect && <DeficiencyLetterPanel appId={app.id} rect={convRect} docLabel={docLabel} onShowDocument={showSlot} resubmitted={!rect} />}
      {editable && rect && (
        <ReadinessPanel app={app} onShowDocument={showSlot} onEditFigure={(key) => setFigure((f) => ({ key, n: (f?.n ?? 0) + 1 }))} onResult={setReadiness} />
      )}
      <AskedAboutPanel findings={asked} rectifying={!!rect} />

      <DocumentsPanel app={app} docs={docs} editable={editable} firstMissing={missing[0]?.doc_type} flags={flags} />
      <DeclaredPanel app={app} editable={editable} onEditing={setEditing} request={figure} />
      <RunHistoryPanel appId={app.id} />

      <SubmitDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => submit.mutate()}
        resubmit={app.status === "rectification_requested"}
        missing={missing}
        required={required}
        pending={submit.isPending}
        error={submit.error}
        readiness={editable && readiness?.application_id === app.id ? readiness : null}
      />
    </Page>
  );
}
