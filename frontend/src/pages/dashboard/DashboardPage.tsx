import { useQuery } from "@tanstack/react-query";
import { api, qk } from "../../api";
import { Skeleton } from "../../ui/Skeleton";
import { ErrorState } from "../../ui/States";
import { AlertsFeed } from "./AlertsFeed";
import { Hero } from "./Hero";
import { KpiTiles } from "./KpiTiles";
import { ReviewQueue } from "./ReviewQueue";
import { VerificationBlocks } from "./VerificationBlocks";

function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading the dashboard</span>
      <Skeleton className="h-[300px]" rounded="lg" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" rounded="lg" />
        ))}
      </div>
      <Skeleton className="h-[420px]" rounded="lg" />
    </div>
  );
}

export default function DashboardPage() {
  const dash = useQuery({ queryKey: qk.dashboard, queryFn: api.dashboard });
  const metrics = useQuery({ queryKey: qk.metrics, queryFn: api.runMetrics });

  if (dash.isPending) return <DashboardSkeleton />;
  if (!dash.data)
    return (
      <ErrorState
        error={dash.error}
        title="Could not load the dashboard"
        onRetry={() => void dash.refetch()}
        retrying={dash.isFetching}
      />
    );

  const data = dash.data;
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Scrutiny dashboard</h1>
      <Hero
        data={data}
        refreshing={dash.isFetching || metrics.isFetching}
        onRefresh={() => {
          void dash.refetch();
          void metrics.refetch();
        }}
      />
      {dash.error && <ErrorState compact error={dash.error} title="Showing the last loaded data" />}
      <KpiTiles data={data} metrics={metrics.data} />
      <ReviewQueue rows={data.applications} />
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <AlertsFeed alerts={data.alerts} />
        <VerificationBlocks counts={data.verification_counts} />
      </div>
    </div>
  );
}
