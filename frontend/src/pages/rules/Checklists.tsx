import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { humanize } from "../../lib/labels";
import type { ActiveRuleset, Citation } from "../../types";
import { Button, DataTable, Panel, SimulatedTag, type Column } from "../../ui2";
import { issuerName } from "../issuers/issuer";
import { ruleDocs, sourceLink } from "./RuleRow";

type Need = "required" | "optional" | null;

interface Row {
  type: string;
  label: string;
  description?: string;
  issuer?: string;
  applicantSigned: boolean;
  rules: number;
  needs: Record<string, Need>;
}

function shortLabel(label: string | undefined, code: string): string {
  return (label ?? humanize(code)).replace(/\s*\(.*\)$/, "");
}

function SourceCite({ rs, source }: { rs: ActiveRuleset; source: unknown }) {
  const c = (source ?? {}) as Citation;
  if (!c.doc) return null;
  const href = sourceLink(rs, c.doc, c.page);
  const text = [c.doc, c.section, c.page !== undefined ? `page ${c.page}` : null].filter(Boolean).join(", ");
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );
}

/** Which documents each application category needs, side by side, and how many rules read each one. */
export function Checklists({ rs, onShowRules }: { rs: ActiveRuleset; onShowRules: (docType: string) => void }) {
  const issuers = useQuery({ queryKey: qk.issuers, queryFn: api.simIssuers, staleTime: 60_000 });
  const lists = useMemo(() => Object.entries(rs.checklists), [rs]);

  const rows = useMemo<Row[]>(() => {
    const order: string[] = [];
    for (const [, cl] of lists) for (const t of cl.required ?? []) if (!order.includes(t)) order.push(t);
    for (const [, cl] of lists) for (const t of cl.optional ?? []) if (!order.includes(t)) order.push(t);
    const readers: Record<string, number> = {};
    for (const r of rs.rules) for (const d of ruleDocs(r)) readers[d] = (readers[d] ?? 0) + 1;
    return order.map((t) => {
      const spec = rs.document_types[t] ?? {};
      const ver = (spec.verification ?? {}) as { issuer?: string; applicant_signed?: boolean };
      return {
        type: t,
        label: spec.label ?? humanize(t),
        description: spec.description,
        issuer: ver.issuer,
        applicantSigned: !!ver.applicant_signed,
        rules: readers[t] ?? 0,
        needs: Object.fromEntries(lists.map(([code, cl]) => [code, cl.required?.includes(t) ? "required" : cl.optional?.includes(t) ? "optional" : null])),
      };
    });
  }, [rs, lists]);

  const nameOf = (code: string) => {
    const i = issuers.data?.find((x) => x.code === code);
    return i ? issuerName(i) : code;
  };

  const columns: Column<Row>[] = [
    {
      id: "type",
      header: "Document type",
      sortValue: (r) => r.label,
      cell: (r) => (
        <span className="block min-w-0 py-2">
          <span className="block font-medium text-ink">{r.label}</span>
          <code className="block font-mono text-xs text-ink-3">{r.type}</code>
        </span>
      ),
    },
    ...lists.map(
      ([code, cl]): Column<Row> => ({
        id: `need-${code}`,
        header: (
          <span title={cl.label ?? code} className="inline-block max-w-40 whitespace-normal">
            {shortLabel(cl.label, code)}
          </span>
        ),
        sortValue: (r) => (r.needs[code] === "required" ? 0 : r.needs[code] === "optional" ? 1 : 2),
        cell: (r) =>
          r.needs[code] === "required" ? (
            <span className="font-medium text-ink">Required</span>
          ) : r.needs[code] === "optional" ? (
            <span className="text-ink-2">Optional</span>
          ) : (
            <span className="text-ink-3">Not listed</span>
          ),
      }),
    ),
    {
      id: "issuer",
      header: "Issuer",
      hideBelow: "lg",
      cell: (r) =>
        r.issuer ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link to={`/issuers?code=${encodeURIComponent(r.issuer)}`} className="text-ink underline-offset-2 hover:underline">
              {nameOf(r.issuer)}
            </Link>
            <SimulatedTag />
          </span>
        ) : (
          <span className="text-ink-3">None</span>
        ),
    },
    {
      id: "signed",
      header: "Applicant signed",
      hideBelow: "2xl",
      cell: (r) => <span className={r.applicantSigned ? "text-ink" : "text-ink-3"}>{r.applicantSigned ? "Yes" : "No"}</span>,
    },
    {
      id: "rules",
      header: "Rules",
      align: "right",
      sortValue: (r) => r.rules,
      cell: (r) =>
        r.rules ? (
          <Button size="sm" variant="ghost" onClick={() => onShowRules(r.type)} aria-label={`Show the ${r.rules} rules that read ${r.label}`}>
            {r.rules} {r.rules === 1 ? "rule" : "rules"}
          </Button>
        ) : (
          <span className="text-ink-3">None</span>
        ),
    },
  ];

  return (
    <Panel
      title="Documents by application category"
      description={
        <>
          What an institution uploads for each category, as the active ruleset lists them. Sources:{" "}
          {lists.map(([code, cl], i) => (
            <Fragment key={code}>
              {i > 0 && "; "}
              {shortLabel(cl.label, code)}, <SourceCite rs={rs} source={cl.source} />
            </Fragment>
          ))}
          .
        </>
      }
      padding="none"
    >
      <div className="border-t border-line">
        <DataTable label="Documents required by each application category" rows={rows} columns={columns} rowKey={(r) => r.type} density="compact" />
      </div>
    </Panel>
  );
}
