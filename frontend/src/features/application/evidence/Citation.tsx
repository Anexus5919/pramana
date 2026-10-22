import { BookOpen, ExternalLink } from "lucide-react";
import type { Citation } from "../../../types";

export function CitationBlock({ citation, compact = false }: { citation: Citation | null | undefined; compact?: boolean }) {
  if (!citation || (!citation.doc_title && !citation.doc && !citation.section && !citation.quote)) {
    return <p className="text-sm text-subtle-fg">No citation recorded for this rule.</p>;
  }
  const where = [
    citation.section ? `Section ${citation.section}` : null,
    citation.clause ? `Clause ${citation.clause}` : null,
    citation.page ? `p. ${citation.page}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <figure className={compact ? "" : "rounded-md border border-line bg-subtle/50 p-3"}>
      <figcaption className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
        <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle-fg" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-fg">{citation.doc_title ?? citation.doc}</span>
          {where && <span className="text-muted">, {where}</span>}
        </span>
        {citation.doc_url && (
          <a
            href={citation.doc_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline"
          >
            Source
            <ExternalLink aria-hidden className="size-3" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </figcaption>
      {citation.quote && (
        <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted italic">
          {citation.quote}
        </blockquote>
      )}
    </figure>
  );
}
