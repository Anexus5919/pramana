import { Languages } from "lucide-react";
import type { DocumentDetail, ExtractedField } from "../../../types";
import { Tag } from "../../../ui/Badge";

function devanagariPages(doc: DocumentDetail) {
  return (doc.ocr_scripts ?? []).filter((n) => n.script === "devanagari");
}

/** How a page carrying Hindi was read, or why its Hindi text was not read. */
export function ScriptNote({ doc }: { doc: DocumentDetail }) {
  const notes = devanagariPages(doc);
  if (!notes.length) return null;
  return (
    <div className="mb-3 space-y-2 rounded-[12px] border border-line bg-surface-2/60 p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2 font-medium text-ink">
        <Languages className="size-4 text-brand-ink" aria-hidden />
        Hindi text read by OCR
        <Tag variant="neutral" lang="hi">
          देवनागरी
        </Tag>
      </div>
      {notes.map((n) => (
        <p key={n.page} className="text-ink-2 text-pretty">
          <b className="font-semibold text-ink">Page {n.page}.</b> {n.reason ? `Routed to OCR because ${n.reason}. ` : ""}
          {n.read === false
            ? n.note
            : "Devanagari words were read with the PP-OCRv5 Devanagari recogniser and Latin words and digits with the default recogniser, line by line. Each value below points at the words it came from."}
        </p>
      ))}
    </div>
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
