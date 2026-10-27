import { ArrowDown, Download } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { InstitutionComposer } from "../../conversation/Composer";
import { useRoundThreads, type Thread } from "../../conversation/api";
import { CELL_NAME, daysLeftText } from "../../conversation/labels";
import { DueLine, ItemStatusBadge, ThreadEntries } from "../../conversation/ThreadView";
import { fmtDate, pluralize } from "../../lib/format";
import { correctionRound } from "../../lib/labels";
import type { Rectification, RectificationItem } from "../../types";
import { Button, DescriptionList, Digest, Panel, PanelDivider, StatusBadge, buttonStyles } from "../../ui2";
import { officerApi, useLetters } from "../application/officer/officerApi";

interface Item {
  key: string;
  title: string;
  message: string;
  docType: string | null;
}

/** The backend records the document type of each requested item; the shared type does not declare it. */
export function itemDocType(it: RectificationItem): string | null {
  const t = (it as RectificationItem & { document_type?: unknown }).document_type;
  return typeof t === "string" && t ? t : null;
}

/** Brings a thread named in ?thread= (a notification link) into view once the round has loaded, then drops the flag. */
function useThreadFocus(loaded: boolean) {
  const [sp, setSp] = useSearchParams();
  const target = sp.get("thread");
  useEffect(() => {
    if (!target || !loaded) return;
    const el = document.getElementById(`thread-${target}`);
    if (el) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    }
    const next = new URLSearchParams(sp);
    next.delete("thread");
    setSp(next, { replace: true });
  }, [target, loaded, sp, setSp]);
}

function Conversation({ appId, rectId, thread, canPost }: { appId: string; rectId: string; thread: Thread; canPost: boolean }) {
  return (
    <>
      <ThreadEntries entries={thread.entries} official={false} pendingReview={thread.pending_review} />
      {canPost && <InstitutionComposer appId={appId} rectificationId={rectId} thread={thread} />}
    </>
  );
}

/**
 * A correction round in one panel: the deficiency letter (PDF and digest) when AICTE issued one, the officer's
 * message, and the numbered items with title and message only, no codes and no severity. Each item carries its
 * status, its response date and the conversation with the AICTE Scrutiny Cell; a general thread closes the panel.
 */
export function DeficiencyLetterPanel({
  appId,
  rect,
  docLabel,
  onShowDocument,
  resubmitted = false,
}: {
  appId: string;
  rect: Rectification;
  /** Checklist label of a document type, when the type is on this application's checklist */
  docLabel: (docType: string) => string | undefined;
  onShowDocument: (docType: string) => void;
  /** The round was answered and resubmitted: documents are locked, the conversation stays */
  resubmitted?: boolean;
}) {
  const q = useLetters(appId);
  const conv = useRoundThreads(appId, rect.id);
  useThreadFocus(!!conv.data);
  const letter = q.data?.find((l) => l.rectification_id === rect.id && l.status === "final");
  const due = letter?.items
    .map((i) => i.respond_by)
    .filter(Boolean)
    .sort()[0];
  // The letter is what AICTE formally sent, so its numbering wins when there is one.
  // Institutions receive the letter without finding ids, so items are matched to the request by title, then by position
  const typeOf = (title: string, i: number) => {
    const same = rect.items.find((r) => r.title === title) ?? (letter && letter.items.length === rect.items.length ? rect.items[i] : undefined);
    return same ? itemDocType(same) : null;
  };
  const items: Item[] = letter
    ? letter.items.map((it, i) => ({ key: `l${i}`, title: it.title, message: it.description, docType: typeOf(it.title, i) }))
    : rect.items.map((it) => ({ key: it.finding_id, title: it.title, message: it.message, docType: itemDocType(it) }));
  const issued = letter?.finalised_at ?? rect.created_at;
  const threads = new Map((conv.data?.threads ?? []).map((t) => [t.item_no, t]));
  const general = threads.get(0);
  const canPost = !!conv.data?.can_post;
  const round = conv.data?.round;

  return (
    <Panel
      id="letter"
      title={letter ? "Deficiency letter" : "Corrections requested"}
      description={
        resubmitted
          ? `${correctionRound(rect.round)}, resubmitted ${fmtDate(rect.responded_at)}`
          : letter
            ? correctionRound(rect.round)
            : `${correctionRound(rect.round)}, issued ${fmtDate(issued)}`
      }
      actions={
        letter ? (
          <a href={officerApi.letterPdfUrl(letter.id)} download className={buttonStyles("secondary", "md")}>
            <Download aria-hidden />
            Download PDF
          </a>
        ) : undefined
      }
    >
      {letter && (
        <DescriptionList
          layout="stacked"
          columns={4}
          className="grid-cols-2"
          items={[
            { label: "Issued", value: fmtDate(letter.finalised_at) },
            {
              label: "Respond by",
              value: due ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {fmtDate(due)}
                  {round?.past_due && <StatusBadge tone="mismatch">Past due</StatusBadge>}
                </span>
              ) : null,
              hint: !resubmitted && round && !round.past_due ? daysLeftText(round.days_left) : undefined,
            },
            { label: "Items", value: pluralize(letter.items.length, "item") },
            { label: "Notice SHA-256", value: <Digest value={letter.final_sha256} label="Notice SHA-256" head={8} tail={6} /> },
          ]}
        />
      )}
      {rect.message && (
        <>
          {letter && <PanelDivider label="Message from AICTE" />}
          {!letter && <h3 className="mb-1 text-xs font-medium text-ink-3">Message from AICTE</h3>}
          <p className="text-sm whitespace-pre-line text-ink-2 text-pretty">{rect.message}</p>
        </>
      )}
      {(letter || rect.message) && <PanelDivider label="What to correct" />}
      {canPost && (
        <p className="mb-4 text-sm text-ink-3 text-pretty">
          For each item, upload the corrected document in its slot below. If something is unclear, or you think an item is not right, write to the {CELL_NAME}{" "}
          under it.
        </p>
      )}
      <ol className="space-y-6">
        {items.map((it, i) => {
          const t = threads.get(i + 1);
          return (
            <li key={it.key} id={t ? `thread-${t.id}` : undefined} tabIndex={t ? -1 : undefined} className="flex scroll-mt-20 gap-3 outline-none">
              <span className="w-5 shrink-0 text-sm font-medium text-ink-3 tabular-nums">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <h3 className="min-w-0 text-sm font-medium text-ink">{it.title}</h3>
                  {t && <ItemStatusBadge status={t.status} />}
                </div>
                {it.message && <p className="text-sm text-ink-2 text-pretty">{it.message}</p>}
                {t && !resubmitted && t.status !== "resolved" && <DueLine respondBy={t.respond_by} daysLeft={t.days_left} pastDue={t.past_due} />}
                {!resubmitted && it.docType && docLabel(it.docType) && (
                  <Button size="sm" variant="ghost" className="-ml-2.5" trailingIcon={<ArrowDown aria-hidden />} onClick={() => onShowDocument(it.docType as string)}>
                    Go to {docLabel(it.docType)}
                  </Button>
                )}
                {t && <Conversation appId={appId} rectId={rect.id} thread={t} canPost={canPost} />}
              </div>
            </li>
          );
        })}
      </ol>
      {general && (general.entries.length > 0 || canPost) && (
        <div id={`thread-${general.id}`} tabIndex={-1} className="scroll-mt-20 outline-none">
          <PanelDivider label="Questions about the round" />
          <div className="space-y-2">
            <p className="text-sm text-ink-3 text-pretty">For anything that is not about one item.</p>
            <Conversation appId={appId} rectId={rect.id} thread={general} canPost={canPost} />
          </div>
        </div>
      )}
      {conv.data && !canPost && conv.data.closed_reason && <p className="mt-4 text-sm text-ink-3 text-pretty">{conv.data.closed_reason}</p>}
    </Panel>
  );
}
