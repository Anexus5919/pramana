import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Signature } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtDateTime, fmtRelative, pluralize } from "../../lib/format";
import { workspacePath } from "../../shell/nav";
import type { AuditEvent, ChainVerification } from "../../types";
import {
  Button,
  Callout,
  DataTable,
  DescriptionList,
  Digest,
  ErrorState,
  MetaList,
  Page,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
  Toolbar,
  useToast,
  type Column,
} from "../../ui2";
import { FAMILIES, actionLabel, family, recompute, type Recomputed } from "./chain";
import { EventDrawer, actorRole } from "./parts";

const PAGE = 60;

function AuditSkeleton() {
  return (
    <Page role="status" aria-live="polite">
      <span className="sr-only">Loading the audit log</span>
      <Skeleton className="h-12 w-80" />
      <Skeleton className="h-[520px]" rounded="lg" />
    </Page>
  );
}

/** One Callout for the combined browser and server walk. */
function VerifyResult({
  results,
  server,
  serverError,
  serverPending,
  onOpen,
}: {
  results: Recomputed[];
  server: ChainVerification | undefined;
  serverError: unknown;
  serverPending: boolean;
  onOpen: (seq: number) => void;
}) {
  const bad = results.find((r) => r.state !== "ok");
  if (bad) {
    return (
      <Callout
        tone="danger"
        role="alert"
        title={`Chain broken at event #${bad.seq}`}
        action={
          <Button size="sm" onClick={() => onOpen(bad.seq)}>
            Open event #{bad.seq}
          </Button>
        }
      >
        {pluralize(results.filter((r) => r.state !== "ok").length, "loaded event")} do not recompute to their stored hash or do not point at the event
        before them. Something changed after it was recorded.
      </Callout>
    );
  }
  if (serverPending) {
    return (
      <Callout tone="info" role="status" title="Checking the chain on the server">
        All {pluralize(results.length, "loaded event")} recompute in your browser. Waiting for the server walk.
      </Callout>
    );
  }
  if (serverError) return <ErrorState compact error={serverError} title="The server check did not run" />;
  if (!server) return null;
  if (!server.intact) {
    const seq = server.first_broken_seq;
    return (
      <Callout
        tone="danger"
        role="alert"
        title={seq !== null ? `Chain broken at event #${seq}` : "Chain broken"}
        action={
          seq !== null ? (
            <Button size="sm" onClick={() => onOpen(seq)}>
              Open event #{seq}
            </Button>
          ) : undefined
        }
      >
        The server walked {pluralize(server.events_checked, "event")} and found a link that does not match.
      </Callout>
    );
  }
  return (
    <Callout tone="success" role="status" title="Chain intact">
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {pluralize(server.events_checked, "event")} verified in the browser and on the server. Head hash <Digest value={server.head_hash} label="Head hash" />
      </span>
    </Callout>
  );
}

export default function AuditLogPage() {
  const { is } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.audit, queryFn: () => api.audit(1000) });
  const server = useQuery({ queryKey: [...qk.audit, "verify"], queryFn: api.verifyAudit, enabled: false });
  const [query, setQuery] = useState("");
  const [fam, setFam] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [results, setResults] = useState<Recomputed[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const [signed, setSigned] = useState<{ seq: number; signature?: string } | null>(null);

  const events = useMemo(() => q.data ?? [], [q.data]);
  const asc = useMemo(() => [...events].sort((a, b) => a.seq - b.seq), [events]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[family(e.action)] = (c[family(e.action)] ?? 0) + 1;
    return c;
  }, [events]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((e) => {
      if (fam !== "all" && family(e.action) !== fam) return false;
      if (!needle) return true;
      const hay = `${e.seq} ${e.action} ${actionLabel(e.action)} ${e.actor} ${e.actor_role} ${e.object_type} ${e.object_id ?? ""} ${e.application_id ?? ""} ${JSON.stringify(e.details)} ${e.hash}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [events, query, fam]);
  const checks = useMemo(() => new Map((results ?? []).map((r) => [r.seq, r])), [results]);

  const verify = useCallback(async () => {
    if (!asc.length) return;
    setVerifying(true);
    try {
      // Recompute every loaded hash in the browser, then ask the server for its own walk
      setResults(await recompute(asc));
      await server.refetch();
    } finally {
      setVerifying(false);
    }
  }, [asc, server]);

  const checkpoint = useMutation({
    mutationFn: api.checkpoint,
    onSuccess: async (res) => {
      if (res.seq !== undefined) setSigned({ seq: res.seq, signature: res.signature });
      toast.success("Signed checkpoint created", res.seq ? `The chain head at event #${res.seq} is now signed.` : "Nothing new to sign.");
      void server.refetch();
      await qc.invalidateQueries({ queryKey: qk.audit, exact: true });
    },
  });

  const openEvent = useCallback(
    (seq: number) => {
      if (!events.some((e) => e.seq === seq)) {
        toast.info("Event not loaded", `Event #${seq} is older than the latest ${events.length} loaded here.`);
        return;
      }
      setOpenSeq(seq);
    },
    [events, toast],
  );

  const columns = useMemo<Column<AuditEvent>[]>(
    () => [
      {
        id: "seq",
        header: "#",
        width: "72px",
        cell: (e) => <span className="tabular-nums">{e.seq}</span>,
      },
      {
        id: "action",
        header: "Action",
        cell: (e) => {
          const c = checks.get(e.seq);
          return (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{actionLabel(e.action)}</span>
              <code className="hidden shrink-0 font-mono text-xs text-ink-3 lg:inline">{e.action}</code>
              {c && c.state !== "ok" && <StatusBadge tone="mismatch">Does not match</StatusBadge>}
            </span>
          );
        },
      },
      {
        id: "actor",
        header: "Actor",
        hideBelow: "md",
        cell: (e) => (
          <span className="block max-w-56 truncate" title={actorRole(e) ?? undefined}>
            {e.actor}
            {actorRole(e) && <span className="text-xs text-ink-3">, {actorRole(e)}</span>}
          </span>
        ),
      },
      {
        id: "object",
        header: "Object",
        hideBelow: "2xl",
        cell: (e) => (
          <span className="block max-w-56 truncate text-ink-2" title={e.object_id ? `${e.object_type} ${e.object_id}` : e.object_type}>
            {e.object_type}
            {e.object_id && <code className="ml-1.5 font-mono text-xs">{e.object_id}</code>}
          </span>
        ),
      },
      {
        id: "application",
        header: "Application",
        hideBelow: "lg",
        cell: (e) =>
          e.application_id ? (
            <Link to={workspacePath(e.application_id)} className="rounded font-mono text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              {e.application_id}
            </Link>
          ) : (
            <span className="text-ink-3">None</span>
          ),
      },
      {
        id: "time",
        header: "Time",
        cell: (e) => (
          <span className="whitespace-nowrap text-ink-3" title={fmtDateTime(e.ts)}>
            {fmtRelative(e.ts) || fmtDateTime(e.ts)}
          </span>
        ),
      },
      {
        id: "hash",
        header: "Hash",
        hideBelow: "xl",
        cell: (e) => (
          <code className="font-mono text-xs text-ink-3" title={e.hash}>
            {e.hash.slice(0, 10)}
          </code>
        ),
      },
    ],
    [checks],
  );

  if (q.isPending) return <AuditSkeleton />;
  if (q.error && !q.data)
    return (
      <Page>
        <ErrorState error={q.error} title="Could not load the audit log" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </Page>
    );

  const shown = filtered.slice(0, limit);
  const openEventData = openSeq !== null ? (events.find((e) => e.seq === openSeq) ?? null) : null;
  const checkpoints = server.data?.checkpoints ?? [];

  return (
    <Page>
      <PageHeader
        title="Audit log"
        context={`Every action is chained by SHA-256. ${pluralize(events.length, "event")}.`}
        secondary={
          is("admin") ? (
            <Button leadingIcon={<Signature aria-hidden />} loading={checkpoint.isPending} onClick={() => checkpoint.mutate()}>
              Create signed checkpoint
            </Button>
          ) : undefined
        }
        primary={
          <Button variant="primary" leadingIcon={<ShieldCheck aria-hidden />} loading={verifying} disabled={!asc.length} onClick={() => void verify()}>
            Verify chain integrity
          </Button>
        }
      />

      {checkpoint.error && <ErrorState compact error={checkpoint.error} title="The checkpoint was not created" />}

      {(results || checkpoints.length > 0) && (
        <div className="space-y-4">
          {results && (
            <VerifyResult
              results={results}
              server={server.data}
              serverError={server.error}
              serverPending={verifying || server.isFetching}
              onOpen={openEvent}
            />
          )}
          {checkpoints.length > 0 && (
            <Panel title="Signed checkpoints" description="The server signs the chain head at each checkpoint, so a rewrite of earlier events is detectable.">
              <DescriptionList
                labelWidth={168}
                items={[...checkpoints]
                  .sort((a, b) => b.seq - a.seq)
                  .map((c) => ({
                    label: `Checkpoint at #${c.seq}`,
                    value: (
                      <StatusBadge tone={c.signature_valid && c.matches_chain ? "verified" : "mismatch"}>
                        {!c.signature_valid ? "Signature invalid" : c.matches_chain ? "Signature valid, matches the chain" : "Does not match the chain"}
                      </StatusBadge>
                    ),
                    hint: (
                      <MetaList
                        items={[
                          `Signed ${fmtDateTime(c.created_at)}`,
                          signed?.seq === c.seq && signed.signature ? (
                            <span className="inline-flex items-center gap-1.5">
                              Signature <Digest value={signed.signature} label="Checkpoint signature" />
                            </span>
                          ) : null,
                        ]}
                      />
                    ),
                  }))}
              />
            </Panel>
          )}
        </div>
      )}

      <Panel
        title="Events"
        padding="none"
        footer={
          filtered.length > limit ? (
            <>
              <span className="mr-auto text-xs text-ink-3">
                Showing {shown.length} of {filtered.length}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, filtered.length - limit)} more
              </Button>
            </>
          ) : undefined
        }
      >
        <Toolbar className="px-5 pb-3">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setLimit(PAGE);
            }}
            label="Search the audit log"
            placeholder="Search events"
          />
          <Select
            selectSize="sm"
            aria-label="Kind of event"
            value={fam}
            onChange={(e) => {
              setFam(e.target.value);
              setLimit(PAGE);
            }}
            className="w-full sm:w-52"
          >
            <option value="all">All kinds ({events.length})</option>
            {FAMILIES.filter((f) => counts[f.id]).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({counts[f.id]})
              </option>
            ))}
          </Select>
        </Toolbar>
        <div className="border-t border-line">
          <DataTable
            label="Audit events, newest first"
            rows={shown}
            columns={columns}
            rowKey={(e) => String(e.seq)}
            linkColumn="seq"
            onRowClick={(e) => setOpenSeq(e.seq)}
            selectedKey={openSeq !== null ? String(openSeq) : null}
            density="compact"
            empty={events.length ? "No events match. Clear the search or choose another kind." : "No events recorded yet."}
          />
        </div>
      </Panel>

      <EventDrawer event={openEventData} check={openSeq !== null ? checks.get(openSeq) : undefined} onClose={() => setOpenSeq(null)} />
    </Page>
  );
}
