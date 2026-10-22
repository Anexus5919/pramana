import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Digest } from "../../components/ui/Digest";
import { EmptyState, ErrorBanner, Skeleton } from "../../components/ui/Feedback";
import { Select } from "../../components/ui/Field";
import { AuditTimeline, VerifyChain } from "../audit/AuditTimeline";
import { PageHeader } from "../shared/Summaries";

function CheckpointPanel() {
  const qc = useQueryClient();
  const mut = useMutation({ mutationFn: api.checkpoint, onSuccess: () => void qc.invalidateQueries({ queryKey: qk.audit }) });
  return (
    <div className="space-y-2">
      <Button icon={<KeyRound className="size-4" />} onClick={() => mut.mutate()} loading={mut.isPending}>
        Create signed checkpoint
      </Button>
      <p className="text-xs text-subtle-fg">
        Signs the current chain head with the audit Ed25519 key, so later truncation of the log is detectable.
      </p>
      {!!mut.error && <ErrorBanner error={mut.error} title="Could not create a checkpoint" />}
      {mut.data && (
        <div role="status" className="animate-fade-in rounded-md border border-line bg-subtle/60 p-2.5 text-xs">
          {mut.data.seq ? (
            <>
              <p className="font-medium text-fg">Checkpoint at event #{mut.data.seq}</p>
              <p className="mt-1 flex items-center gap-1.5 text-muted">
                Head <Digest value={mut.data.head_hash} length={16} label="head hash" />
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-muted">
                Signature <Digest value={mut.data.signature} length={16} label="signature" />
              </p>
            </>
          ) : (
            <p className="text-muted">The log is empty; nothing to sign.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AuditLogPage() {
  const { is } = useAuth();
  const [limit, setLimit] = useState(200);
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: [...qk.audit, limit], queryFn: () => api.audit(limit) });
  const events = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = query.data ?? [];
    if (!needle) return all;
    return all.filter((e) =>
      `${e.action} ${e.actor} ${e.actor_role} ${e.object_type} ${e.object_id ?? ""} ${e.application_id ?? ""}`.toLowerCase().includes(needle),
    );
  }, [query.data, q]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Append-only and hash-chained. Each event stores the hash of the one before it, newest first here."
        actions={
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => void query.refetch()} loading={query.isFetching}>
            Refresh
          </Button>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card aria-labelledby="log-title">
          <CardHeader
            id="log-title"
            title="Events"
            subtitle={query.data ? `${events.length} of the latest ${query.data.length} events` : undefined}
            actions={
              <div className="flex items-center gap-2">
                <label className="relative block">
                  <span className="sr-only">Filter events</span>
                  <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle-fg" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Action, actor or ID"
                    className="h-8 w-48 rounded-md border border-line-strong bg-surface pr-2 pl-7 text-xs text-fg placeholder:text-subtle-fg focus-visible:outline-2 focus-visible:outline-ring/50"
                  />
                </label>
                <Select aria-label="Number of events" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-8 w-28 py-0 text-xs">
                  {[100, 200, 500, 1000].map((n) => (
                    <option key={n} value={n}>
                      Latest {n}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />
          <div className="p-4">
            {query.isPending ? (
              <Skeleton className="h-96" />
            ) : query.error ? (
              <ErrorBanner error={query.error} title="Could not load the audit log" />
            ) : events.length ? (
              <AuditTimeline events={events} showApplication />
            ) : (
              <EmptyState title="No events match" />
            )}
          </div>
        </Card>
        <div className="space-y-5 xl:sticky xl:top-20">
          <Card aria-labelledby="integrity-title">
            <CardHeader id="integrity-title" title="Integrity" />
            <div className="space-y-4 p-4">
              <VerifyChain />
              {is("admin") && <CheckpointPanel />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
