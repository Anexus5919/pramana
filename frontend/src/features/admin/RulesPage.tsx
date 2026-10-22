import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { BookOpen, ChevronRight, ExternalLink, GitCompareArrows, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { OutcomePill, SeverityChip, Tag } from "../../components/ui/Badge";
import { Card, CardHeader } from "../../components/ui/Card";
import { Digest } from "../../components/ui/Digest";
import { Callout, EmptyState, ErrorBanner, PageLoading, Skeleton } from "../../components/ui/Feedback";
import { Select } from "../../components/ui/Field";
import { fmtDate, fmtValue } from "../../lib/format";
import { CATEGORIES, categoryMeta, humanize } from "../../lib/labels";
import type { ActiveRuleset, Rule } from "../../types";
import { CitationBlock } from "../application/evidence/Citation";
import { appPath } from "../application/links";
import { PageHeader } from "../shared/Summaries";

function checkText(r: Rule): string {
  const c = r.check ?? { type: "unknown" };
  if (c.expr) return c.expr;
  if (c.date) return `${c.date} >= as_of`;
  if (c.doc_types) return `document present: ${c.doc_types.join(" or ")}${c.min ? ` (at least ${String(c.min)})` : ""}`;
  if (c.doc_type) return `document present: ${c.doc_type}`;
  return JSON.stringify(c);
}

function RulesTable({ rs }: { rs: ActiveRuleset }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rs.rules.filter(
      (r) => (!cat || r.category === cat) && (!needle || `${r.id} ${r.title} ${checkText(r)}`.toLowerCase().includes(needle)),
    );
  }, [rs.rules, q, cat]);

  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <Card aria-labelledby="rules-title">
      <CardHeader
        id="rules-title"
        title={`Rules (${rs.rules.length})`}
        subtitle="Each rule is versioned, effective-dated and cites the clause it encodes. Expand a rule to read its quote and messages."
        actions={
          <div className="flex items-center gap-2">
            <label className="relative block">
              <span className="sr-only">Search rules</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle-fg" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search rules"
                className="h-8 w-52 rounded-md border border-line-strong bg-surface pr-2 pl-7 text-xs text-fg placeholder:text-subtle-fg focus-visible:outline-2 focus-visible:outline-ring/50"
              />
            </label>
            <Select aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)} className="h-8 w-44 py-0 text-xs">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryMeta[c].label}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle/60 text-left text-[11px] tracking-wider text-subtle-fg uppercase">
              <th scope="col" className="w-8 py-2 pl-3" />
              <th scope="col" className="px-2 py-2 font-semibold">Rule</th>
              <th scope="col" className="px-2 py-2 font-semibold">Version / effective</th>
              <th scope="col" className="px-2 py-2 font-semibold">Category</th>
              <th scope="col" className="px-2 py-2 font-semibold">Applies to</th>
              <th scope="col" className="px-2 py-2 font-semibold">Source</th>
              <th scope="col" className="px-2 py-2 pr-4 font-semibold">Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const expanded = open.has(r.id);
              const src = r.source ?? {};
              const doc = rs.sources.find((s) => s.id === src.doc);
              const applies = r.applies_to ?? {};
              return (
                <Fragment key={r.id}>
                  <tr className={clsx("border-b border-line align-top", expanded && "bg-subtle/40")}>
                    <td className="py-2.5 pl-3">
                      <button
                        type="button"
                        onClick={() => toggle(r.id)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "Show"} details for ${r.id}`}
                        className="rounded p-0.5 text-subtle-fg hover:bg-subtle hover:text-fg"
                      >
                        <ChevronRight className={clsx("size-4 transition-transform", expanded && "rotate-90")} />
                      </button>
                    </td>
                    <td className="max-w-[280px] px-2 py-2.5">
                      <div className="font-mono text-[11px] text-subtle-fg">{r.id}</div>
                      <div className="font-medium text-fg">{r.title}</div>
                    </td>
                    <td className="px-2 py-2.5 text-xs whitespace-nowrap text-muted">
                      <div className="text-fg">v{fmtValue(r.version)}</div>
                      <div>from {r.effective_from ? fmtDate(String(r.effective_from)) : "always"}</div>
                      <div>to {r.effective_to ? fmtDate(String(r.effective_to)) : "open"}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        {r.category && <Tag>{categoryMeta[r.category]?.label ?? humanize(r.category)}</Tag>}
                        {r.severity && <SeverityChip severity={r.severity} />}
                      </div>
                    </td>
                    <td className="max-w-[180px] px-2 py-2.5 text-xs text-muted">
                      {applies.categories?.length ? applies.categories.join(", ") : "All categories"}
                      {applies.when && <div className="mt-0.5 font-mono text-[11px] text-fg">when {applies.when}</div>}
                    </td>
                    <td className="max-w-[220px] px-2 py-2.5 text-xs text-muted">
                      <span className="font-medium text-fg">{doc?.title ?? src.doc ?? "Not cited"}</span>
                      {src.section && <span>, {src.section}</span>}
                      {src.page && <span>, p. {src.page}</span>}
                    </td>
                    <td className="max-w-[300px] px-2 py-2.5 pr-4">
                      <code className="line-clamp-3 font-mono text-[11px] break-words text-fg">{checkText(r)}</code>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-line bg-subtle/40">
                      <td />
                      <td colSpan={6} className="px-2 pt-1 pb-4 pr-4">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <CitationBlock citation={{ ...src, doc_title: doc?.title ?? null, doc_url: doc?.url ?? null }} />
                          <div className="space-y-2 text-xs">
                            <div>
                              <p className="font-medium text-muted">Check ({r.check?.type})</p>
                              <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-surface p-2 font-mono text-[11px] whitespace-pre-wrap text-fg">
                                {checkText(r)}
                              </pre>
                            </div>
                            {r.messages && (
                              <div>
                                <p className="font-medium text-muted">Messages</p>
                                <ul className="mt-1 space-y-1">
                                  {Object.entries(r.messages).map(([k, v]) => (
                                    <li key={k} className="flex gap-2">
                                      <OutcomePill outcome={k === "insufficient" ? "insufficient_evidence" : k} />
                                      <span className="text-fg">{v}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {r.limitation && <Callout tone="caution">{r.limitation}</Callout>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <EmptyState title="No rules match" />}
      </div>
    </Card>
  );
}

function Impact() {
  const q = useQuery({ queryKey: qk.impact, queryFn: api.ruleImpact });
  return (
    <Card aria-labelledby="impact-title">
      <CardHeader
        id="impact-title"
        icon={<GitCompareArrows className="size-4" />}
        title="Rule change impact"
        subtitle="Applications whose latest run used an older ruleset, re-evaluated under the active one without saving a new run"
      />
      <div className="p-4">
        {q.isPending ? (
          <Skeleton className="h-24" />
        ) : q.error ? (
          <ErrorBanner error={q.error} title="Could not compute the impact" />
        ) : q.data.affected.length === 0 ? (
          <p className="text-sm text-muted">
            No application would change outcome. Every latest run already uses{" "}
            <span className="font-mono text-xs text-fg">{q.data.active_ruleset}</span>, or the change does not alter any result.
          </p>
        ) : (
          <ul className="space-y-3">
            {q.data.affected.map((a) => (
              <li key={a.application_id} className="rounded-md border border-line p-3">
                <Link to={appPath(a.application_id, "checklist")} className="text-sm font-medium text-fg hover:text-primary-ink hover:underline">
                  {a.institution}
                </Link>
                <span className="ml-2 font-mono text-[11px] text-subtle-fg">{a.application_id}</span>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] tracking-wider text-subtle-fg uppercase">
                      <th scope="col" className="py-1 font-semibold">Rule</th>
                      <th scope="col" className="py-1 font-semibold">Before</th>
                      <th scope="col" className="py-1 font-semibold">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.changes.map((c) => (
                      <tr key={c.rule_id} className="border-t border-line">
                        <td className="py-1 font-mono text-[11px]">{c.rule_id}</td>
                        <td className="py-1">{c.before ? <OutcomePill outcome={c.before} /> : <span className="text-subtle-fg">Not evaluated</span>}</td>
                        <td className="py-1">{c.after ? <OutcomePill outcome={c.after} /> : <span className="text-subtle-fg">Not evaluated</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function RulesPage() {
  const { is } = useAuth();
  const q = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  if (q.isPending) return <PageLoading label="Loading ruleset" />;
  if (q.error) return <ErrorBanner error={q.error} title="Could not load the ruleset" />;
  const rs = q.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rules"
        eyebrow="Active ruleset"
        subtitle={rs.title}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              <span className="text-subtle-fg">ID</span> <span className="font-mono text-fg">{rs.id}@{rs.version}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-subtle-fg">SHA-256</span> <Digest value={rs.sha256} length={16} label="ruleset hash" />
            </span>
          </div>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card aria-labelledby="sources-title">
          <CardHeader id="sources-title" icon={<BookOpen className="size-4" />} title="Sources" subtitle="Documents the rules cite" />
          <ul className="divide-y divide-line">
            {rs.sources.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{s.title ?? s.id}</p>
                  <p className="text-xs text-subtle-fg">
                    <span className="font-mono">{s.id}</span>
                    {typeof s.published === "string" && <> | published {fmtDate(s.published)}</>}
                  </p>
                </div>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-ink hover:underline"
                  >
                    Open <ExternalLink aria-hidden className="size-3" />
                    <span className="sr-only">{s.title} (opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card aria-labelledby="checklists-title">
          <CardHeader id="checklists-title" title="Document checklists" subtitle="Required and optional uploads by application category" />
          <ul className="divide-y divide-line">
            {Object.entries(rs.checklists).map(([code, c]) => (
              <li key={code} className="px-4 py-2.5">
                <p className="text-sm font-medium text-fg">{c.label ?? code}</p>
                <p className="font-mono text-[11px] text-subtle-fg">{code}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(c.required ?? []).map((t) => (
                    <Tag key={t} className="border-primary/30 text-primary-ink">
                      {rs.document_types[t]?.label ?? t}
                    </Tag>
                  ))}
                  {(c.optional ?? []).map((t) => (
                    <Tag key={t} className="border-dashed">
                      {rs.document_types[t]?.label ?? t} (optional)
                    </Tag>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <RulesTable rs={rs} />
      {is("officer", "admin") && <Impact />}
    </div>
  );
}
