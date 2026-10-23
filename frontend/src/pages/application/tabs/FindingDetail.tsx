import { useQuery } from "@tanstack/react-query";
import { Check, CircleSlash, ClipboardList, FileQuestion, Flag, MessageSquarePlus, Siren } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, qk } from "../../../api";
import { fmtDateTime, fmtRelative } from "../../../lib/format";
import { categoryMeta, humanize, reviewActionLabel, reviewStatusMeta } from "../../../lib/labels";
import type { Finding, ReviewAction } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { EvidenceClassChip, SeverityMeter, StatusPill } from "../../../ui/Blocks";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { Textarea } from "../../../ui/Field";
import { dur, ease, spring } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { ErrorState } from "../../../ui/States";
import { useToast } from "../../../ui/Toast";
import { reviewTone } from "../../../ui/tone";
import { useWorkspace } from "../context";
import { useReview } from "../data";
import { TimeMachineLink } from "../history/TimeMachine";
import { CautionNote, CitationCard, EvidenceList, PaneLabel, TraceInputs } from "../parts";

export function ReviewPill({ status }: { status: string }) {
  return <StatusPill status={status} tone={reviewTone(status)} label={reviewStatusMeta[status]?.label ?? humanize(status)} explain={false} />;
}

const ACTIONS: { id: ReviewAction; label: string; icon: ReactNode; needsReason: boolean; tone: "primary" | "secondary" | "ghost" | "danger" | "soft" }[] = [
  { id: "acknowledge", label: "Acknowledge", icon: <Check />, needsReason: false, tone: "soft" },
  { id: "accept", label: "Accept flag", icon: <Flag />, needsReason: true, tone: "ghost" },
  { id: "dismiss", label: "Dismiss", icon: <CircleSlash />, needsReason: true, tone: "ghost" },
  { id: "escalate_inspection", label: "Escalate for inspection", icon: <Siren />, needsReason: true, tone: "ghost" },
  { id: "request_evidence", label: "Request evidence", icon: <FileQuestion />, needsReason: false, tone: "ghost" },
  { id: "note", label: "Add note", icon: <MessageSquarePlus />, needsReason: false, tone: "ghost" },
];

const MIN_REASON = 8;

function ReviewActions({ finding, appId }: { finding: Finding; appId: string }) {
  const toast = useToast();
  const review = useReview(appId);
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setAction(null);
    setNote("");
    setTouched(false);
    review.reset();
  }, [finding.id]);

  useEffect(() => {
    if (action) area.current?.focus();
  }, [action]);

  const needs = action?.needsReason || action?.id === "note";
  const short = needs && note.trim().length < MIN_REASON;

  const submit = (a: (typeof ACTIONS)[number], text: string | null) => {
    const before = finding.review_status;
    review.mutate(
      { findingId: finding.id, action: a.id, note: text },
      {
        onSuccess: (f) => {
          const from = reviewStatusMeta[before]?.label ?? humanize(before);
          const to = reviewStatusMeta[f.review_status]?.label ?? humanize(f.review_status);
          toast.success(
            `${reviewActionLabel[a.id] ?? humanize(a.id)}: ${f.title}`,
            before !== f.review_status ? `Status changed from ${from} to ${to}.` : "Recorded in the finding history and the audit chain.",
          );
          setAction(null);
          setNote("");
          setTouched(false);
        },
      },
    );
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Review actions">
        {ACTIONS.map((a) => {
          const on = action?.id === a.id;
          return (
            <Button
              key={a.id}
              size="sm"
              variant={on ? "soft" : a.tone}
              leadingIcon={a.icon}
              aria-pressed={on}
              loading={review.isPending && review.variables?.action === a.id}
              disabled={review.isPending}
              onClick={() => {
                if (!a.needsReason && a.id !== "note" && a.id !== "request_evidence") return submit(a, null);
                setAction(on ? null : a);
              }}
              className={cn(!on && a.tone === "ghost" && "border border-line")}
            >
              {a.label}
            </Button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {action && (
          <motion.form
            key="reason"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: dur.ui, ease: ease.out }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (short) return;
              submit(action, note.trim() || null);
            }}
          >
            <div className="pt-3">
              <label htmlFor={`reason-${finding.id}`} className="mb-1.5 block text-sm font-medium text-ink-2">
                {action.needsReason ? `Reason to ${action.label.toLowerCase()}` : action.id === "note" ? "Note" : "Note to the institution (optional)"}
                {needs && <span className="ml-1 text-xs font-normal text-ink-3">at least {MIN_REASON} characters, shown in the history</span>}
              </label>
              <Textarea
                ref={area}
                id={`reason-${finding.id}`}
                rows={2}
                value={note}
                invalid={touched && short}
                aria-describedby={touched && short ? `reason-err-${finding.id}` : undefined}
                onChange={(e) => setNote(e.target.value)}
                placeholder={action.id === "dismiss" ? "Issuer confirmed the amendment by letter dated 12 Jan." : "Why this decision"}
              />
              {touched && short && (
                <p id={`reason-err-${finding.id}`} className="mt-1.5 text-xs font-medium text-mismatch-fg" role="alert">
                  Give a reason of at least {MIN_REASON} characters.
                </p>
              )}
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAction(null)}>
                  Cancel
                </Button>
                <Button size="sm" type="submit" variant={action.id === "dismiss" ? "danger" : "primary"} loading={review.isPending}>
                  {action.label}
                </Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
      {review.error && <ErrorState className="mt-3" compact error={review.error} title="The review was not recorded" />}
    </div>
  );
}

function History({ findingId }: { findingId: string }) {
  const q = useQuery({ queryKey: qk.history(findingId), queryFn: () => api.findingHistory(findingId) });
  const known = useRef<Set<string> | null>(null);
  const entries = [...(q.data ?? [])].reverse();
  // Entries present at first load render without animation; later ones slide in
  if (q.data && !known.current) known.current = new Set(q.data.map((e) => e.id));
  useEffect(() => {
    known.current = null;
  }, [findingId]);

  if (q.isPending) return <Skeleton className="h-12" />;
  if (q.error) return <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />;
  if (!entries.length) return <p className="text-sm text-ink-3">No review actions yet.</p>;
  return (
    <ol className="relative space-y-0">
      <AnimatePresence initial={false}>
        {entries.map((e) => {
          const fresh = known.current ? !known.current.has(e.id) : false;
          return (
            <motion.li
              key={e.id}
              layout
              initial={fresh ? { opacity: 0, y: -10, backgroundColor: "var(--brand-soft)" } : false}
              animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
              transition={{ ...spring.soft, backgroundColor: { duration: 1.6 } }}
              className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-3 rounded-[10px] px-2 py-2"
            >
              <span aria-hidden className="relative flex justify-center">
                <span className="mt-1.5 size-2.5 rounded-[3px] bg-brand-500" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-ink">{reviewActionLabel[e.action] ?? humanize(e.action)}</span>
                  <span className="text-ink-3">by {e.actor ?? "unknown"}</span>
                  <time className="text-xs text-ink-4" dateTime={e.created_at} title={fmtDateTime(e.created_at)}>
                    {fmtRelative(e.created_at)}
                  </time>
                </div>
                {e.note && <p className="mt-0.5 text-sm break-words text-ink-2">"{e.note}"</p>}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

export function FindingDetail({ finding: f, canReview, onRectify }: { finding: Finding; canReview: boolean; onRectify?: (ids: string[]) => void }) {
  const { app } = useWorkspace();
  const inputs = f.trace?.inputs ?? [];
  const expr = typeof f.trace?.check?.expr === "string" ? f.trace.check.expr : null;
  return (
    <article aria-labelledby={`fd-${f.id}`} className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityMeter severity={f.severity} label size="md" />
          <EvidenceClassChip cls={f.evidence_class} />
          <ReviewPill status={f.review_status} />
          <Tag variant="mono" className="ml-auto">
            {f.code}
          </Tag>
        </div>
        <h3 id={`fd-${f.id}`} className="mt-3 font-display text-xl font-semibold tracking-title text-ink text-balance">
          {f.title}
        </h3>
        <p className="mt-1 text-xs text-ink-3">{categoryMeta[f.category]?.label ?? humanize(f.category)}, outcome {humanize(f.outcome).toLowerCase()}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2 text-pretty">{f.message}</p>
      </header>

      {f.limitation && <CautionNote>{f.limitation}</CautionNote>}

      {f.rule?.citation && (
        <section>
          <PaneLabel>Rule</PaneLabel>
          <CitationCard citation={f.rule.citation} ruleId={f.rule.id} />
        </section>
      )}

      <section>
        <PaneLabel>Evidence ({f.evidence.length})</PaneLabel>
        <EvidenceList evidence={f.evidence} fallbackDocId={f.document_id} />
        <TimeMachineLink finding={f} />
      </section>

      {(inputs.length > 0 || (f.trace?.missing?.length ?? 0) > 0) && (
        <section>
          <PaneLabel aside={expr ? <code className="truncate rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{expr}</code> : undefined}>
            Trace inputs
          </PaneLabel>
          <TraceInputs inputs={inputs} missing={f.trace?.missing} />
        </section>
      )}

      {canReview && (
        <section className="rounded-card border border-line bg-surface-2/50 p-3.5">
          <PaneLabel
            aside={
              onRectify ? (
                <button type="button" onClick={() => onRectify([f.id])} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
                  <ClipboardList aria-hidden className="size-3.5" /> Include in a rectification request
                </button>
              ) : undefined
            }
          >
            Review
          </PaneLabel>
          <ReviewActions finding={f} appId={app.id} />
        </section>
      )}

      <section>
        <PaneLabel>History</PaneLabel>
        <History findingId={f.id} />
      </section>
    </article>
  );
}
