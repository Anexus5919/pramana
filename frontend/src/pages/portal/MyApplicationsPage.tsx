import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useMemo } from "react";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtDateTime, fmtRelative } from "../../lib/format";
import { humanize } from "../../lib/labels";
import type { Application } from "../../types";
import {
  ApplicationStatusBadge,
  ButtonLink,
  Code,
  DataTable,
  EmptyState,
  ErrorState,
  MetaList,
  Page,
  PageHeader,
  Panel,
  Skeleton,
  type Column,
} from "../../ui2";
import { listNextStep } from "./progress";

/** Applications that need the institution first, then the newest. */
const ORDER: Record<string, number> = { rectification_requested: 0, draft: 1, submitted: 2, validating: 2, rectified: 3, under_review: 4 };

function updatedAt(a: Application): string {
  return [a.created_at, a.submitted_at, a.latest_run?.finished_at].filter((v): v is string => !!v).sort().pop() ?? "";
}

function useCategoryLabel() {
  const { data } = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  return useCallback((code: string) => (data?.checklists[code]?.label ?? humanize(code)).replace(/\s*\(.*\)$/, ""), [data]);
}

function ListSkeleton() {
  return (
    <Page width="narrow" role="status">
      <span className="sr-only">Loading your applications</span>
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-52" />
      </div>
      <Skeleton className="h-48" rounded="lg" />
    </Page>
  );
}

export default function MyApplicationsPage() {
  const { user } = useAuth();
  const apps = useQuery({ queryKey: qk.applications, queryFn: api.applications });
  const categoryLabel = useCategoryLabel();
  const list = useMemo(
    () =>
      [...(apps.data ?? [])].sort(
        (x, y) => (ORDER[x.status] ?? 9) - (ORDER[y.status] ?? 9) || updatedAt(y).localeCompare(updatedAt(x)),
      ),
    [apps.data],
  );
  // With no applications yet, the institution's own record still gives the header its context
  const instId = user?.institution_id ?? "";
  const instQ = useQuery({
    queryKey: ["institution", instId],
    queryFn: () => api.institution(instId),
    enabled: !!instId && apps.isSuccess && list.length === 0,
  });
  const inst = list[0]?.institution ?? instQ.data;

  const columns = useMemo<Column<Application>[]>(
    () => [
      {
        id: "application",
        header: "Application",
        sortValue: (a) => categoryLabel(a.category),
        cell: (a) => (
          <span className="block min-w-0">
            <span className="block">{categoryLabel(a.category)}</span>
            <span className="block font-mono text-xs font-normal text-ink-3">{a.id}</span>
          </span>
        ),
      },
      { id: "year", header: "Academic year", hideBelow: "sm", sortValue: (a) => a.academic_year, cell: (a) => <span className="text-ink-2">{a.academic_year}</span> },
      { id: "status", header: "Status", sortValue: (a) => ORDER[a.status] ?? 9, cell: (a) => <ApplicationStatusBadge status={a.status} /> },
      { id: "next", header: "Next step", hideBelow: "md", cell: (a) => <span className="text-ink-2">{listNextStep(a.status)}</span> },
      {
        id: "updated",
        header: "Updated",
        hideBelow: "lg",
        sortValue: (a) => updatedAt(a),
        cell: (a) => (
          <span className="whitespace-nowrap text-ink-3" title={fmtDateTime(updatedAt(a))}>
            {fmtRelative(updatedAt(a))}
          </span>
        ),
      },
    ],
    [categoryLabel],
  );

  if (apps.isPending) return <ListSkeleton />;

  // On phones the header keeps the full width for the title, so the action sits under it
  const start = (wide = false) => (
    <ButtonLink variant="primary" size="lg" to="/portal/new" leadingIcon={<Plus aria-hidden />} className={wide ? "w-full" : undefined}>
      Start a new application
    </ButtonLink>
  );

  return (
    <Page width="narrow">
      <PageHeader
        title="Your applications"
        context={inst ? <MetaList items={[inst.name, <Code key="aicte">{inst.aicte_id}</Code>, inst.district]} /> : user?.display_name}
        primary={list.length > 0 ? <span className="hidden sm:block">{start()}</span> : undefined}
      />
      {list.length > 0 && <div className="-mt-4 sm:hidden">{start(true)}</div>}
      {apps.error ? (
        <ErrorState error={apps.error} title="Could not load your applications" onRetry={() => void apps.refetch()} retrying={apps.isFetching} />
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            title="No applications yet"
            description="Start an application, upload the documents on the checklist, then submit it for AICTE review."
            action={start()}
          />
        </Panel>
      ) : (
        <Panel padding="none">
          <DataTable
            label="Your applications"
            rows={list}
            columns={columns}
            rowKey={(a) => a.id}
            linkColumn="application"
            rowHref={(a) => `/portal/applications/${encodeURIComponent(a.id)}`}
          />
        </Panel>
      )}
    </Page>
  );
}
