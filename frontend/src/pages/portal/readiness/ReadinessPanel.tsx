import { ArrowDown, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtDate, fmtDateTime, pluralize } from "../../../lib/format";
import type { ApplicationDetail } from "../../../types";
import { Button, Callout, Panel, Skeleton, cn } from "../../../ui2";
import { ReadinessRing, StatusArc } from "./ReadinessRing";
import type { Readiness, ReadinessClause, ReadinessItem, ReadinessStatus, ReadinessTarget } from "./types";
import { useReadiness, type ReadinessChange, type Trigger } from "./useReadiness";

const STATUS_LABEL: Record<ReadinessStatus, string> = { met: "Met", fix: "To fix", waiting: "After upload" };
const GROUP_LABEL: Record<string, string> = { documents: "Documents", validity: "Validity", norms: "Norms" };

function clauseSource(c: ReadinessClause): string {
  return [c.source, c.section, c.page ? `page ${c.page}` : null].filter(Boolean).join(", ");
}

function Clause({ clause }: { clause: ReadinessClause }) {
  return (
    <figure className="mt-2.5 border-l-2 border-line pl-3">
      {clause.quote && <blockquote className="text-sm text-ink-3 text-pretty">&ldquo;{clause.quote}&rdquo;</blockquote>}
      <figcaption className={cn("text-xs text-ink-3", clause.quote && "mt-1")}>{clauseSource(clause)}</figcaption>
    </figure>
  );
}

function GoTo({ targets, onGoTo, label }: { targets: ReadinessTarget[]; onGoTo: (t: ReadinessTarget) => void; label: string }) {
  if (targets.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {targets.map((t) => (
        <Button
          key={`${t.kind}-${t.key}`}
          size="sm"
          variant="secondary"
          trailingIcon={<ArrowDown aria-hidden />}
          onClick={() => onGoTo(t)}
          aria-label={`Go to ${t.label} for: ${label}`}
        >
          Go to {t.label}
        </Button>
      ))}
    </div>
  );
}

interface RowProps {
  item: ReadinessItem;
  active: boolean;
  onActive: (id: string | null) => void;
  onGoTo: (t: ReadinessTarget) => void;
  resubmission: boolean;
}

/** A requirement to fix: what is wrong, what to do, the clause it comes from, and where to do it. */
function FixRow({ item, active, onActive, onGoTo, resubmission }: RowProps) {
  return (
    <li
      className={cn("-mx-3 rounded-control px-3 py-3 transition-colors duration-150", active && "bg-surface-2")}
      onMouseEnter={() => onActive(item.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(item.id)}
      onBlur={() => onActive(null)}
    >
      <div className="flex gap-3">
        <StatusArc status="fix" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h4 className="text-sm font-medium text-ink">{item.title}</h4>
            <span className="text-xs text-ink-3">{GROUP_LABEL[item.group]}</span>
            {resubmission && item.requested && <span className="text-xs font-medium text-manual-fg">Asked by AICTE</span>}
          </div>
          {item.conditional && <p className="mt-0.5 text-sm text-ink-2 text-pretty">{item.conditional}</p>}
          {item.detail && <p className="mt-0.5 text-sm text-ink-2 text-pretty">{item.detail}</p>}
          {item.action && (
            <p className="mt-1.5 text-sm text-ink text-pretty">
              <span className="font-medium">What to do: </span>
              {item.action}
            </p>
          )}
          {resubmission && !item.requested && (
            <p className="mt-1.5 text-xs text-ink-3 text-pretty">
              AICTE did not ask about this in this round. You can still correct it; AICTE sees every change you make.
            </p>
          )}
          {item.clause && <Clause clause={item.clause} />}
          <GoTo targets={item.targets} onGoTo={onGoTo} label={item.title} />
        </div>
      </div>
    </li>
  );
}

/** Met, with something worth a look: a certificate that lapses during the session, pages that were not read. */
function AdviceRow({ item, active, onActive, onGoTo }: RowProps) {
  if (!item.advice) return null;
  return (
    <li
      className={cn("-mx-3 rounded-control px-3 py-3 transition-colors duration-150", active && "bg-surface-2")}
      onMouseEnter={() => onActive(item.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(item.id)}
      onBlur={() => onActive(null)}
    >
      <div className="flex gap-3">
        <span aria-hidden className="flex size-4 shrink-0 items-center justify-center pt-1">
          <span className="size-1.5 rounded-full bg-manual-dot" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-ink">{item.title}</h4>
          <p className="mt-0.5 text-sm text-ink-2 text-pretty">{item.advice.text}</p>
          <p className="mt-1.5 text-sm text-ink text-pretty">
            <span className="font-medium">Suggested: </span>
            {item.advice.action}
          </p>
          <GoTo targets={item.targets.slice(0, 1)} onGoTo={onGoTo} label={item.title} />
        </div>
      </div>
    </li>
  );
}

/** Every requirement, grouped, with its status in words and the clause it comes from. */
function AllRequirements({ data, active, onActive }: { data: Readiness; active: string | null; onActive: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="readiness-all"
        onClick={() => setOpen((o) => !o)}
        className="-ml-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-sm font-medium text-ink-2 hover:text-ink"
      >
        <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-90")} />
        {open ? "Hide" : "Show"} all {pluralize(data.counts.total, "requirement")}
      </button>
      {open && (
        <div id="readiness-all" className="mt-2 space-y-4">
          {data.groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.id}>
                <h4 className="text-xs font-medium text-ink-3">{g.label}</h4>
                <ul className="mt-1 divide-y divide-line">
                  {g.items.map((i) => (
                    <li
                      key={i.id}
                      className={cn("-mx-2 flex items-start gap-3 rounded-control px-2 py-2", active === i.id && "bg-surface-2")}
                      onMouseEnter={() => onActive(i.id)}
                      onMouseLeave={() => onActive(null)}
                    >
                      <StatusArc status={i.status} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">{i.title}</p>
                        {i.status === "waiting" && i.detail && <p className="text-xs text-ink-3">{i.detail}</p>}
                        {i.clause && <p className="text-xs text-ink-3">{clauseSource(i.clause)}</p>}
                      </div>
                      <span className={cn("shrink-0 text-xs", i.status === "fix" ? "font-medium text-expired-fg" : "text-ink-3")}>
                        {STATUS_LABEL[i.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function headline(data: Readiness): string {
  const verb = data.resubmission ? "resubmitting" : "submitting";
  if (data.counts.fix > 0) return `${pluralize(data.counts.fix, "item")} to fix before ${verb}`;
  return data.resubmission ? "Ready to resubmit" : "Ready to submit";
}

function summary(data: Readiness): string {
  const { met, total, waiting, fix } = data.counts;
  const checked = total - waiting;
  if (fix === 0)
    return data.resubmission
      ? "Every rule this check covers is met, including what AICTE asked about. Resubmit when you are ready."
      : "Every rule this check covers is met. Submit when you are ready.";
  const parts = [`${met} of ${checked} checked requirements are met.`];
  if (waiting > 0) parts.push(`${pluralize(waiting, "more is", "more are")} checked once the missing documents are uploaded.`);
  if (data.resubmission && data.counts.requested > 0)
    parts.push(
      data.counts.requested_fix === 0
        ? "Everything AICTE asked about is corrected."
        : `${data.counts.requested_fix} of the items AICTE asked about still ${data.counts.requested_fix === 1 ? "needs" : "need"} a correction.`,
    );
  return parts.join(" ");
}

const TRIGGER_TEXT: Record<Trigger, string> = {
  open: "Checking your application",
  upload: "Checking again after your upload",
  figures: "Checking again after your change to the figures",
  manual: "Checking again",
};

function changeText(c: ReadinessChange): string | null {
  const parts = [];
  if (c.fixed.length) parts.push(`${pluralize(c.fixed.length, "item")} fixed`);
  if (c.raised.length) parts.push(`${pluralize(c.raised.length, "new item")} to fix`);
  if (parts.length === 0) return c.trigger === "manual" ? "Checked again. Nothing changed." : null;
  const after = c.trigger === "upload" ? "After your upload" : c.trigger === "figures" ? "After your change" : "Since the last check";
  return `${after}: ${parts.join(", ")}.`;
}

function ringLabel(data: Readiness): string {
  const { met, total, fix, waiting, advice } = data.counts;
  const parts = [`Readiness: ${met} of ${total} requirements met`];
  if (fix) parts.push(`${fix} to fix`);
  if (waiting) parts.push(`${waiting} checked after upload`);
  if (advice) parts.push(`${pluralize(advice, "note")}`);
  return parts.join(", ") + ".";
}

export interface ReadinessPanelProps {
  app: ApplicationDetail;
  onShowDocument: (docType: string) => void;
  onEditFigure: (key: string) => void;
  /** Each new result, so the Submit dialog can mention what is still to fix */
  onResult?: (r: Readiness) => void;
}

/**
 * Pre-submission readiness check: the handbook rules AICTE applies that an institution may see, run on the draft
 * as it stands. A self-check only; it never submits, never blocks and never decides anything.
 */
export function ReadinessPanel({ app, onShowDocument, onEditFigure, onResult }: ReadinessPanelProps) {
  const { data, error, checking, trigger, change, recheck } = useReadiness(app, true);
  useEffect(() => {
    if (data) onResult?.(data);
  }, [data, onResult]);
  const [active, setActive] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const goTo = (t: ReadinessTarget) => (t.kind === "document" ? onShowDocument(t.key) : onEditFigure(t.key));

  const items = data ? data.groups.flatMap((g) => g.items) : [];
  const fixItems = items.filter((i) => i.status === "fix").sort((a, b) => Number(b.requested) - Number(a.requested));
  const adviceItems = items.filter((i) => i.status === "met" && i.advice);
  const ready = !!data && data.counts.fix === 0;
  const changed = change ? changeText(change) : null;

  return (
    <Panel
      id="readiness"
      title="Readiness check"
      description={
        app.status === "rectification_requested"
          ? "The handbook rules AICTE applies, run on your corrections before you resubmit."
          : "The handbook rules AICTE applies, run on your draft before you submit."
      }
      actions={
        <Button size="sm" variant="ghost" leadingIcon={<RefreshCw aria-hidden />} onClick={recheck} disabled={checking}>
          Check again
        </Button>
      }
    >
      {error && !data ? (
        <Callout tone="warning" title="The readiness check could not run">
          {error instanceof Error ? error.message : String(error)} Your application is not affected. Try Check again.
        </Callout>
      ) : !data ? (
        <div className="grid gap-6 sm:grid-cols-[188px_minmax(0,1fr)]" role="status">
          <span className="sr-only">Checking your application</span>
          <Skeleton className="mx-auto size-40 sm:size-[188px]" rounded="full" />
          <div className="space-y-3 pt-2">
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
            <Skeleton className="mt-6 h-16" />
            <Skeleton className="h-16" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid items-start gap-x-8 gap-y-6 sm:grid-cols-[188px_minmax(0,1fr)]">
            {/* The ring and its key */}
            <div className="flex items-center gap-5 sm:block">
              <ReadinessRing
                groups={data.groups}
                active={active}
                activeGroup={activeGroup}
                onActive={setActive}
                checking={checking}
                label={ringLabel(data)}
                className="w-36 shrink-0 sm:w-full"
              />
              <dl className="min-w-0 flex-1 space-y-1.5 sm:mt-5">
                {data.groups
                  .filter((g) => g.items.length > 0)
                  .map((g) => {
                    const met = g.items.filter((i) => i.status === "met").length;
                    return (
                      <div
                        key={g.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                        onMouseEnter={() => setActiveGroup(g.id)}
                        onMouseLeave={() => setActiveGroup(null)}
                      >
                        <dt className="text-ink-2">{g.label}</dt>
                        <dd className="text-ink-3">
                          {met} of {g.items.length} met
                        </dd>
                      </div>
                    );
                  })}
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-xs text-ink-3" aria-hidden>
                  <span className="inline-flex items-center gap-1">
                    <StatusArc status="met" className="size-3.5" />
                    Met
                  </span>
                  {data.counts.fix > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <StatusArc status="fix" className="size-3.5" />
                      To fix
                    </span>
                  )}
                  {data.counts.waiting > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <StatusArc status="waiting" className="size-3.5" />
                      After upload
                    </span>
                  )}
                  {data.resubmission && data.counts.requested > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <svg viewBox="0 0 14 14" className="size-3.5">
                        <line x1="7" y1="2" x2="7" y2="12" stroke="var(--ink-2)" strokeWidth={1.75} strokeLinecap="round" />
                      </svg>
                      Asked by AICTE
                    </span>
                  )}
                  {data.counts.advice > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="flex size-3.5 items-center justify-center">
                        <span className="size-1.5 rounded-full bg-manual-dot" />
                      </span>
                      Note
                    </span>
                  )}
                </div>
              </dl>
            </div>

            {/* What it means and what to do */}
            <div className="min-w-0">
              <h3 className={cn("text-md font-semibold", ready ? "text-verified-fg" : "text-ink")}>{headline(data)}</h3>
              <p className="mt-0.5 text-sm text-ink-2 text-pretty">{summary(data)}</p>
              <p role="status" className="mt-1 min-h-5 text-sm text-ink-3">
                {checking ? `${TRIGGER_TEXT[trigger]}.` : changed}
              </p>

              {fixItems.length > 0 && (
                <section aria-labelledby="readiness-fix" className="mt-1">
                  <h4 id="readiness-fix" className="sr-only">
                    To fix
                  </h4>
                  <ul className="space-y-1">
                    {fixItems.map((i) => (
                      <FixRow
                        key={i.id}
                        item={i}
                        active={active === i.id}
                        onActive={setActive}
                        onGoTo={goTo}
                        resubmission={data.resubmission}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {adviceItems.length > 0 && (
                <section aria-labelledby="readiness-notes" className={cn(fixItems.length > 0 ? "mt-4 border-t border-line pt-4" : "mt-3")}>
                  <h4 id="readiness-notes" className="text-xs font-medium text-ink-3">
                    Worth a look
                  </h4>
                  <ul className="mt-1 space-y-1">
                    {adviceItems.map((i) => (
                      <AdviceRow key={i.id} item={i} active={active === i.id} onActive={setActive} onGoTo={goTo} resubmission={data.resubmission} />
                    ))}
                  </ul>
                </section>
              )}

              {data.notes.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {data.notes.map((n) => (
                    <li key={n} className="text-sm text-ink-3 text-pretty">
                      {n}
                    </li>
                  ))}
                </ul>
              )}

              <AllRequirements data={data} active={active} onActive={setActive} />
            </div>
          </div>

          <p className="mt-5 border-t border-line pt-4 text-xs text-ink-3 text-pretty">
            A self-check of handbook rules on what you have uploaded and declared, as if submitted on {fmtDate(data.as_of)}. AICTE
            officials still review every application, and passing this check does not mean approval. Checks that need
            AICTE&rsquo;s own records, such as the TER payment ledger, run after you submit.{" "}
            <span title={fmtDateTime(data.checked_at)}>Last checked {fmtDateTime(data.checked_at)}.</span>
          </p>
        </>
      )}
    </Panel>
  );
}
