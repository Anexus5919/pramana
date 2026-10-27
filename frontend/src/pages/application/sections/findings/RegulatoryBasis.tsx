import { ArrowUpRight } from "lucide-react";
import type { EstablishStep, Provision, RegulatoryBasis } from "../../../../types";
import { cn } from "../../../../ui2";

type Sources = RegulatoryBasis["sources"];

/** The official PDF, opened at the cited page. */
const pageLink = (sources: Sources, source: string, page: number) => {
  const url = sources[source]?.url;
  return url ? `${url}#page=${page}` : undefined;
};

/** One provision: instrument and number, the verbatim quote, and a link to the official page. */
function ProvisionCard({ p, sources }: { p: Provision; sources: Sources }) {
  const name = sources[p.source]?.name ?? p.source;
  const href = pageLink(sources, p.source, p.page);
  return (
    <li className="min-w-0 py-3 first:pt-0 last:pb-0">
      <p className="text-xs text-ink-3">
        <span className="font-medium text-ink-2">{name}</span>
        <span aria-hidden className="mx-1.5 text-ink-4">
          ·
        </span>
        {p.number}
      </p>
      <blockquote className="mt-1.5 border-l-2 border-line-2 pl-3 text-sm break-words text-ink text-pretty">
        &ldquo;{p.quote}&rdquo;
      </blockquote>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 ml-3 inline-flex items-center gap-0.5 rounded text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          Source, p. {p.page}
          <span className="sr-only">
            : {name}, {p.number}, opens in a new tab
          </span>
          <ArrowUpRight aria-hidden className="size-3" />
        </a>
      )}
    </li>
  );
}

/** The provisions a finding concerns. It relates; whether a provision is breached is for the competent authority. */
export function RelatesTo({ basis }: { basis: RegulatoryBasis }) {
  if (!basis.provisions.length) return null;
  return (
    <div className="min-w-0">
      <p className="mb-3 text-xs text-ink-3">{basis.scope_note}</p>
      <ul className="divide-y divide-line">
        {basis.provisions.map((p) => (
          <ProvisionCard key={p.id} p={p} sources={basis.sources} />
        ))}
      </ul>
    </div>
  );
}

const TAG = "inline-flex h-5 shrink-0 items-center rounded-[4px] border border-line-2 px-1.5 text-xs leading-none whitespace-nowrap text-ink-3";

function BasisTag({ basis, sources }: { basis: EstablishStep["basis"]; sources: Sources }) {
  if (basis.kind === "evidence")
    return (
      <span className={TAG} title="Evidentiary good practice, not a requirement of the text">
        Evidence
      </span>
    );
  const href = pageLink(sources, basis.source, basis.page);
  if (!href) return <span className={TAG}>{basis.label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Provided by ${basis.label}; opens the source at page ${basis.page}`}
      className={cn(TAG, "hover:border-ink-4 hover:text-ink")}
    >
      {basis.label}
    </a>
  );
}

/** What an official should establish before acting on the finding, each step with the text or practice behind it. */
export function Establish({ basis }: { basis: RegulatoryBasis }) {
  if (!basis.establish.length) return null;
  return (
    <ol className="min-w-0 space-y-2.5">
      {basis.establish.map((s, i) => (
        <li key={s.text} className="flex min-w-0 gap-2.5 text-sm">
          <span aria-hidden className="w-4 shrink-0 text-right text-ink-3 tabular-nums">
            {i + 1}.
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 text-ink-2 text-pretty">{s.text}</span>
            <BasisTag basis={s.basis} sources={basis.sources} />
          </span>
        </li>
      ))}
    </ol>
  );
}
