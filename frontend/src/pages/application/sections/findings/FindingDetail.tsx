import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, CircleSlash, FileQuestion, FileWarning, Flag, MessageSquarePlus, MessageSquareText, Siren, BadgeCheck } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, qk } from "../../../../api";
import { fmtDateTime, fmtRelative } from "../../../../lib/format";
import { categoryMeta, humanize, reviewActionLabel, reviewStatusMeta } from "../../../../lib/labels";
import { workspacePath } from "../../../../shell/nav";
import type { ChecklistEntry, Finding, ReviewAction } from "../../../../types";
import {
  ActionMenu,
  Button,
  Callout,
  Code,
  Dialog,
  ErrorState,
  EvidenceClassLabel,
  FieldError,
  Label,
  MetaList,
  ReviewBadge,
  RuleOutcomeBadge,
  SeverityIndicator,
  Skeleton,
  Textarea,
  useToast,
  type ActionMenuItem,
} from "../../../../ui2";
import { useWorkspace } from "../../context";
import { isRectifiable, useReview } from "../../data";
import { TimeMachineLink } from "../../history/TimeMachine";
import { CitationCard, EvidenceList, PaneLabel, TraceInputs } from "../../parts";
import { Establish, RelatesTo } from "./RegulatoryBasis";

const MIN_REASON = 10;

interface ActionDef {
  id: ReviewAction;
  /** Button and dialog label */
  label: string;
  icon: ReactNode;
  hint: string;
  danger?: boolean;
}

const ACTIONS: Record<ReviewAction, ActionDef> = {
  acknowledge: { id: "acknowledge", label: "Acknowledge", icon: <Check />, hint: "You have seen this finding and will look into it." },
  request_evidence: { id: "request_evidence", label: "Request evidence", icon: <FileQuestion />, hint: "Ask the institution for evidence on this point." },
  accept: { id: "accept", label: "Accept flag", icon: <Flag />, hint: "You agree the finding stands." },
  escalate_inspection: { id: "escalate_inspection", label: "Escalate for inspection", icon: <Siren />, hint: "Send this point for an on-site or expert inspection." },
  dismiss: { id: "dismiss", label: "Dismiss", icon: <CircleSlash />, hint: "The finding does not hold. Say why.", danger: true },
  resolve: { id: "resolve", label: "Resolve", icon: <BadgeCheck />, hint: "The point has been addressed." },
  note: { id: "note", label: "Add note", icon: <MessageSquarePlus />, hint: "A note for other officials. The status does not change." },
};

/** Small dialog that records one review action with a required reason. */
function ReasonDialog({ finding, action, onClose }: { finding: Finding; action: ActionDef | null; onClose: () => void }) {
  const { app } = useWorkspace();
  const toast = useToast();
  const review = useReview(app.id);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useEffect(() => {
    if (action) {
      setNote("");
      setTouched(false);
      review.reset();
    }
    // reset only when a new action opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const short = note.trim().length < MIN_REASON;
  const submit = () => {
    setTouched(true);
    if (!action || short) return;
    const before = finding.review_status;
    review.mutate(
      { findingId: finding.id, action: action.id, note: note.trim() },
      {
        onSuccess: (f) => {
          const from = reviewStatusMeta[before]?.label ?? humanize(before);
          const to = reviewStatusMeta[f.review_status]?.label ?? humanize(f.review_status);
          toast.success(
            `${reviewActionLabel[action.id] ?? action.label}: ${f.title}`,
            before !== f.review_status ? `Status changed from ${from} to ${to}.` : "Recorded in the finding history and the audit chain.",
          );
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={!!action}
      onClose={onClose}
      size="sm"
      title={action?.label ?? "Review"}
      description={finding.title}
      initialFocus={area}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={action?.danger ? "danger" : "primary"} loading={review.isPending} onClick={submit}>
            {action?.label ?? "Record"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <Label htmlFor={`${id}-reason`} className="mb-1.5">
            Reason
          </Label>
          <Textarea
            ref={area}
            id={`${id}-reason`}
            rows={3}
            value={note}
            invalid={touched && short}
            aria-describedby={`${id}-hint${touched && short ? ` ${id}-err` : ""}`}
            onChange={(e) => setNote(e.target.value)}
          />
          {!(touched && short) && (
            <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-3">
              {action?.hint} At least {MIN_REASON} characters, kept in the finding history and the audit chain.
            </p>
          )}
          <FieldError id={`${id}-err`}>{touched && short ? `Give a reason of at least ${MIN_REASON} characters.` : null}</FieldError>
        </div>
        {review.error && (
          <Callout tone="danger" role="alert" title="The review was not recorded">
            {errorMessage(review.error)}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}

/**
 * Review actions for a finding: Acknowledge, a Review menu, and for officers
 * the rectification and Ask why shortcuts. Every action asks for a reason.
 */
export function FindingActions({ finding: f }: { finding: Finding }) {
  const { role, actions } = useWorkspace();
  const [action, setAction] = useState<ActionDef | null>(null);
  const canReview = role === "officer" || role === "verifier";
  if (!canReview && !actions.ask) return null;
  const menu: ActionMenuItem[] = [
    ...(["request_evidence", "accept", "escalate_inspection", "resolve", "dismiss"] as const).map((k) => ({
      id: k,
      label: ACTIONS[k].label,
      icon: ACTIONS[k].icon,
      danger: ACTIONS[k].danger,
      onSelect: () => setAction(ACTIONS[k]),
    })),
    { id: "note", label: ACTIONS.note.label, icon: ACTIONS.note.icon, onSelect: () => setAction(ACTIONS.note), separated: true },
    {
      id: "rectify",
      label: "Include in a rectification request",
      icon: <FileWarning />,
      onSelect: () => actions.rectify?.([f.id]),
      hidden: !actions.rectify || !isRectifiable(f),
    },
  ];
  return (
    <>
      {actions.ask && (
        <Button variant="ghost" size="sm" className="mr-auto" leadingIcon={<MessageSquareText />} onClick={() => actions.ask?.(`Why was "${f.title}" raised?`)}>
          Ask about this finding
        </Button>
      )}
      {canReview && (
        <>
          <ActionMenu trigger="button" label="Review" size="sm" items={menu} align="end" width={264} />
          <Button size="sm" leadingIcon={<Check />} disabled={f.review_status !== "open"} onClick={() => setAction(ACTIONS.acknowledge)}>
            Acknowledge
          </Button>
          <ReasonDialog finding={f} action={action} onClose={() => setAction(null)} />
        </>
      )}
    </>
  );
}

function History({ findingId }: { findingId: string }) {
  const q = useQuery({ queryKey: qk.history(findingId), queryFn: () => api.findingHistory(findingId) });
  const entries = [...(q.data ?? [])].reverse();
  if (q.isPending)
    return (
      <div role="status">
        <span className="sr-only">Loading the history</span>
        <Skeleton className="h-10" />
      </div>
    );
  if (q.error) return <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />;
  if (!entries.length) return <p className="text-sm text-ink-3">No review actions yet.</p>;
  return (
    <ol className="divide-y divide-line border-y border-line">
      {entries.map((e) => (
        <li key={e.id} className="py-2 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-ink">{reviewActionLabel[e.action] ?? humanize(e.action)}</span>
            <span className="text-ink-3">by {e.actor ?? "unknown"}</span>
            <span className="text-xs text-ink-3" title={fmtDateTime(e.created_at)}>
              {fmtRelative(e.created_at)}
            </span>
          </div>
          {e.note && <p className="mt-0.5 break-words text-ink-2">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function Block({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="min-w-0">
      <PaneLabel aside={aside}>{title}</PaneLabel>
      {children}
    </section>
  );
}

/** Everything one finding rests on: message, rule, evidence, inputs and review history. */
export function FindingDetail({ finding: f, showTitle = true }: { finding: Finding; showTitle?: boolean }) {
  const inputs = f.trace?.inputs ?? [];
  const missing = f.trace?.missing ?? [];
  const expr = typeof f.trace?.check?.expr === "string" ? f.trace.check.expr : null;
  return (
    <article aria-label={showTitle ? undefined : f.title} className="min-w-0 space-y-6">
      <header className="min-w-0">
        {showTitle && (
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-md font-semibold text-ink text-pretty">{f.title}</h2>
            {f.review_status !== "open" && <ReviewBadge status={f.review_status} />}
          </div>
        )}
        {!showTitle && f.review_status !== "open" && <ReviewBadge status={f.review_status} className="mb-2" />}
        <MetaList
          className={showTitle ? "mt-1.5 text-sm text-ink-3" : "text-sm text-ink-3"}
          items={[
            <SeverityIndicator key="sev" severity={f.severity} />,
            <EvidenceClassLabel key="ev" cls={f.evidence_class} className="text-sm" />,
            <Code key="code" className="text-xs">
              {f.code}
            </Code>,
            categoryMeta[f.category]?.label ?? humanize(f.category),
            humanize(f.outcome),
          ]}
        />
        <p className="mt-3 text-sm text-ink-2 text-pretty">{f.message}</p>
      </header>

      {f.limitation && (
        <Callout tone="neutral" title="Limitation">
          {f.limitation}
        </Callout>
      )}

      {f.rule?.citation && (
        <Block title="Rule">
          <CitationCard citation={f.rule.citation} ruleId={f.rule.id} />
        </Block>
      )}

      {f.regulatory_basis && f.regulatory_basis.provisions.length > 0 && (
        <Block title="Relates to">
          <RelatesTo basis={f.regulatory_basis} />
        </Block>
      )}

      <Block title="Evidence">
        <EvidenceList evidence={f.evidence} fallbackDocId={f.document_id} />
        <TimeMachineLink finding={f} />
      </Block>

      {(inputs.length > 0 || missing.length > 0) && (
        <details className="group min-w-0">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded text-sm font-semibold text-ink select-none">
            Inputs
            <span className="font-normal text-ink-3">{inputs.length + missing.length}</span>
          </summary>
          <div className="mt-2 space-y-2">
            {expr && (
              <p className="text-xs text-ink-3">
                Check <Code className="text-xs">{expr}</Code>
              </p>
            )}
            <TraceInputs inputs={inputs} missing={missing} />
          </div>
        </details>
      )}

      {f.regulatory_basis && f.regulatory_basis.establish.length > 0 && (
        <Block title="What must be established">
          <p className="mb-3 text-xs text-ink-3">Before acting on this finding.</p>
          <Establish basis={f.regulatory_basis} />
        </Block>
      )}

      <Block title="History">
        <History findingId={f.id} />
      </Block>
    </article>
  );
}

/** One checklist rule: what it found, the clause, the facts it used and its evidence. */
export function RuleDetail({ entry: e, showTitle = true }: { entry: ChecklistEntry; showTitle?: boolean }) {
  const { app, findings } = useWorkspace();
  const finding = (findings ?? []).find((f) => f.rule?.id === e.rule_id);
  return (
    <article aria-label={showTitle ? undefined : e.title} className="min-w-0 space-y-6">
      <header className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          {showTitle && <h2 className="min-w-0 text-md font-semibold text-ink text-pretty">{e.title}</h2>}
          <RuleOutcomeBadge outcome={e.outcome} />
        </div>
        <MetaList
          className="mt-1.5 text-sm text-ink-3"
          items={[
            <Code key="id" className="text-xs">
              {e.rule_id}
            </Code>,
            e.category ? (categoryMeta[e.category]?.label ?? humanize(e.category)) : null,
            e.severity ? <SeverityIndicator key="sev" severity={e.severity} /> : null,
          ]}
        />
        <p className="mt-3 text-sm text-ink-2 text-pretty">{e.message}</p>
        {finding && (
          <Link
            to={workspacePath(app.id, "findings", { finding: finding.id })}
            className="mt-2 inline-flex items-center gap-1 rounded text-sm font-medium text-ink underline-offset-2 hover:underline"
          >
            Open the finding <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </header>
      {e.citation && (
        <Block title="Rule">
          <CitationCard citation={e.citation} />
        </Block>
      )}
      <Block title="Facts the rule used">
        <TraceInputs inputs={e.inputs} missing={e.missing} />
      </Block>
      {e.evidence.length > 0 && (
        <Block title="Evidence">
          <EvidenceList evidence={e.evidence} fallbackDocId={null} />
        </Block>
      )}
    </article>
  );
}
