import { useQuery } from "@tanstack/react-query";
import { api, qk } from "../../../api";
import { ErrorBanner, Spinner } from "../../../components/ui/Feedback";
import { fmtDateTime } from "../../../lib/format";
import { humanize, reviewActionLabel } from "../../../lib/labels";

export function FindingHistory({ findingId }: { findingId: string }) {
  const q = useQuery({ queryKey: qk.history(findingId), queryFn: () => api.findingHistory(findingId) });
  if (q.isPending) return <Spinner label="Loading history" />;
  if (q.error) return <ErrorBanner error={q.error} title="Could not load history" />;
  if (!q.data.length) return <p className="text-sm text-subtle-fg">No review actions yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {q.data.map((h) => (
        <li key={h.id} className="relative">
          <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-primary" />
          <p className="text-sm text-fg">
            <span className="font-medium">{reviewActionLabel[h.action] ?? humanize(h.action)}</span>
            <span className="text-muted"> by {h.actor ?? "unknown"}</span>
          </p>
          <p className="text-xs text-subtle-fg">{fmtDateTime(h.created_at)}</p>
          {h.note && <p className="mt-1 rounded-md bg-subtle px-2 py-1 text-sm text-muted">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}
