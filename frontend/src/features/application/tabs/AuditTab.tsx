import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api, qk } from "../../../api";
import { useAuth } from "../../../auth/session";
import { Card, CardHeader } from "../../../components/ui/Card";
import { EmptyState, ErrorBanner, Skeleton } from "../../../components/ui/Feedback";
import { AuditTimeline, VerifyChain } from "../../audit/AuditTimeline";

export function AuditTab({ appId }: { appId: string }) {
  const { is } = useAuth();
  const q = useQuery({ queryKey: qk.appAudit(appId), queryFn: () => api.applicationAudit(appId) });

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card aria-labelledby="app-audit-title">
        <CardHeader
          id="app-audit-title"
          icon={<ScrollText className="size-4" />}
          title="Application audit trail"
          subtitle="Every action on this application, oldest first. Each event commits to the hash of the event before it."
        />
        <div className="px-4 py-4">
          {q.isPending ? (
            <Skeleton className="h-64" />
          ) : q.error ? (
            <ErrorBanner error={q.error} title="Could not load the audit trail" />
          ) : q.data.length ? (
            <AuditTimeline events={q.data} />
          ) : (
            <EmptyState title="No events yet" />
          )}
        </div>
      </Card>
      <Card aria-labelledby="chain-title" className="xl:sticky xl:top-20">
        <CardHeader id="chain-title" title="Chain integrity" />
        <div className="space-y-3 px-4 py-3 text-sm text-muted">
          <p>
            The audit log is one append-only chain shared by all applications: hash = SHA-256(previous hash + event).
            Editing or deleting any row breaks every later hash, and signed checkpoints make truncation detectable.
          </p>
          {is("officer", "admin") ? (
            <VerifyChain />
          ) : (
            <p className="text-xs text-subtle-fg">Chain verification is available to scrutiny officers and administrators.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
