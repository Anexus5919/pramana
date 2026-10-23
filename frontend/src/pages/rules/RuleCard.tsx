import { ChevronDown, ExternalLink, FileText, Info, Quote } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { fmtDate } from "../../lib/format";
import { humanize, outcomeMeta } from "../../lib/labels";
import type { ActiveRuleset, Rule } from "../../types";
import { Badge, Tag } from "../../ui/Badge";
import { SeverityMeter } from "../../ui/Blocks";
import { Card } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";
import { Tooltip } from "../../ui/Tooltip";
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

function Citation({ rule, rs }: { rule: Rule; rs: ActiveRuleset }) {
  const c = rule.source;
  if (!c) return null;
  const href = sourceLink(rs, c.doc, c.page);
  const title = rs.sources.find((s) => s.id === c.doc)?.title;
  return (
    <figure className="relative rounded-[12px] border-l-[3px] border-brand-400 bg-brand-soft/50 py-3 pr-4 pl-4">
      <Quote aria-hidden className="absolute top-3 right-3 size-4 text-brand-300" />
      {c.quote && <blockquote className="pr-6 text-sm leading-relaxed text-ink-2 text-pretty">{c.quote}</blockquote>}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span className="font-semibold text-ink-2">{c.doc}</span>
        {c.section && <span>{c.section}</span>}
        {c.page !== undefined && <span>page {c.page}</span>}
        {title && <span className="hidden truncate sm:inline">· {title}</span>}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="relative z-[2] inline-flex items-center gap-1 font-medium text-brand-ink hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Open source <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {c.doc === "CONFIG" && <Tag>Configuration, not a regulation</Tag>}
      </figcaption>
    </figure>
  );
}

export interface RuleCardProps {
  rule: Rule;
  rs: ActiveRuleset;
  open: boolean;
  onToggle: () => void;
}

export function RuleCard({ rule, rs, open, onToggle }: RuleCardProps) {
  const a = (rule.applies_to ?? {}) as AppliesTo;
  const docs = ruleDocs(rule);
  const messages = MESSAGE_ORDER.filter((m) => rule.messages?.[m.key]);
  const panelId = `rule-${rule.id}-detail`;
  return (
    <motion.div layout="position" transition={{ duration: dur.panel, ease: ease.out }}>
      <Card interactive className={cn("transition-colors", open && "border-brand-200")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          <span className="sr-only">
            {open ? "Hide" : "Show"} citation and messages for {rule.id}
          </span>
        </button>
        <div className="pointer-events-none relative z-[1] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="font-mono text-xs font-semibold text-ink-2">{rule.id}</span>
                {rule.version !== undefined && <Tag variant="mono">v{rule.version}</Tag>}
                <SeverityMeter severity={rule.severity} label />
              </div>
              <h3 className="mt-1.5 font-display text-[16px] leading-snug font-semibold tracking-title text-ink text-pretty">{rule.title}</h3>
            </div>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: dur.ui, ease: ease.out }}
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-ink-3 group-hover/card:bg-surface-2 group-hover/card:text-ink"
              aria-hidden
            >
              <ChevronDown className="size-4" />
            </motion.span>
          </div>

          <div className="pointer-events-auto mt-3">
            <Expr src={ruleExpr(rule)} docTypes={rs.document_types} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-3">
            {a.categories?.length ? (
              <span className="pointer-events-auto inline-flex flex-wrap items-center gap-1">
                {a.categories.map((c) => (
                  <Tooltip key={c} content={rs.checklists[c]?.label ?? c}>
                    <span tabIndex={0} className="outline-none">
                      <Tag variant="mono">{c}</Tag>
                    </span>
                  </Tooltip>
                ))}
              </span>
            ) : null}
            {docs.length > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <FileText className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 text-ink-2">{docs.map((d) => rs.document_types[d]?.label ?? humanize(d)).join(", ")}</span>
              </span>
            )}
            <span className="tabular">
              In force from {fmtDate(rule.effective_from)}
              {rule.effective_to ? ` to ${fmtDate(rule.effective_to)}` : ""}
            </span>
          </div>

          {a.when && (
            <div className="pointer-events-auto mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-medium text-ink-3">Only when</span>
              <Expr src={a.when} docTypes={rs.document_types} className="inline-block px-2 py-0.5" />
            </div>
          )}

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                id={panelId}
                key="detail"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: dur.panel, ease: ease.out }}
                className="pointer-events-auto overflow-hidden"
              >
                <div className="space-y-4 pt-4">
                  <Citation rule={rule} rs={rs} />
                  {messages.length > 0 && (
                    <div>
                      <div className="eyebrow mb-2">What the finding says</div>
                      <dl className="grid gap-x-3 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                        {messages.map((m) => (
                          <div key={m.key} className="contents">
                            <dt>
                              <Badge tone={outcomeMeta[m.outcome]?.tone ?? "neutral"} variant="dot">
                                {outcomeMeta[m.outcome]?.label ?? humanize(m.key)}
                              </Badge>
                            </dt>
                            <dd className="min-w-0 pt-0.5 text-sm text-ink-2 text-pretty">
                              <Template text={rule.messages?.[m.key] ?? ""} docTypes={rs.document_types} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                  {rule.limitation && (
                    <div className="flex items-start gap-2.5 rounded-[10px] border border-line bg-surface-2/60 px-3 py-2.5">
                      <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                      <p className="text-sm text-ink-2 text-pretty">
                        <span className="font-semibold text-ink">Limitation.</span> {rule.limitation}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}
