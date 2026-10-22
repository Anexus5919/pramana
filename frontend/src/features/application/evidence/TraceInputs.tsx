import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Pill } from "../../../components/ui/Badge";
import { fmtValue } from "../../../lib/format";
import { factSourceMeta, humanize, type Tone } from "../../../lib/labels";
import type { FactInput } from "../../../types";
import type { DocHref } from "./EvidenceList";

function provenanceText(i: FactInput): string {
  const p = i.provenance ?? {};
  const parts: string[] = [];
  if (p.filename) parts.push(String(p.filename));
  if (p.page) parts.push(`page ${p.page}`);
  if (p.method) parts.push(String(p.method));
  if (p.raw && String(p.raw) !== String(i.value)) parts.push(`read "${p.raw}"`);
  if (p.record) parts.push(String(p.record));
  if (p.record_id) parts.push(String(p.record_id));
  if (p.records) parts.push(`${p.records} records`);
  if (p.form_field) parts.push(`form field ${p.form_field}`);
  return parts.join(", ");
}

export function TraceInputs({
  inputs,
  missing,
  docHref,
}: {
  inputs: FactInput[];
  missing?: string[];
  docHref?: DocHref;
}) {
  return (
    <div className="space-y-2">
      {inputs.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-subtle/70 text-left text-[10px] tracking-wider text-subtle-fg uppercase">
                <th scope="col" className="px-2 py-1.5 font-semibold">Input</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Value</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Source</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Provenance</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((i, n) => {
                const m = factSourceMeta[i.source] ?? { label: humanize(i.source), tone: "unchecked" as Tone };
                const docId = i.provenance?.document_id;
                const href =
                  docId && docHref ? docHref(docId, i.provenance.page ?? null, i.provenance.bbox ?? null, i.path) : null;
                return (
                  <tr key={`${i.path}-${n}`} className="border-t border-line align-top">
                    <td className="px-2 py-1.5 font-mono text-[11px] break-all text-fg">{i.path}</td>
                    <td className="px-2 py-1.5 font-mono text-[11px] break-words text-fg">{fmtValue(i.value)}</td>
                    <td className="px-2 py-1.5">
                      <Pill tone={m.tone} dot={false}>
                        {m.label}
                      </Pill>
                    </td>
                    <td className="px-2 py-1.5 text-muted">
                      {provenanceText(i) || "None recorded"}
                      {href && (
                        <Link to={href} className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-primary-ink hover:underline">
                          view
                          <ArrowUpRight aria-hidden className="size-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-subtle-fg">No inputs were read.</p>
      )}
      {missing && missing.length > 0 && (
        <p className="text-xs text-manual-fg">
          Missing: {missing.map((m) => <code key={m} className="mr-1 rounded bg-manual-bg px-1 font-mono">{m}</code>)}
        </p>
      )}
    </div>
  );
}
