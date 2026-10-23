import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { fmtDateTime, fmtRelative, pluralize } from "../../lib/format";
import { humanize } from "../../lib/labels";
import type { DashboardAlert, DashboardRow } from "../../types";
import type { AppNavState } from "../../ui/shared";
import {
  ApplicationStatusBadge,
  ButtonLink,
  DataTable,
  EmptyState,
  ErrorState,
  MetaList,
  Page,
  PageHeader,
  Panel,
  SearchInput,
  SegmentedControl,
  SeverityIndicator,
  SimulatedTag,
  Skeleton,
  Stat,
  StatGroup,
  Toolbar,
  type Column,
} from "../../ui2";
import { workspacePath } from "../../shell/nav";
import { NetworkSummaryBlock } from "../integrity/NetworkSummaryBlock";

/** Category code to its handbook label, without the trailing qualifier in brackets. */
function useCategoryLabel() {
  const { data } = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  return useCallback((code: string) => (data?.checklists[code]?.label ?? humanize(code)).replace(/\s*\(.*\)$/, ""), [data]);
}

/** Verification alerts come from issuer sources, which are simulated in this prototype. */
const SIMULATED_KINDS = new Set(["source_unavailable", "verification_pending"]);
const KIND_LABEL: Record<string, string> = {
  source_unavailable: "Source unavailable",
  verification_pending: "Awaiting issuer",
};

function alertHref(a: DashboardAlert): string {
  if (a.finding_id) return workspacePath(a.application_id, "findings", { finding: a.finding_id });
  // v1 tab path; the workspace maps it to Documents, Verification view, keeping ?attempt=
  return `/applications/${encodeURIComponent(a.application_id)}/verification${a.attempt_id ? `?attempt=${encodeURIComponent(a.attempt_id)}` : ""}`;
}

function navState(row: DashboardRow): AppNavState {
  return { institution: row.institution.name, from: "/dashboard" };
}

function DashboardSkeleton() {
  return (
    <Page role="status" aria-live="polite">
      <span className="sr-only">Loading the review queue</span>
      <Skeleton className="h-12 w-80" />
      <Skeleton className="h-24" rounded="lg" />
      <Skeleton className="h-[480px]" rounded="lg" />
    </Page>
  );
}

function AttentionList({ alerts }: { alerts: DashboardAlert[] }) {
  const shown = alerts.slice(0, 8);
  return (
    <Panel
      as="aside"
      title="Needs attention"
      description="High-severity findings and issuer checks waiting on a person."
      padding="none"
      footer={alerts.length > shown.length ? <span className="mr-auto text-xs text-ink-3">Showing {shown.length} of {alerts.length}</span> : undefined}
    >
      {shown.length === 0 ? (
        <EmptyState size="sm" title="Nothing waiting" description="No high-severity findings or pending issuer checks." />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {shown.map((a, i) => (
            <li key={`${a.application_id}-${a.finding_id ?? a.attempt_id ?? i}`}>
              <Link to={alertHref(a)} className="block px-5 py-3 transition-colors duration-150 hover:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-medium text-ink">{a.title}</span>
                  {SIMULATED_KINDS.has(a.kind) ? <SimulatedTag /> : <SeverityIndicator severity={a.severity} showLabel={false} className="mt-0.5" />}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-3">
                  <MetaList items={[a.institution, KIND_LABEL[a.kind] ?? humanize(a.category)]} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function DashboardPage() {
  const dash = useQuery({ queryKey: qk.dashboard, queryFn: api.dashboard });
  const categoryLabel = useCategoryLabel();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"attention" | "all">("attention");

  const rows = useMemo(() => dash.data?.applications ?? [], [dash.data]);
  const needAttention = useMemo(() => rows.filter((r) => r.open_findings > 0 || r.status === "rectified" || r.status === "submitted"), [rows]);
  const visible = useMemo(() => {
    const base = scope === "attention" ? needAttention : rows;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      [r.institution.name, r.institution.aicte_id, r.id, r.institution.district, r.institution.state, categoryLabel(r.category)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, needAttention, scope, query, categoryLabel]);

  const columns = useMemo<Column<DashboardRow>[]>(
    () => [
      {
        id: "order",
        header: "#",
        width: "48px",
        cell: (r) => <span className="text-ink-3 tabular-nums">{rows.indexOf(r) + 1}</span>,
        sortValue: (r) => rows.indexOf(r),
      },
      {
        id: "institution",
        header: "Institution",
        sortValue: (r) => r.institution.name,
        cell: (r) => (
          <span className="block min-w-0">
            <span className="block truncate">{r.institution.name}</span>
            <span className="block truncate text-xs font-normal text-ink-3">
              <MetaList items={[r.id, `${r.institution.district}, ${r.institution.state}`]} />
            </span>
          </span>
        ),
      },
      {
        id: "category",
        header: "Category",
        hideBelow: "2xl",
        sortValue: (r) => categoryLabel(r.category),
        cell: (r) => (
          <span className="block min-w-0">
            <span className="block truncate text-ink-2">{categoryLabel(r.category)}</span>
            <span className="block text-xs text-ink-3">
              AY {r.academic_year}, round {r.round}
            </span>
          </span>
        ),
      },
      { id: "status", header: "Status", hideBelow: "md", sortValue: (r) => r.status, cell: (r) => <ApplicationStatusBadge status={r.status} /> },
      {
        id: "open",
        header: "Open findings",
        align: "right",
        sortValue: (r) => r.open_findings,
        cell: (r) => <span className={r.open_findings ? "text-ink" : "text-ink-3"}>{r.open_findings}</span>,
      },
      {
        id: "high",
        header: "High or critical",
        align: "right",
        hideBelow: "sm",
        sortValue: (r) => r.open_high,
        cell: (r) =>
          r.open_high ? <span className="font-medium text-mismatch-fg">{r.open_high}</span> : <span className="text-ink-3">0</span>,
      },
      {
        id: "run",
        header: "Last validated",
        hideBelow: "2xl",
        sortValue: (r) => r.latest_run?.finished_at ?? "",
        cell: (r) =>
          r.latest_run?.finished_at ? (
            <span className="text-ink-3" title={fmtDateTime(r.latest_run.finished_at)}>
              {fmtRelative(r.latest_run.finished_at)}
            </span>
          ) : (
            <span className="text-ink-3">Not run</span>
          ),
      },
    ],
    [rows, categoryLabel],
  );

  if (dash.isPending) return <DashboardSkeleton />;
  if (!dash.data)
    return (
      <Page>
        <ErrorState error={dash.error} title="Could not load the review queue" onRetry={() => void dash.refetch()} retrying={dash.isFetching} />
      </Page>
    );

  const data = dash.data;
  const next = needAttention[0];
  const highTotal = rows.reduce((t, r) => t + r.open_high, 0);
  const withHigh = rows.filter((r) => r.open_high > 0).length;
  const manual = (data.verification_counts.manual_review_required ?? 0) + (data.verification_counts.source_unavailable ?? 0);
  const pending = data.verification_counts.verification_pending ?? 0;
  const years = Array.from(new Set(rows.map((r) => r.academic_year))).sort();

  return (
    <Page width="wide">
      <PageHeader
        title="Review queue"
        context={`${pluralize(rows.length, "application")} for AY ${years.join(", ")}, in review-priority order. The order ranks attention and decides nothing.`}
        menu={[
          {
            id: "refresh",
            label: "Refresh",
            icon: <RefreshCw />,
            onSelect: () => void dash.refetch(),
          },
        ]}
        primary={
          next ? (
            <ButtonLink
              variant="primary"
              to={workspacePath(next.id)}
              state={navState(next)}
              trailingIcon={<ArrowRight aria-hidden />}
            >
              Open next application
            </ButtonLink>
          ) : undefined
        }
      />

      {dash.error && <ErrorState compact error={dash.error} title="Showing the last loaded data" />}

      <StatGroup label="Queue summary">
        <Stat label="Applications" value={rows.length} hint={`${needAttention.length} need attention`} />
        <Stat label="Open findings" value={data.open_findings} hint={`Across ${pluralize(rows.filter((r) => r.open_findings > 0).length, "application")}`} />
        <Stat
          label="High or critical"
          value={highTotal}
          tone={highTotal > 0 ? "danger" : "default"}
          hint={`In ${pluralize(withHigh, "application")}, each needs a decision with a reason`}
        />
        <Stat
          label="Awaiting manual confirmation"
          value={manual + pending}
          hint={
            <span className="inline-flex items-center gap-1.5">
              {pending} awaiting the issuer <SimulatedTag />
            </span>
          }
        />
      </StatGroup>

      <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Applications" padding="none">
          <Toolbar className="px-5 pb-3">
            <SearchInput value={query} onChange={setQuery} label="Filter applications" placeholder="Filter by institution, ID or place" />
            <SegmentedControl
              label="Show"
              value={scope}
              onChange={(v) => setScope(v as "attention" | "all")}
              options={[
                { value: "attention", label: "Needs attention", count: needAttention.length },
                { value: "all", label: "All", count: rows.length },
              ]}
            />
          </Toolbar>
          <div className="border-t border-line">
            <DataTable
              label="Applications in review-priority order"
              rows={visible}
              columns={columns}
              rowKey={(r) => r.id}
              linkColumn="institution"
              rowHref={(r) => workspacePath(r.id)}
              rowState={navState}
              empty={query ? "No application matches the filter." : "No applications need attention."}
            />
          </div>
        </Panel>
        <div className="min-w-0 space-y-6">
          <NetworkSummaryBlock />
          <AttentionList alerts={data.alerts} />
        </div>
      </div>
    </Page>
  );
}
