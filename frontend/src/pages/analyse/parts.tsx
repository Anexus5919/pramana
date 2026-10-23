import type { ReactNode } from "react";
import { fmtMs } from "../../lib/format";
import type { DocumentDetail, ExtractedField } from "../../types";
import { Button, MetaList, Panel, type ButtonProps } from "../../ui2";
import type { AnalyseStep } from "./analyseApi";
import { STEP_LABEL } from "./summary";

/** Anchor id of a report section, shared by the panels and the in-page index. */
export const anchorId = (id: string) => `an-${id}`;

/** One report section: a Panel with a stable anchor for the in-page index. */
export function ReportPanel({
  id,
  title,
  description,
  actions,
  padding,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padding?: "none" | "md";
  children: ReactNode;
}) {
  return (
    <Panel id={anchorId(id)} title={title} description={description} actions={actions} padding={padding} className="scroll-mt-20">
      {children}
    </Panel>
  );
}

/** Small ghost button for "Show on page" and "Locate" actions inside rows. */
export function RowAction(props: ButtonProps) {
  return <Button size="sm" variant="ghost" {...props} />;
}

/** Plain explanation when a section has nothing to show. */
export function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-3 text-pretty">{children}</p>;
}

/** Where the server's time went, as one line of stage timings. */
export function StepLine({ steps }: { steps: AnalyseStep[] }) {
  return (
    <MetaList
      className="text-xs text-ink-3"
      items={steps.map((s, i) => (
        <span key={`${s.step}-${i}`}>
          {STEP_LABEL[s.step] ?? s.step} <span className="text-ink-2">{fmtMs(s.ms)}</span>
        </span>
      ))}
    />
  );
}

function devanagariPages(doc: DocumentDetail) {
  return (doc.ocr_scripts ?? []).filter((n) => n.script === "devanagari");
}

/** How a page carrying Hindi was read, or why its Hindi text was not read. */
export function ScriptNote({ doc }: { doc: DocumentDetail }) {
  const notes = devanagariPages(doc);
  if (!notes.length) return null;
  return (
    <ul className="space-y-1 text-sm text-ink-2">
      {notes.map((n) => (
        <li key={n.page} className="text-pretty">
          <span className="font-medium text-ink">Page {n.page}.</span> {n.reason ? `Routed to OCR because ${n.reason}. ` : ""}
          {n.read === false
            ? n.note
            : "Devanagari words were read with the PP-OCRv5 Devanagari recogniser and Latin words and digits with the default recogniser, line by line."}
        </li>
      ))}
    </ul>
  );
}

/** The OCR line a value was read from, so a Hindi label can be checked against the page. */
export function FieldSourceLine({ doc, f }: { doc: DocumentDetail; f: ExtractedField }) {
  if (!f.raw || !f.page || !devanagariPages(doc).some((n) => n.page === f.page && n.read !== false)) return null;
  const text = doc.pages.find((p) => p.page_no === f.page)?.text ?? "";
  const line = text.split("\n").find((l) => l.includes(f.raw as string));
  if (!line || line.trim() === f.raw.trim()) return null;
  return (
    <div className="mt-0.5 text-xs text-ink-3">
      Line read:{" "}
      <span lang="hi" className="text-ink-2">
        "{line}"
      </span>
    </div>
  );
}
