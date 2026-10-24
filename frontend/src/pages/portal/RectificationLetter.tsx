import { ArrowDown, Download } from "lucide-react";
import { fmtDate, pluralize } from "../../lib/format";
import { correctionRound } from "../../lib/labels";
import type { Rectification, RectificationItem } from "../../types";
import { Button, DescriptionList, Digest, Panel, PanelDivider, buttonStyles } from "../../ui2";
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

/**
 * The open rectification request in one panel: the deficiency letter (PDF and digest) when AICTE issued one,
 * the officer's message, and the numbered items with title and message only. No codes, no severity.
 */
export function DeficiencyLetterPanel({
  appId,
  rect,
  docLabel,
  onShowDocument,
}: {
  appId: string;
  rect: Rectification;
  /** Checklist label of a document type, when the type is on this application's checklist */
  docLabel: (docType: string) => string | undefined;
  onShowDocument: (docType: string) => void;
}) {
  const q = useLetters(appId);
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

  return (
    <Panel
      id="letter"
      title={letter ? "Deficiency letter" : "Corrections requested"}
      description={letter ? correctionRound(rect.round) : `${correctionRound(rect.round)}, issued ${fmtDate(issued)}`}
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
            { label: "Respond by", value: due ? fmtDate(due) : null },
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
      <ol className="space-y-4">
        {items.map((it, i) => (
          <li key={it.key} className="flex gap-3">
            <span className="w-5 shrink-0 text-sm font-medium text-ink-3 tabular-nums">
              {i + 1}.
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-ink">{it.title}</h3>
              {it.message && <p className="mt-0.5 text-sm text-ink-2 text-pretty">{it.message}</p>}
              {it.docType && docLabel(it.docType) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 -ml-2.5"
                  trailingIcon={<ArrowDown aria-hidden />}
                  onClick={() => onShowDocument(it.docType as string)}
                >
                  Go to {docLabel(it.docType)}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
