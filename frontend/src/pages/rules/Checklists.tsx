import { ArrowRight, ExternalLink, Landmark, PenLine } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { humanize } from "../../lib/labels";
import type { ActiveRuleset, Citation } from "../../types";
import { Tag } from "../../ui/Badge";
import { cn } from "../../ui/cn";
import { fadeUp, stagger } from "../../ui/motion";
import { Tooltip } from "../../ui/Tooltip";
import { ruleDocs, sourceLink } from "./RuleCard";

type Need = "required" | "optional" | null;

function NeedCell({ need }: { need: Need }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className={cn(
          "relative block size-3.5 overflow-hidden rounded-[3px]",
          need === "required" && "bg-brand-500",
          need === "optional" && "bg-brand-200",
          need === null && "border border-dashed border-line-2",
        )}
      >
        {need === "required" && <span className="absolute inset-x-0 top-0 h-[3px] bg-white/35" />}
      </span>
      <span className={cn(need === "required" ? "font-medium text-ink" : need === "optional" ? "text-ink-2" : "text-ink-4")}>
        {need === "required" ? "Required" : need === "optional" ? "Optional" : "Not listed"}
      </span>
    </span>
  );
}

function SourceCite({ rs, source }: { rs: ActiveRuleset; source: unknown }) {
  const c = (source ?? {}) as Citation;
  if (!c.doc) return null;
  const href = sourceLink(rs, c.doc, c.page);
  const text = [c.doc, c.section, c.page !== undefined ? `p. ${c.page}` : null].filter(Boolean).join(", ");
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-normal text-brand-ink hover:underline">
      {text} <ExternalLink className="size-3" aria-hidden />
    </a>
  ) : (
    <span className="text-[11px] font-normal text-ink-3">{text}</span>
  );
}

/** Which documents each application category needs, side by side, and how many rules read each one. */
export function Checklists({ rs, onShowRules }: { rs: ActiveRuleset; onShowRules: (docType: string) => void }) {
  const lists = Object.entries(rs.checklists);
  const order: string[] = [];
  for (const [, cl] of lists) for (const t of cl.required ?? []) if (!order.includes(t)) order.push(t);
  for (const [, cl] of lists) for (const t of cl.optional ?? []) if (!order.includes(t)) order.push(t);
  const readers: Record<string, number> = {};
  for (const r of rs.rules) for (const d of ruleDocs(r)) readers[d] = (readers[d] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-3 text-pretty">
        The documents an institution uploads for each application category, as the active ruleset lists them. A solid block is
        required; a light block is optional and needed only in the situations its description gives.
      </p>
      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2/50 align-bottom">
                <th scope="col" className="px-4 py-3 text-xs font-semibold text-ink-3 sm:px-5">
                  Document
                </th>
                {lists.map(([code, cl]) => (
                  <th key={code} scope="col" className="w-[19%] px-3 py-3 text-sm font-semibold text-ink">
                    <span className="block leading-snug">{cl.label ?? humanize(code)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Tag variant="mono">{code}</Tag>
                      <SourceCite rs={rs} source={cl.source} />
                    </span>
                  </th>
                ))}
                <th scope="col" className="w-[13%] px-4 py-3 text-xs font-semibold text-ink-3 sm:pr-5">
                  Read by
                </th>
              </tr>
            </thead>
            <motion.tbody variants={stagger(0.03)} initial="hidden" animate="show">
              {order.map((t) => {
                const spec = rs.document_types[t] ?? {};
                const ver = (spec.verification ?? {}) as { issuer?: string; applicant_signed?: boolean; issuer_signers?: string[] };
                const n = readers[t] ?? 0;
                return (
                  <motion.tr key={t} variants={fadeUp} className="border-b border-line align-top last:border-b-0 hover:bg-surface-2/40">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="text-sm font-medium text-ink">{spec.label ?? humanize(t)}</div>
                      {spec.description && <p className="mt-0.5 max-w-[46ch] text-xs text-ink-3 text-pretty">{spec.description}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Tag variant="mono">{t}</Tag>
                        {ver.issuer && (
                          <Tooltip content="The reference number on this document is looked up with the issuing authority (simulated in this demo).">
                            <Link
                              to="/issuers"
                              className="inline-flex h-5 items-center gap-1 rounded-[5px] border border-line px-1.5 text-[11px] font-medium text-ink-2 transition-colors hover:border-brand-300 hover:text-brand-ink"
                            >
                              <Landmark className="size-3" aria-hidden /> {ver.issuer}
                            </Link>
                          </Tooltip>
                        )}
                        {ver.applicant_signed && (
                          <span className="inline-flex h-5 items-center gap-1 rounded-[5px] border border-line px-1.5 text-[11px] font-medium text-ink-2">
                            <PenLine className="size-3" aria-hidden /> Signed by the applicant
                          </span>
                        )}
                      </div>
                    </td>
                    {lists.map(([code, cl]) => (
                      <td key={code} className="px-3 py-3.5">
                        <NeedCell need={cl.required?.includes(t) ? "required" : cl.optional?.includes(t) ? "optional" : null} />
                      </td>
                    ))}
                    <td className="px-4 py-3 sm:pr-5">
                      {n ? (
                        <button
                          type="button"
                          onClick={() => onShowRules(t)}
                          className="group inline-flex items-center gap-1 rounded-control text-sm font-medium text-brand-ink hover:underline"
                        >
                          {n} {n === 1 ? "rule" : "rules"}
                          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                        </button>
                      ) : (
                        <span className="text-sm text-ink-4">None</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </motion.tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
