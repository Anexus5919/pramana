import { pluralize } from "../../lib/format";
import { DescriptionList } from "../../ui2";
import { gap, pdfDate, pdfDateIso } from "./pdf";

const DATE_KEYS = new Set(["CreationDate", "ModDate"]);
const KEY_LABEL: Record<string, string> = {
  CreationDate: "Created",
  ModDate: "Last modified",
  Producer: "Producer",
  Creator: "Creator application",
  Author: "Author",
  Title: "Title",
  Subject: "Subject",
  Keywords: "Keywords",
};

/** One sentence on the saved revisions: appended content is normal for signing workflows. */
export function Revisions({ count }: { count: number | null }) {
  const n = Math.max(1, count ?? 1);
  return (
    <p className="text-sm text-ink-2 text-pretty">
      {n === 1 ? (
        <>
          <span className="font-medium text-ink">One revision.</span> No content was appended after the file was first written.
        </>
      ) : (
        <>
          <span className="font-medium text-ink">{pluralize(n, "revision")}.</span> Content was appended after the first save. That is normal for signing
          workflows; the time machine shows what changed.
        </>
      )}
    </p>
  );
}

/** The PDF document information dictionary, dates made readable. Context only: it is easy to edit. */
export function Metadata({ meta }: { meta: Record<string, string> }) {
  const rows = Object.entries(meta).filter(([, v]) => v !== "" && v != null);
  const created = meta.CreationDate ? pdfDateIso(meta.CreationDate) : null;
  const modified = meta.ModDate ? pdfDateIso(meta.ModDate) : null;
  const between = created && modified ? gap(created, modified) : null;
  if (rows.length === 0) return <p className="text-sm text-ink-3">The file has no document information dictionary.</p>;
  return (
    <DescriptionList
      labelWidth={120}
      items={rows.map(([k, v]) => {
        const date = DATE_KEYS.has(k) ? pdfDate(v) : null;
        return {
          label: KEY_LABEL[k] ?? k,
          value: date ?? v,
          hint: k === "ModDate" && between ? `${between} after creation` : undefined,
        };
      })}
    />
  );
}
