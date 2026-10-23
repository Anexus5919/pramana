import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, ClipboardList, Pencil, Quote, Send, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, qk } from "../../api";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { appStatusMeta, categoryMeta } from "../../lib/labels";
import type { ApplicationDetail, DocumentSummary, Finding } from "../../types";
import { Badge, Tag } from "../../ui/Badge";
import { SeverityMeter, StatusPill } from "../../ui/Blocks";
import { BlockLoader, Button } from "../../ui/Button";
import { SectionCard } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { Dialog } from "../../ui/Dialog";
import { PageHeader } from "../../ui/Layout";
import { dur, ease, fadeUp, stagger } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { appStatusTone } from "../../ui/tone";
import { DeclaredView, NumbersEditor, ProgrammesEditor } from "./DeclaredEditor";
import { fieldErrors, fromDraft, programmeErrors, toDraft, type DeclaredDraft } from "./declared";
import { StatusStepper } from "./StatusStepper";
import { SubmissionProgress } from "./SubmissionProgress";
import { UploadSlot } from "./UploadSlot";

const EDITABLE = new Set(["draft", "rectification_requested"]);

function currentDocs(docs: DocumentSummary[]): Map<string, DocumentSummary> {
  const m = new Map<string, DocumentSummary>();
  for (const d of docs) {
    if (d.superseded) continue;
    const prev = m.get(d.declared_type);
    if (!prev || (d.uploaded_at ?? "") > (prev.uploaded_at ?? "")) m.set(d.declared_type, d);
  }
  return m;
}

/** Honest wait indicator: the submit request runs the whole check, so only elapsed time is known. */
function Elapsed() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = window.setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-control bg-brand-soft px-3 py-2.5 text-sm">
      <BlockLoader className="mt-1.5 text-brand-500" />
      <span className="min-w-0 text-ink-2">
        Reading each document and applying the handbook rules. This usually takes under a minute.
        <span className="mt-0.5 block font-mono text-xs text-ink-3 tabular">{secs} s elapsed</span>
      </span>
    </div>
  );
}

function RectificationPanel({ app }: { app: ApplicationDetail }) {
  const open = app.rectifications.filter((r) => r.status === "open");
  if (!open.length) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      aria-labelledby="rect-title"
      className="rounded-panel border border-manual-dot/35 bg-manual-bg p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-manual-dot" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="rect-title" className="font-display text-lg font-semibold tracking-title text-ink">
            What AICTE asked you to fix
          </h2>
          {open.map((r) => (
            <div key={r.id} className="mt-3">
              <p className="text-xs text-ink-3">
                Round {r.round}, requested {fmtDateTime(r.created_at)}
              </p>
              {r.message && <p className="mt-2 rounded-control bg-surface/70 px-3 py-2 text-sm text-ink-2 text-pretty">{r.message}</p>}
              <ol className="mt-3 space-y-2">
                {r.items.map((it, i) => (
                  <li key={it.finding_id} className="flex gap-3 rounded-control border border-line bg-surface px-3 py-2.5">
                    <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-manual-dot/15 font-mono text-[11px] font-semibold text-manual-fg">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{it.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-2 text-pretty">{it.message}</span>
                      <span className="mt-1 block font-mono text-[11px] text-ink-3">{it.code}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <p className="mt-3 text-xs text-ink-3">Upload corrected documents or fix the declared figures below, then resubmit.</p>
        </div>
      </div>
    </motion.section>
  );
}

function Readiness({ app, docs }: { app: ApplicationDetail; docs: Map<string, DocumentSummary> }) {
  const req = app.document_checklist.filter((s) => s.required);
  const done = req.filter((s) => docs.has(s.doc_type) || s.uploaded).length;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">Required documents</span>
        <span className="font-mono text-sm text-ink-2 tabular">
          {done}/{req.length}
        </span>
      </div>
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(req.length, 1)}, minmax(0, 1fr))` }}>
        {req.map((s) => {
          const ok = docs.has(s.doc_type) || s.uploaded;
          return (
            <a
              key={s.doc_type}
              href={`#slot-${s.doc_type}`}
              title={`${s.label}: ${ok ? "uploaded" : "missing"}`}
              aria-label={`${s.label}: ${ok ? "uploaded" : "missing"}`}
              className={cn(
                "relative block h-3 overflow-hidden rounded-[3px] transition-colors duration-300",
                ok ? "bg-verified-dot" : "border border-dashed border-line-2 bg-transparent hover:border-brand-400",
              )}
            >
              {ok && <span className="absolute inset-x-0 top-0 h-[2px] bg-white/40" />}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function SubmitCard({
  app,
  docs,
  onSubmit,
}: {
  app: ApplicationDetail;
  docs: Map<string, DocumentSummary>;
  onSubmit: () => void;
}) {
  const missing = app.document_checklist.filter((s) => s.required && !(docs.has(s.doc_type) || s.uploaded));
  const resubmit = app.status === "rectification_requested";
  return (
    <SectionCard eyebrow={resubmit ? "Resubmission" : "Submission"} title={resubmit ? "Resubmit to AICTE" : "Submit to AICTE"}>
      <Readiness app={app} docs={docs} />
      <AnimatePresence initial={false} mode="wait">
        {missing.length > 0 ? (
          <motion.p key="miss" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-xs text-ink-3 text-pretty">
            {missing.length} still missing. Select a block to jump to its slot. You can submit without them, but each missing document is recorded as a gap.
          </motion.p>
        ) : (
          <motion.p key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-xs font-medium text-verified-fg">
            Every required document is uploaded.
          </motion.p>
        )}
      </AnimatePresence>
      <Button className="mt-4 w-full" leadingIcon={<Send />} onClick={onSubmit}>
        {resubmit ? "Resubmit application" : "Submit application"}
      </Button>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-4">After submitting, documents and figures are locked unless AICTE requests a rectification.</p>
    </SectionCard>
  );
}

function RunCard({ app }: { app: ApplicationDetail }) {
  const run = app.latest_run;
  if (!run) return null;
  const secs =
    run.started_at && run.finished_at ? (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000 : null;
  return (
    <SectionCard eyebrow="Automatic check" title={run.status === "complete" ? "Checked against the handbook rules" : run.status === "failed" ? "The automatic check did not finish" : "Automatic check running"}>
      <dl className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Status</dt>
          <dd>
            <StatusPill
              status={run.status}
              tone={run.status === "complete" ? "verified" : run.status === "failed" ? "mismatch" : "pending"}
              label={run.status === "complete" ? "Complete" : run.status === "failed" ? "Failed" : "Running"}
              explain={false}
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Round</dt>
          <dd className="font-medium text-ink tabular">{run.round}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-ink-3">Finished</dt>
          <dd className="text-right text-ink">
            {fmtDateTime(run.finished_at)}
            {secs !== null && secs >= 0 && <span className="block text-xs text-ink-3">took {secs.toFixed(1)} s</span>}
          </dd>
        </div>
        {run.as_of && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">Rules applied as of</dt>
            <dd className="font-medium text-ink tabular">{run.as_of}</dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-ink-3">Ruleset</dt>
          <dd className="font-mono text-xs break-all text-ink-2">{run.ruleset_id}</dd>
        </div>
      </dl>
      <p className="mt-4 flex gap-2 rounded-control bg-surface-2 px-3 py-2 text-xs text-ink-3 text-pretty">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden />
        An AICTE officer reviews the results. If something needs fixing, the request appears at the top of this page.
      </p>
    </SectionCard>
  );
}

function Deficiencies({ appId, enabled }: { appId: string; enabled: boolean }) {
  const q = useQuery({ queryKey: qk.findings(appId), queryFn: () => api.findings(appId), enabled });
  if (!enabled) return null;
  if (q.isPending) return <Skeleton className="h-24" rounded="lg" />;
  if (q.error) return <ErrorState error={q.error} title="Could not load the items for your attention" compact />;
  const list: Finding[] = q.data ?? [];
  return (
    <SectionCard
      eyebrow="Shared with you"
      title="Items for your attention"
      description="Gaps that AICTE has shared with the institution. Each one cites the handbook clause it comes from."
      flush
    >
      {list.length === 0 ? (
        <EmptyState compact title="Nothing to address" description="No items have been shared with your institution for this application." />
      ) : (
        <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="divide-y divide-line">
          {list.map((f) => {
            const c = f.rule?.citation;
            return (
              <motion.li key={f.id} variants={fadeUp} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityMeter severity={f.severity} label />
                  <Badge variant="outline">{categoryMeta[f.category]?.label ?? f.category}</Badge>
                  <span className="font-mono text-[11px] text-ink-4">{f.code}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink">{f.title}</h3>
                <p className="mt-0.5 text-sm text-ink-2 text-pretty">{f.message}</p>
                {c?.quote && (
                  <blockquote className="mt-3 flex gap-2 border-l-2 border-brand-300 pl-3">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-brand-400" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink-2 italic text-pretty">{c.quote}</span>
                      <span className="mt-1 block text-xs text-ink-3">
                        {c.doc_title ?? c.doc}
                        {c.section ? `, ${c.section}` : ""}
                        {c.page ? `, page ${c.page}` : ""}
                      </span>
                    </span>
                  </blockquote>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </SectionCard>
  );
}

function DeclaredSection({ app, editable }: { app: ApplicationDetail; editable: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<DeclaredDraft | null>(null);
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: (d: DeclaredDraft) => api.updateDeclared(app.id, fromDraft(d)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.application(app.id) });
      setDraft(null);
      setTried(false);
      toast.success("Declared data saved", "The new figures are used when the application is submitted.");
    },
  });
  const edit: Dispatch<SetStateAction<DeclaredDraft>> = (u) => setDraft((d) => (d ? (typeof u === "function" ? u(d) : u) : d));
  const errs = draft ? { ...programmeErrors(draft), ...fieldErrors(draft) } : {};
  const hasErr = Object.keys(errs).length > 0;
  return (
    <SectionCard
      id="declared"
      eyebrow="What you declared"
      title="Programmes and figures"
      actions={
        editable && !draft ? (
          <Button size="sm" variant="ghost" leadingIcon={<Pencil />} onClick={() => setDraft(toDraft(app.declared))}>
            Edit
          </Button>
        ) : null
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {draft ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui }} className="space-y-6">
            <ProgrammesEditor draft={draft} setDraft={edit} errors={tried ? errs : {}} />
            <NumbersEditor draft={draft} setDraft={edit} errors={tried ? errs : {}} />
            {save.error && <ErrorState error={save.error} title="Not saved" compact />}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button
                loading={save.isPending}
                onClick={() => {
                  setTried(true);
                  if (!hasErr) save.mutate(draft);
                }}
              >
                Save changes
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui }}>
            <DeclaredView declared={app.declared} />
          </motion.div>
        )}
      </AnimatePresence>
    </SectionCard>
  );
}

export default function InstitutionApplicationPage() {
  const { appId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const q = useQuery({ queryKey: qk.application(appId), queryFn: () => api.application(appId), enabled: !!appId });
  // A check still running after a reload is followed again from its saved progress
  const active = useQuery({ queryKey: qk.activeRun(appId), queryFn: () => api.activeRun(appId), enabled: !!appId });
  useEffect(() => {
    if (active.data?.run && !liveRun) setLiveRun(active.data.run.id);
  }, [active.data, liveRun]);
  const checkDone = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.application(appId) });
    void qc.invalidateQueries({ queryKey: qk.applications });
    void qc.invalidateQueries({ queryKey: qk.findings(appId) });
  }, [qc, appId]);
  const app = q.data;
  const docs = useMemo(() => currentDocs(app?.documents ?? []), [app?.documents]);

  const submit = useMutation({
    mutationFn: () => api.submit(appId),
    onSuccess: async (res) => {
      setConfirm(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.application(appId) }),
        qc.invalidateQueries({ queryKey: qk.applications }),
      ]);
      const r = res.run;
      if (r?.background) setLiveRun(r.id);
      toast.success(
        "Submitted to AICTE",
        r?.background
          ? "The automatic check is running. Its progress shows on this page."
          : r?.status === "complete"
            ? `The automatic check finished for round ${r.round}. An officer reviews it next.`
            : "The automatic check has been recorded.",
      );
    },
  });

  if (q.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28" rounded="lg" />
        <Skeleton className="h-96" rounded="lg" />
      </div>
    );
  if (q.error || !app)
    return (
      <div className="mx-auto max-w-xl py-10">
        <ErrorState
          error={q.error}
          title={q.error instanceof ApiError && q.error.status === 404 ? "This application was not found" : "Could not load the application"}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      </div>
    );

  const editable = EDITABLE.has(app.status);
  const missing = app.document_checklist.filter((s) => s.required && !(docs.has(s.doc_type) || s.uploaded));
  const slots = [...app.document_checklist].sort((a, b) => Number(b.required) - Number(a.required));
  const sharesFindings = !!app.latest_run;

  return (
    <div>
      <Link to="/portal" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> My applications
      </Link>
      <PageHeader
        eyebrow={app.institution.name}
        title={app.category_label}
        meta={
          <>
            <StatusPill status={app.status} tone={appStatusTone(app.status)} label={appStatusMeta[app.status]?.label} explain={false} size="md" />
            <Tag variant="mono">{app.id}</Tag>
            <span className="text-xs text-ink-3">
              Academic year <span className="font-medium text-ink-2 tabular">{app.academic_year}</span>
            </span>
            <span className="text-xs text-ink-3">
              Round <span className="font-medium text-ink-2 tabular">{app.round}</span>
            </span>
            {app.submitted_at && <span className="text-xs text-ink-3">Submitted {fmtDate(app.submitted_at)}</span>}
          </>
        }
      />

      <div className="mb-6 rounded-panel border border-line bg-surface/80 px-4 pt-5 pb-4 shadow-xs sm:px-6">
        <StatusStepper status={app.status} />
      </div>

      <div className="space-y-6">
        <RectificationPanel app={app} />
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <SectionCard
              eyebrow="Documents"
              title="Document checklist"
              description={
                <>
                  {editable ? "Drop a PDF, JPG or PNG onto a card or choose a file. A new upload replaces the earlier file for that slot." : "Documents are locked while AICTE reviews the application."}
                  {app.checklist_source && typeof app.checklist_source === "object" && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-ink-4">
                      <ClipboardList className="size-3.5" aria-hidden /> Checklist from {String(app.checklist_source.doc ?? "")} {String(app.checklist_source.section ?? "")}
                      {app.checklist_source.page ? `, page ${String(app.checklist_source.page)}` : ""}
                    </span>
                  )}
                </>
              }
            >
              <ul className="space-y-3">
                {slots.map((s, i) => (
                  <UploadSlot key={s.doc_type} appId={app.id} slot={s} doc={docs.get(s.doc_type)} editable={editable} index={i} />
                ))}
              </ul>
            </SectionCard>
            <DeclaredSection app={app} editable={editable} />
            <Deficiencies appId={app.id} enabled={sharesFindings} />
          </div>
          <aside className="order-first min-w-0 space-y-6 xl:sticky xl:top-24 xl:order-none">
            {editable && <SubmitCard app={app} docs={docs} onSubmit={() => setConfirm(true)} />}
            {liveRun && <SubmissionProgress runId={liveRun} onDone={checkDone} />}
            {!liveRun && <RunCard app={app} />}
            {!editable && !app.latest_run && !liveRun && (
              <SectionCard eyebrow="Automatic check" title="Not run yet">
                <p className="text-sm text-ink-3">The check runs when the application is submitted.</p>
              </SectionCard>
            )}
          </aside>
        </div>
      </div>

      <Dialog
        open={confirm}
        onClose={() => !submit.isPending && setConfirm(false)}
        title={app.status === "rectification_requested" ? "Resubmit this application?" : "Submit this application to AICTE?"}
        description="Documents and declared figures are locked after submission. Pramana then checks them against the active handbook rules."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button leadingIcon={<Send />} loading={submit.isPending} onClick={() => submit.mutate()} data-autofocus>
              {submit.isPending ? "Submitting and checking" : "Submit"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Readiness app={app} docs={docs} />
          {missing.length > 0 ? (
            <div role="alert" className="rounded-control border border-manual-dot/35 bg-manual-bg px-3 py-2.5 text-sm">
              <div className="font-semibold text-manual-fg">
                {missing.length} required {missing.length === 1 ? "document is" : "documents are"} missing
              </div>
              <ul className="mt-1 list-disc pl-5 text-ink-2">
                {missing.map((m) => (
                  <li key={m.doc_type}>{m.label}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-ink-3">Each one will be recorded as a completeness gap for the reviewing officer.</p>
            </div>
          ) : (
            <p className="text-sm text-verified-fg">Every required document is uploaded.</p>
          )}
          {submit.isPending && <Elapsed />}
          {submit.error && <ErrorState error={submit.error} title="Not submitted" compact />}
        </div>
      </Dialog>
    </div>
  );
}
