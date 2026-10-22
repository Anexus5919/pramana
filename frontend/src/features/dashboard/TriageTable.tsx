import clsx from "clsx";
import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppStatusBadge } from "../../components/ui/Badge";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/Feedback";
import { toneClass } from "../../components/ui/tone";
import { VERIFICATION_STATUSES, verificationMeta } from "../../lib/labels";
import type { DashboardRow } from "../../types";
import { countStatuses, SeverityChips, VerificationMix } from "../shared/Summaries";
import { useLabels } from "../shared/useRuleset";

export function TriageTable({ rows }: { rows: DashboardRow[] }) {
  const [q, setQ] = useState("");
  const { category } = useLabels();
  const maxPriority = Math.max(1, ...rows.map((r) => r.latest_run?.review_priority ?? 0));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.institution.name, r.institution.aicte_id, r.id, r.category, category(r.category), r.academic_year, r.status]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q, category]);

  return (
    <Card aria-labelledby="triage-title">
      <CardHeader
        id="triage-title"
        title="Triage queue"
        subtitle="Ordered by review order, a severity-weighted sort key; it ranks the queue and decides nothing"
        actions={
          <label className="relative block">
            <span className="sr-only">Filter applications</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle-fg" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by institution, ID, status"
              className="h-8 w-60 rounded-md border border-line-strong bg-surface pr-2 pl-7 text-xs text-fg placeholder:text-subtle-fg focus-visible:outline-2 focus-visible:outline-ring/50"
            />
          </label>
        }
      />
      {filtered.length === 0 ? (
        <EmptyState title={rows.length ? "No applications match the filter" : "No applications yet"}>
          {rows.length ? "Clear the filter to see the full queue." : "Applications appear here once institutions create them."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle/60 text-left text-[11px] font-semibold tracking-wider text-subtle-fg uppercase">
                <th scope="col" className="py-2 pr-2 pl-4 font-semibold">Review order</th>
                <th scope="col" className="px-2 py-2 font-semibold">Institution</th>
                <th scope="col" className="px-2 py-2 font-semibold">Category / AY</th>
                <th scope="col" className="px-2 py-2 font-semibold">Status</th>
                <th scope="col" className="px-2 py-2 font-semibold">Findings by severity</th>
                <th scope="col" className="px-2 py-2 font-semibold">Document verification</th>
                <th scope="col" className="py-2 pr-4 pl-2">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const run = r.latest_run;
                const pr = run?.review_priority ?? 0;
                return (
                  <tr key={r.id} className="group border-b border-line last:border-b-0 hover:bg-subtle/50">
                    <td className="py-2.5 pr-2 pl-4 align-middle">
                      <div className="flex w-20 items-center gap-2">
                        <span className="w-7 text-right font-semibold text-fg tabular-nums">{run ? pr : "-"}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
                          <span
                            className={clsx(
                              "block h-full origin-left animate-grow rounded-full",
                              r.open_high ? "bg-sev-high-bg" : "bg-primary/60",
                            )}
                            style={{ width: `${(pr / maxPriority) * 100}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[300px] px-2 py-2.5">
                      <Link
                        to={`/applications/${encodeURIComponent(r.id)}`}
                        className="block truncate font-medium text-fg hover:text-primary-ink hover:underline"
                      >
                        {r.institution.name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-subtle-fg">
                        <span className="font-mono">{r.institution.aicte_id}</span>
                        <span aria-hidden>|</span>
                        <span className="font-mono">{r.id}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="max-w-[200px] truncate text-fg" title={category(r.category)}>
                        {category(r.category).replace(/\s*\(.*\)$/, "")}
                      </div>
                      <div className="text-xs text-subtle-fg">AY {r.academic_year}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <AppStatusBadge status={r.status} />
                      <div className="mt-1 text-xs text-subtle-fg">
                        Round {r.round}
                        {run && (
                          <>
                            , {r.open_findings} open
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      {run ? <SeverityChips bySeverity={run.by_severity} /> : <span className="text-xs text-subtle-fg">Not validated</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <VerificationMix counts={countStatuses(run?.document_status ?? {})} />
                    </td>
                    <td className="py-2.5 pr-4 pl-2 text-right">
                      <Link
                        to={`/applications/${encodeURIComponent(r.id)}`}
                        aria-label={`Open workspace for ${r.institution.name}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-subtle-fg group-hover:bg-primary-soft group-hover:text-primary-ink"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-muted">
        <span className="font-medium text-subtle-fg">Verification legend</span>
        {VERIFICATION_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={clsx("size-2 rounded-full", toneClass[verificationMeta[s].tone].dot)} />
            {verificationMeta[s].label}
          </span>
        ))}
      </div>
    </Card>
  );
}
