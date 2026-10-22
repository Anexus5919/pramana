import { Check, Minus, X } from "lucide-react";
import { fmtValue } from "../../../lib/format";
import { humanize } from "../../../lib/labels";
import type { Comparison } from "../../../types";

export function ComparisonTable({ comparisons, authoritativeLabel = "Authoritative" }: {
  comparisons: Comparison[];
  authoritativeLabel?: string;
}) {
  if (!comparisons.length) return <p className="text-xs text-subtle-fg">No field comparisons recorded.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-subtle/70 text-left text-[10px] tracking-wider text-subtle-fg uppercase">
            <th scope="col" className="px-2 py-1.5 font-semibold">Field</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Submitted</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">{authoritativeLabel}</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Match</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => (
            <tr key={`${c.field}-${i}`} className="border-t border-line align-top">
              <td className="px-2 py-1.5 font-medium text-fg">{humanize(c.field)}</td>
              <td className="px-2 py-1.5 break-words text-fg">{fmtValue(c.submitted)}</td>
              <td className="px-2 py-1.5 break-words text-fg">{fmtValue(c.authoritative)}</td>
              <td className="px-2 py-1.5">
                {c.match === true ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-verified-fg">
                    <Check aria-hidden className="size-3.5" /> Match
                  </span>
                ) : c.match === false ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-mismatch-fg">
                    <X aria-hidden className="size-3.5" /> Differs
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-unchecked-fg">
                    <Minus aria-hidden className="size-3.5" /> Unknown
                  </span>
                )}
                {c.note && <span className="mt-0.5 block text-[11px] text-subtle-fg">{c.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
