import { ChevronRight } from "lucide-react";
import { fmtDate } from "../../lib/format";
import { humanize } from "../../lib/labels";
import type { ActiveRuleset, Citation, Rule } from "../../types";
import { CitationCard } from "../application/parts";
import { Callout, DescriptionList, RULE_OUTCOME_LABEL, SeverityIndicator } from "../../ui2";
import { Expr, Template } from "./Expr";

const MESSAGE_ORDER: { key: string; outcome: string }[] = [
  { key: "fail", outcome: "fail" },
  { key: "insufficient", outcome: "insufficient_evidence" },
  { key: "pass", outcome: "pass" },
];

/** The expression a rule evaluates; presence checks are shown in the same notation so every rule reads alike. */
export function ruleExpr(rule: Rule): string {
  if (rule.check.type === "document_present" && rule.check.doc_type) return `document_present(doc.${rule.check.doc_type})`;
  if (rule.check.expr) return rule.check.expr;
  return humanize(rule.check.type);
}

interface AppliesTo {
  categories?: string[];
  when?: string;
  requires_docs?: string[];
}

/** Document types a rule reads, from its check and its preconditions. */
export function ruleDocs(rule: Rule): string[] {
  const a = (rule.applies_to ?? {}) as AppliesTo;
  const set = new Set<string>(a.requires_docs ?? []);
  if (rule.check.doc_type) set.add(rule.check.doc_type);
  for (const src of [rule.check.expr ?? "", a.when ?? ""]) {
    for (const m of src.matchAll(/\b(?:doc|ver)\.([a-z0-9_]+)/g)) set.add(m[1]);
  }
  return [...set];
}

export function sourceLink(rs: ActiveRuleset, doc: string | undefined, page: number | string | undefined): string | null {
  const src = rs.sources.find((s) => s.id === doc);
  if (!src?.url) return null;
  return /\.pdf$/i.test(src.url) && page ? `${src.url}#page=${page}` : src.url;
}

/** The rule's source with the title and link of the regulation it cites, in the shape CitationCard reads. */
function citationOf(rule: Rule, rs: ActiveRuleset): Citation | null {
  const c = rule.source;
  if (!c) return null;
  return {
    ...c,
    doc_title: c.doc_title ?? (rs.sources.find((s) => s.id === c.doc)?.title as string | undefined) ?? c.doc,
    doc_url: c.doc_url ?? sourceLink(rs, c.doc, c.page),
  };
}

export interface RuleRowProps {
  rule: Rule;
  rs: ActiveRuleset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** One rule as a native disclosure: the summary line, then the expression, citation and messages. */
export function RuleRow({ rule, rs, open, onOpenChange }: RuleRowProps) {
  const a = (rule.applies_to ?? {}) as AppliesTo;
  const docs = ruleDocs(rule);
  const messages = MESSAGE_ORDER.filter((m) => rule.messages?.[m.key]);
  const citation = citationOf(rule, rs);
  const label = (code: string) => (rs.checklists[code]?.label ?? code).replace(/\s*\(.*\)$/, "");

  return (
    <details open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="group">
      <summary className="grid cursor-pointer list-none grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-2 md:grid-cols-[16px_200px_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="mt-0.5 size-4 text-ink-3 group-open:rotate-90" />
        <code className="hidden pt-0.5 font-mono text-xs text-ink-2 md:block">{rule.id}</code>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{rule.title}</span>
          <code className="block font-mono text-xs text-ink-3 md:hidden">{rule.id}</code>
        </span>
        <span className="flex items-center gap-4">
          {rule.severity && <SeverityIndicator severity={rule.severity} className="w-24" />}
          {rule.version !== undefined && <span className="w-8 text-right text-xs text-ink-3">v{rule.version}</span>}
        </span>
      </summary>
      <div className="space-y-4 px-5 pt-1 pb-5 md:pl-12">
        <DescriptionList
          labelWidth={128}
          items={[
            { label: "Checks", value: <Expr src={ruleExpr(rule)} docTypes={rs.document_types} /> },
            { label: "Only when", value: a.when ? <Expr src={a.when} docTypes={rs.document_types} /> : null, hidden: !a.when },
            {
              label: "Documents read",
              value: docs.length ? docs.map((d) => rs.document_types[d]?.label ?? humanize(d)).join(", ") : null,
              hidden: !docs.length,
            },
            { label: "Applies to", value: a.categories?.length ? a.categories.map(label).join(", ") : null, hidden: !a.categories?.length },
            {
              label: "In force from",
              value: rule.effective_from ? `${fmtDate(rule.effective_from)}${rule.effective_to ? ` to ${fmtDate(rule.effective_to)}` : ""}` : null,
            },
          ]}
        />
        {citation && (
          <div>
            <CitationCard citation={citation} />
            {citation.doc === "CONFIG" && <p className="mt-1.5 text-xs text-ink-3">Configuration, not a regulation.</p>}
          </div>
        )}
        {messages.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-ink">What the finding says</h4>
            <DescriptionList
              labelWidth={128}
              items={messages.map((m) => ({
                label: RULE_OUTCOME_LABEL[m.outcome] ?? humanize(m.key),
                value: <Template text={rule.messages?.[m.key] ?? ""} docTypes={rs.document_types} />,
              }))}
            />
          </div>
        )}
        {rule.limitation && (
          <Callout tone="neutral" title="Limitation">
            {rule.limitation}
          </Callout>
        )}
      </div>
    </details>
  );
}
