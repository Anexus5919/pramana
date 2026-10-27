import { ArrowDown, Download } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { InstitutionComposer } from "../../conversation/Composer";
import { useRoundThreads, type Thread } from "../../conversation/api";
import { CELL_NAME, daysLeftText } from "../../conversation/labels";
import { DueLine, ItemStatusBadge, ThreadEntries } from "../../conversation/ThreadView";
import { useDateFormat, useLang } from "../../i18n";
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
  const { t, tn } = useLang();
  const date = useDateFormat();
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
  const threads = new Map((conv.data?.threads ?? []).map((th) => [th.item_no, th]));
  const general = threads.get(0);
  const canPost = !!conv.data?.can_post;
  const round = conv.data?.round;

  return (
    <Panel
      id="letter"
      title={letter ? t("Deficiency letter") : t("Corrections requested")}
      description={
        resubmitted
          ? t("{round}, resubmitted {date}", { round: correctionRound(rect.round, t), date: date(rect.responded_at, t("Not set")) })
          : letter
            ? correctionRound(rect.round, t)
            : t("{round}, issued {date}", { round: correctionRound(rect.round, t), date: date(issued, t("Not set")) })
      }
      actions={
        letter ? (
          <a href={officerApi.letterPdfUrl(letter.id)} download className={buttonStyles("secondary", "md")}>
            <Download aria-hidden />
            {t("Download PDF")}
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
            { label: t("Issued"), value: date(letter.finalised_at, t("Not set")) },
            {
              label: t("Respond by"),
              value: due ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {date(due)}
                  {round?.past_due && <StatusBadge tone="mismatch">{t("Past due")}</StatusBadge>}
                </span>
              ) : null,
              hint: !resubmitted && round && !round.past_due ? daysLeftText(round.days_left, t) : undefined,
            },
            { label: t("Items"), value: tn(letter.items.length, "{n} item", "{n} items") },
            { label: t("Notice SHA-256"), value: <Digest value={letter.final_sha256} label={t("Notice SHA-256")} head={8} tail={6} /> },
          ]}
        />
      )}
      {rect.message && (
        <>
          {letter && <PanelDivider label={t("Message from AICTE")} />}
          {!letter && <h3 className="mb-1 text-xs font-medium text-ink-3">{t("Message from AICTE")}</h3>}
          <p className="text-sm whitespace-pre-line text-ink-2 text-pretty">{rect.message}</p>
        </>
      )}
      {(letter || rect.message) && <PanelDivider label={t("What to correct")} />}
      {canPost && (
        <p className="mb-4 text-sm text-ink-3 text-pretty">
          {t(
            "For each item, upload the corrected document in its slot below. If something is unclear, or you think an item is not right, write to the {cell} under it.",
            { cell: t(CELL_NAME) },
          )}
        </p>
      )}
      <ol className="space-y-6">
        {items.map((it, i) => {
          const th = threads.get(i + 1);
          return (
            <li key={it.key} id={th ? `thread-${th.id}` : undefined} tabIndex={th ? -1 : undefined} className="flex scroll-mt-20 gap-3 outline-none">
              <span className="w-5 shrink-0 text-sm font-medium text-ink-3 tabular-nums">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <h3 className="min-w-0 text-sm font-medium text-ink">{it.title}</h3>
                  {th && <ItemStatusBadge status={th.status} />}
                </div>
                {it.message && <p className="text-sm text-ink-2 text-pretty">{it.message}</p>}
                {th && !resubmitted && th.status !== "resolved" && <DueLine respondBy={th.respond_by} daysLeft={th.days_left} pastDue={th.past_due} />}
                {!resubmitted && it.docType && docLabel(it.docType) && (
                  <Button size="sm" variant="ghost" className="-ml-2.5" trailingIcon={<ArrowDown aria-hidden />} onClick={() => onShowDocument(it.docType as string)}>
                    {t("Go to {label}", { label: docLabel(it.docType) ?? "" })}
                  </Button>
                )}
                {th && <Conversation appId={appId} rectId={rect.id} thread={th} canPost={canPost} />}
              </div>
            </li>
          );
        })}
      </ol>
      {general && (general.entries.length > 0 || canPost) && (
        <div id={`thread-${general.id}`} tabIndex={-1} className="scroll-mt-20 outline-none">
          <PanelDivider label={t("Questions about the round")} />
          <div className="space-y-2">
            <p className="text-sm text-ink-3 text-pretty">{t("For anything that is not about one item.")}</p>
            <Conversation appId={appId} rectId={rect.id} thread={general} canPost={canPost} />
          </div>
        </div>
      )}
      {conv.data && !canPost && conv.data.closed_reason && <p className="mt-4 text-sm text-ink-3 text-pretty">{conv.data.closed_reason}</p>}
    </Panel>
  );
}
