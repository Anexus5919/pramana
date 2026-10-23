import { Fragment, type ReactNode } from "react";
import { humanize } from "../../lib/labels";
import type { DocumentTypeSpec } from "../../types";
import { cn } from "../../ui/cn";
import { Tooltip } from "../../ui/Tooltip";

/** Where a value in a rule comes from. Colour is reserved for these so the eye can tell inputs apart. */
export const NAMESPACES: Record<string, { label: string; meaning: string; cls: string; dot: string }> = {
  doc: {
    label: "Document",
    meaning: "A value read from an uploaded document: doc.<document type>.<field>.",
    cls: "text-pending-fg",
    dot: "bg-pending-dot",
  },
  app: {
    label: "Application",
    meaning: "A value the institution declared in its application form.",
    cls: "text-brand-ink",
    dot: "bg-brand-500",
  },
  ref: {
    label: "Reference record",
    meaning: "A record AICTE already holds, such as fee payments or the approval history.",
    cls: "text-verified-fg",
    dot: "bg-verified-dot",
  },
  ver: {
    label: "Verification",
    meaning: "The outcome of a verification channel for a document, such as its digital signature.",
    cls: "text-expired-fg",
    dot: "bg-expired-dot",
  },
  derived: {
    label: "Derived",
    meaning: "A value computed from other facts, such as the faculty required for the declared intake.",
    cls: "text-manual-fg",
    dot: "bg-manual-dot",
  },
  inst: {
    label: "Institution record",
    meaning: "The institution's master record: name, society, location.",
    cls: "text-sev-critical",
    dot: "bg-sev-critical",
  },
};

const FUNCTIONS: Record<string, string> = {
  len: "Number of items in a list.",
  lower: "The text in lower case, for a match that ignores capitals.",
  similar: "Text similarity from 0 to 100 that tolerates spelling, spacing and abbreviation differences.",
  geo_km: "Distance in kilometres between two coordinates.",
  days_between: "Whole days between two dates.",
  date: "A fixed calendar date.",
  join: "A list joined into readable text.",
  document_present: "True when a current document of this type has been uploaded.",
};

const IDENTS: Record<string, string> = {
  as_of: "The date the check is evaluated on, normally the date of submission.",
};

const KEYWORDS = new Set(["and", "or", "not", "in", "is", "True", "False", "None", "true", "false", "null"]);

const TOKEN = /\s+|'[^']*'|"[^"]*"|\d+(?:\.\d+)?|>=|<=|==|!=|[<>+\-*/%]|[()[\],]|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|./g;

type Tok = { kind: "ws" | "str" | "num" | "op" | "kw" | "punct" | "fn" | "ns" | "ident"; v: string };

export function tokenize(src: string): Tok[] {
  const raw = src.match(TOKEN) ?? [];
  const out: Tok[] = [];
  raw.forEach((v, i) => {
    let kind: Tok["kind"];
    if (/^\s+$/.test(v)) kind = "ws";
    else if (/^['"]/.test(v)) kind = "str";
    else if (/^\d/.test(v)) kind = "num";
    else if (/^(>=|<=|==|!=|[<>+\-*/%])$/.test(v)) kind = "op";
    else if (/^[()[\],]$/.test(v)) kind = "punct";
    else if (KEYWORDS.has(v)) kind = "kw";
    else if (/^[A-Za-z_]/.test(v)) {
      let j = i + 1;
      while (j < raw.length && /^\s+$/.test(raw[j])) j++;
      if (raw[j] === "(" && !v.includes(".")) kind = "fn";
      else if (v.includes(".") && v.split(".")[0] in NAMESPACES) kind = "ns";
      else kind = "ident";
    } else kind = "punct";
    out.push({ kind, v });
  });
  return out;
}

function nsTip(path: string, docTypes: Record<string, DocumentTypeSpec>): ReactNode {
  const [ns, ...rest] = path.split(".");
  const meta = NAMESPACES[ns];
  let detail: ReactNode = null;
  if ((ns === "doc" || ns === "ver") && rest.length) {
    const label = docTypes[rest[0]]?.label ?? humanize(rest[0]);
    detail = (
      <span className="block">
        {label}
        {rest[1] ? `, ${humanize(rest.slice(1).join("."))}` : ""}
      </span>
    );
  } else if (rest.length) {
    detail = <span className="block">{humanize(rest.join("."))}</span>;
  }
  return (
    <span className="block">
      <span className="block font-semibold">{meta.label}</span>
      {detail}
      <span className="mt-0.5 block opacity-75">{meta.meaning}</span>
    </span>
  );
}

/** A rule expression with inputs tinted by where they come from; hover a value or a function for its meaning. */
export function Expr({ src, docTypes, className }: { src: string; docTypes: Record<string, DocumentTypeSpec>; className?: string }) {
  const toks = tokenize(src);
  return (
    <code
      className={cn(
        "block rounded-[10px] border border-line bg-surface-2/70 px-3 py-2 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-ink-2",
        className,
      )}
    >
      {toks.map((t, i) => {
        switch (t.kind) {
          case "ns": {
            const [ns, ...rest] = t.v.split(".");
            return (
              <Tooltip key={i} content={nsTip(t.v, docTypes)}>
                <span className={cn("cursor-help rounded-[3px] decoration-dotted underline-offset-[3px] hover:underline", NAMESPACES[ns].cls)}>
                  <span className="font-semibold">{ns}</span>
                  <span className="opacity-90">.{rest.join(".")}</span>
                </span>
              </Tooltip>
            );
          }
          case "fn":
            return FUNCTIONS[t.v] ? (
              <Tooltip key={i} content={FUNCTIONS[t.v]}>
                <span className="cursor-help font-semibold text-ink decoration-dotted underline-offset-[3px] hover:underline">{t.v}</span>
              </Tooltip>
            ) : (
              <span key={i} className="font-semibold text-ink">
                {t.v}
              </span>
            );
          case "ident":
            return IDENTS[t.v] ? (
              <Tooltip key={i} content={IDENTS[t.v]}>
                <span className="cursor-help font-semibold text-ink italic decoration-dotted underline-offset-[3px] hover:underline">{t.v}</span>
              </Tooltip>
            ) : (
              <span key={i} className="text-ink">
                {t.v}
              </span>
            );
          case "str":
            return (
              <span key={i} className="text-ink">
                <span className="text-ink-4">{t.v[0]}</span>
                {t.v.slice(1, -1)}
                <span className="text-ink-4">{t.v[t.v.length - 1]}</span>
              </span>
            );
          case "num":
            return (
              <span key={i} className="font-semibold text-ink">
                {t.v}
              </span>
            );
          case "kw":
            return (
              <span key={i} className="font-medium text-ink-3 italic">
                {t.v}
              </span>
            );
          case "op":
            return (
              <span key={i} className="text-ink-3">
                {t.v}
              </span>
            );
          default:
            return <Fragment key={i}>{t.v}</Fragment>;
        }
      })}
    </code>
  );
}

/** Message template with {placeholders} shown as the values the engine fills in. */
export function Template({ text, docTypes }: { text: string; docTypes: Record<string, DocumentTypeSpec> }) {
  const parts = text.split(/(\{[a-z0-9_]+\})/gi);
  const types = Object.keys(docTypes).sort((a, b) => b.length - a.length);
  const label = (key: string) => {
    const t = types.find((d) => key.startsWith(`doc_${d}_`));
    return humanize(t ? key.slice(t.length + 5) : key.replace(/^(app|ref|derived|inst)_/, ""));
  };
  return (
    <>
      {parts.map((p, i) =>
        /^\{[a-z0-9_]+\}$/i.test(p) ? (
          <span key={i} className="mx-0.5 rounded-[4px] bg-surface-3 px-1 font-mono text-[11.5px] text-ink-2">
            {label(p.slice(1, -1))}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Colour key for the namespaces. */
export function NamespaceLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3", className)}>
      <span className="font-medium text-ink-2">Values come from</span>
      {Object.entries(NAMESPACES).map(([k, m]) => (
        <Tooltip key={k} content={m.meaning}>
          <span tabIndex={0} className="inline-flex cursor-help items-center gap-1.5 rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <span aria-hidden className={cn("size-2 rounded-[2px]", m.dot)} />
            <span className={cn("font-mono font-semibold", m.cls)}>{k}</span>
            <span>{m.label}</span>
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
