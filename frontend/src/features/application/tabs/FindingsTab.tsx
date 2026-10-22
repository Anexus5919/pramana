import type { UseQueryResult } from "@tanstack/react-query";
import clsx from "clsx";
import { ListChecks, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { EvidenceClassBadge, ReviewStatusPill, SeverityChip, SimulatedBadge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { EmptyState, ErrorBanner, Skeleton } from "../../../components/ui/Feedback";
import { Select } from "../../../components/ui/Field";
import {
  CATEGORIES,
  categoryMeta,
  EVIDENCE_CLASSES,
  evidenceClassMeta,
  reviewStatusMeta,
  SEVERITIES,
  severityRank,
} from "../../../lib/labels";
import type { ApplicationDetail, DocumentSummary, Finding } from "../../../types";
import { useLabels } from "../../shared/useRuleset";
import { FindingDetail, isSimulatedFinding } from "../findings/FindingDetail";

export function FindingsTab({
  app,
  findingsQuery,
  onRectify,
}: {
  app: ApplicationDetail;
  findingsQuery: UseQueryResult<Finding[]>;
  onRectify: (ids: string[]) => void;
}) {
  const [params, setParams] = useSearchParams();
  const { docType } = useLabels();
  const selectedId = params.get("finding");
  const ec = params.get("ec") ?? "";
  const sev = params.get("sev") ?? "";
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const detailRef = useRef<HTMLDivElement>(null);

  const docs = useMemo(() => {
    const m: Record<string, DocumentSummary> = {};
    for (const d of app.documents) m[d.id] = d;
    return m;
  }, [app.documents]);

  const all = findingsQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((f) => (!ec || f.evidence_class === ec) && (!sev || f.severity === sev) && (!status || f.review_status === status))
      .filter((f) => !needle || `${f.title} ${f.message} ${f.code}`.toLowerCase().includes(needle))
      .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || a.title.localeCompare(b.title));
  }, [all, ec, sev, status, q]);

  const extraCats = [...new Set(all.map((f) => f.category))].filter((c) => !(CATEGORIES as readonly string[]).includes(c));
  const groups = [...CATEGORIES, ...extraCats]
    .map((c) => ({ c, items: filtered.filter((f) => f.category === c) }))
    .filter((g) => g.items.length);

  const selected = all.find((f) => f.id === selectedId) ?? null;
  const firstShown = groups[0]?.items[0]?.id;

  useEffect(() => {
    if (!selectedId && firstShown) {
      const p = new URLSearchParams(params);
      p.set("finding", firstShown);
      setParams(p, { replace: true });
    }
  }, [selectedId, firstShown, params, setParams]);

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  }

  function select(id: string) {
    setParam("finding", id);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }

  if (findingsQuery.isPending) return <Skeleton className="h-96" />;
  if (findingsQuery.error) return <ErrorBanner error={findingsQuery.error} title="Could not load findings" />;
  if (!all.length) {
    return (
      <Card>
        <EmptyState icon={<ListChecks className="size-6" />} title="No findings">
          {app.latest_run ? "The latest run produced no findings." : "Run a validation to produce findings."}
        </EmptyState>
      </Card>
    );
  }

  const filtersActive = !!(ec || sev || status || q);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <label className="relative col-span-3 block">
            <span className="sr-only">Search findings</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle-fg" />
            <input
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Search"
              className="h-8 w-full rounded-md border border-line-strong bg-surface pr-2 pl-7 text-xs text-fg placeholder:text-subtle-fg focus-visible:outline-2 focus-visible:outline-ring/50"
            />
          </label>
          <Select aria-label="Filter by evidence class" value={ec} onChange={(e) => setParam("ec", e.target.value)} className="h-8 py-0 text-xs">
            <option value="">All evidence classes</option>
            {EVIDENCE_CLASSES.map((c) => (
              <option key={c} value={c}>
                E{evidenceClassMeta[c].level} {evidenceClassMeta[c].label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by severity" value={sev} onChange={(e) => setParam("sev", e.target.value)} className="h-8 py-0 text-xs">
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by review status" value={status} onChange={(e) => setParam("status", e.target.value)} className="h-8 py-0 text-xs">
            <option value="">All review states</option>
            {Object.entries(reviewStatusMeta).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>
            Showing {filtered.length} of {all.length} findings
          </span>
          {filtersActive && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-primary-ink hover:bg-primary-soft"
              onClick={() => {
                const p = new URLSearchParams();
                if (selectedId) p.set("finding", selectedId);
                setParams(p, { replace: true });
              }}
            >
              <X aria-hidden className="size-3" /> Clear filters
            </button>
          )}
        </div>
        {groups.length === 0 ? (
          <Card>
            <EmptyState title="No findings match these filters" />
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.c} aria-labelledby={`cat-${g.c}`}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <h3 id={`cat-${g.c}`} className="text-[11px] font-semibold tracking-wider text-subtle-fg uppercase">
                    {categoryMeta[g.c]?.label ?? g.c}
                    <span className="ml-1.5 font-medium text-muted">{g.items.length}</span>
                  </h3>
                  <span className="truncate pl-2 text-[11px] text-subtle-fg">{categoryMeta[g.c]?.meaning}</span>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
                  {g.items.map((f) => {
                    const active = f.id === selectedId;
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => select(f.id)}
                          aria-current={active ? "true" : undefined}
                          className={clsx(
                            "relative block w-full px-3.5 py-2.5 text-left transition-colors",
                            active ? "bg-primary-soft/70" : "hover:bg-subtle/60",
                            f.review_status === "dismissed" && "opacity-65",
                          )}
                        >
                          {active && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary-ink" />}
                          <span className="flex flex-wrap items-center gap-1.5">
                            <SeverityChip severity={f.severity} />
                            <EvidenceClassBadge evidenceClass={f.evidence_class} />
                            {isSimulatedFinding(f) && <SimulatedBadge />}
                            <span className="ml-auto">
                              <ReviewStatusPill status={f.review_status} />
                            </span>
                          </span>
                          <span className="mt-1.5 block text-sm leading-snug font-medium text-fg">{f.title}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{f.message}</span>
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-subtle-fg">
                            <span className="font-mono">{f.code}</span>
                            {f.document_id && docs[f.document_id] && (
                              <span className="truncate">| {docType(docs[f.document_id].declared_type)}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <div ref={detailRef} className="min-w-0 scroll-mt-20 xl:sticky xl:top-20">
        <Card className="xl:max-h-[calc(100vh-6.5rem)] xl:overflow-y-auto">
          <div className="p-5">
            {selected ? (
              <FindingDetail
                appId={app.id}
                finding={selected}
                docs={docs}
                docTypeLabel={docType}
                onRectify={() => onRectify([selected.id])}
              />
            ) : (
              <EmptyState title="Select a finding" className="py-16">
                Choose a finding on the left to see its evidence, citation and trace.
              </EmptyState>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
