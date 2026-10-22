import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { api, qk } from "../../api";
import { Button } from "../../components/ui/Button";
import { ErrorBanner, Skeleton } from "../../components/ui/Feedback";
import { PageHeader } from "../shared/Summaries";
import { AlertsPanel } from "./AlertsPanel";
import { KpiTiles } from "./KpiTiles";
import { TriageTable } from "./TriageTable";

export function DashboardPage() {
  const dash = useQuery({ queryKey: qk.dashboard, queryFn: api.dashboard });
  const metrics = useQuery({ queryKey: qk.metrics, queryFn: api.runMetrics });

  return (
    <div>
      <PageHeader
        title="Scrutiny dashboard"
        subtitle="Applications in review order from their latest validation run. Review order is a sort key that weighs findings by severity; it is not a score and decides nothing."
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => {
              void dash.refetch();
              void metrics.refetch();
            }}
            loading={dash.isFetching}
          >
            Refresh
          </Button>
        }
      />
      {dash.error && <ErrorBanner error={dash.error} title="Could not load the dashboard" className="mb-4" />}
      {dash.isPending ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : dash.data ? (
        <div className="space-y-5">
          <KpiTiles data={dash.data} metrics={metrics.data} />
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <TriageTable rows={dash.data.applications} />
            <AlertsPanel alerts={dash.data.alerts} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
