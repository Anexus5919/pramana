import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../../api";
import { fmtDateTime } from "../../../../lib/format";
import { CHANNELS, channelMeta, humanize, verificationMeta } from "../../../../lib/labels";
import { workspacePath } from "../../../../shell/nav";
import type { VerificationAttempt } from "../../../../types";
import {
  Button,
  Callout,
  DataTable,
  DescriptionList,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  MetaList,
  Panel,
  Select,
  SimulatedTag,
  Skeleton,
  Textarea,
  Tooltip,
  useToast,
  VerificationBadge,
  type Column,
} from "../../../../ui2";
import { useDocTypeLabel, useWorkspace } from "../../context";
import { useManualVerification, useParam } from "../../data";
import { AttemptBadge, attemptMeta, ComparisonTable, SimTag } from "../../parts";
import { currentAttempts, NEEDS_MANUAL, when } from "./shared";

const MANUAL_STATUSES = ["verified", "mismatch_detected", "expired", "manual_review_required"] as const;
const MIN_NOTE = 10;

type Channel = (typeof CHANNELS)[number];

interface Row {
  docId: string;
  cells: Partial<Record<Channel, { latest: VerificationAttempt; count: number }>>;
}

/* ---------- Manual confirmation ---------- */

function ManualForm({ attempt, formId, onRecorded, onPending }: { attempt: VerificationAttempt; formId: string; onRecorded: (a: VerificationAttempt) => void; onPending: (p: boolean) => void }) {
  const { app } = useWorkspace();
  const toast = useToast();
  const m = useManualVerification(app.id);
  const [status, setStatus] = useState<string>("verified");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const short = note.trim().length < MIN_NOTE;

  useEffect(() => {
    setStatus("verified");
    setNote("");
    setTouched(false);
    m.reset();
    // m.reset is stable; reset only when the attempt changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id]);

  useEffect(() => onPending(m.isPending), [m.isPending, onPending]);

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (short) return;
        m.mutate(
          { attemptId: attempt.id, status, note: note.trim() },
          {
            onSuccess: (a) => {
              toast.success(
                `Manual confirmation recorded: ${verificationMeta[a.status]?.label ?? humanize(a.status)}`,
                "The earlier attempt stays on record unchanged. Your reason is in the audit trail.",
              );
              onRecorded(a);
            },
          },
        );
      }}
      className="space-y-3"
    >
      <div>
        <h3 className="text-sm font-medium text-ink">Record a manual confirmation</h3>
        <p className="mt-0.5 text-sm text-ink-3 text-pretty">
          Use this after an offline check with the issuer, such as a letter, an email or a portal lookup. It adds a new attempt and keeps this one unchanged.
        </p>
      </div>
      <Field label="Outcome">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {MANUAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {verificationMeta[s]?.label ?? humanize(s)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reason: how it was confirmed" required error={touched && short ? `Write at least ${MIN_NOTE} characters.` : undefined}>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Letter reference, who confirmed, date" invalid={touched && short} />
      </Field>
      {m.error && (
        <Callout tone="danger" role="alert">
          {errorMessage(m.error)}
        </Callout>
      )}
    </form>
  );
}

/* ---------- Attempt detail ---------- */

function AttemptDetail({ a, all, canManual, formId, onRecorded, onPending }: { a: VerificationAttempt; all: VerificationAttempt[]; canManual: boolean; formId: string; onRecorded: (n: VerificationAttempt) => void; onPending: (p: boolean) => void }) {
  const { app, docs } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const r = a.response as { signer?: string; signer_role?: string; trust_anchor?: string; coverage?: string; revocation_checked?: boolean };
  const follows = typeof a.request?.follows === "string" ? (a.request.follows as string) : null;
  const earlier = follows ? all.find((x) => x.id === follows) : undefined;
  const followedBy = all.filter((x) => x.request?.follows === a.id).sort((x, y) => when(y).localeCompare(when(x)));
  const doc = a.document_id ? docs[a.document_id] : undefined;
  const meta = attemptMeta(a.status);
  const hasSigner = !!(r.signer || r.signer_role || r.trust_anchor || r.coverage || typeof r.revocation_checked === "boolean");

  return (
    <div className="space-y-5 p-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AttemptBadge status={a.status} />
          <SimTag channel={a.channel} simulated={a.simulated} />
        </div>
        {meta && <p className="text-sm text-ink-2">{meta.meaning}</p>}
        <p className="text-xs text-ink-3">{channelMeta[a.channel]?.meaning}</p>
      </div>

      {doc && (
        <Link
          to={workspacePath(app.id, "documents", { doc: doc.id, panel: "verification" })}
          className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm transition-colors duration-150 hover:bg-surface-2"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{docLabel(doc.declared_type)}</span>
            <span className="block truncate font-mono text-xs text-ink-3">{doc.original_filename}</span>
          </span>
          <ArrowUpRight aria-hidden className="size-4 shrink-0 text-ink-3" />
        </Link>
      )}

      {a.channel === "applicant_signature" && (
        <Callout tone="neutral" title="Applicant signature">
          Proves who uploaded the file, not who issued it.
        </Callout>
      )}

      {hasSigner && (
        <DescriptionList
          labelWidth={120}
          items={[
            { label: "Signer", value: r.signer, hidden: !r.signer },
            { label: "Role", value: r.signer_role ? humanize(r.signer_role) : null, hidden: !r.signer_role },
            { label: "Trust anchor", value: r.trust_anchor, hidden: !r.trust_anchor },
            { label: "Coverage", value: r.coverage ? humanize(r.coverage.toLowerCase()) : null, hidden: !r.coverage },
            {
              label: "Revocation",
              value: r.revocation_checked ? "Checked" : "Not checked (offline)",
              hidden: typeof r.revocation_checked !== "boolean",
            },
          ]}
        />
      )}

      {a.detail && <p className="text-sm text-ink-2 text-pretty">{a.detail}</p>}

      {a.comparison.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Submitted against the source</h3>
          <ComparisonTable comparisons={a.comparison} />
        </section>
      )}

      <div className="text-xs text-ink-3">
        <MetaList items={[a.source_name, a.actor ? `by ${a.actor}` : null, when(a) ? fmtDateTime(when(a)) : null]} />
      </div>

      {(follows || followedBy.length > 0) && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-ink">History</h3>
          {follows && (
            <p className="text-sm text-ink-2">
              Follows an earlier {earlier ? `${channelMeta[earlier.channel]?.label.toLowerCase() ?? "attempt"} (${attemptMeta(earlier.status)?.label.toLowerCase() ?? earlier.status})` : "attempt"}, which stays
              on record unchanged.
            </p>
          )}
          {followedBy.length > 0 && (
            <div className="space-y-1 text-sm text-ink-2">
              <div className="flex flex-wrap items-center gap-2">
                Manually confirmed since: <VerificationBadge status={followedBy[0].status} />
              </div>
              {followedBy[0].detail && <p className="text-xs text-ink-3">"{followedBy[0].detail}"</p>}
            </div>
          )}
        </section>
      )}

      {NEEDS_MANUAL.has(a.status) && a.channel !== "manual_confirmation" && !followedBy.length && (
        <div className="border-t border-line pt-5">
          {canManual ? (
            <ManualForm attempt={a} formId={formId} onRecorded={onRecorded} onPending={onPending} />
          ) : (
            <p className="text-sm text-ink-3">The verification cell or a scrutiny officer can record a manual confirmation for this attempt.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Matrix ---------- */

export function VerificationView({ query }: { query: UseQueryResult<VerificationAttempt[]> }) {
  const { app, docs, role } = useWorkspace();
  const label = useDocTypeLabel();
  const [selected, select] = useParam("attempt");
  const [pending, setPending] = useState(false);
  const formId = useId();
  const canManual = role === "officer" || role === "verifier";
  const latestRun = app.latest_run?.id;

  const all = useMemo(() => query.data ?? [], [query.data]);
  const current = useMemo(() => currentAttempts(all, latestRun), [all, latestRun]);

  const rows: Row[] = useMemo(() => {
    const order = app.documents.filter((d) => !d.superseded).map((d) => d.id);
    for (const a of current) if (a.document_id && !order.includes(a.document_id)) order.push(a.document_id);
    return order.map((docId) => {
      const cells: Row["cells"] = {};
      for (const c of CHANNELS) {
        const xs = current.filter((a) => a.document_id === docId && a.channel === c).sort((x, y) => when(y).localeCompare(when(x)));
        if (xs.length) cells[c] = { latest: xs[0], count: xs.length };
      }
      return { docId, cells };
    });
  }, [app.documents, current]);

  const summary = useMemo(() => {
    let verified = 0;
    let mismatch = 0;
    let expired = 0;
    let waiting = 0;
    let reviewed = 0;
    for (const r of rows) {
      const confirmed = !!r.cells.manual_confirmation;
      for (const c of CHANNELS) {
        const s = r.cells[c]?.latest.status;
        if (!s) continue;
        if (s === "verified") verified++;
        else if (s === "mismatch_detected") mismatch++;
        else if (s === "expired") expired++;
        else if (s === "officer_reviewed") reviewed++;
        else if (NEEDS_MANUAL.has(s) && !confirmed) waiting++;
      }
    }
    const parts = [
      `${verified} verified`,
      mismatch ? `${mismatch} ${mismatch === 1 ? "mismatch" : "mismatches"}` : null,
      expired ? `${expired} expired` : null,
      waiting ? `${waiting} awaiting manual confirmation` : null,
      reviewed ? `${reviewed} reviewed by officer` : null,
    ].filter(Boolean);
    return parts.join(", ");
  }, [rows]);
  const simulated = current.some((a) => a.simulated && a.channel === "issuer_registry");

  const sel = all.find((a) => a.id === selected) ?? null;

  if (query.isPending)
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading verification attempts</span>
        <Skeleton className="h-5 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  if (query.error) return <ErrorState error={query.error} title="Could not load verification attempts" onRetry={() => void query.refetch()} />;
  if (!current.length)
    return (
      <Panel>
        <EmptyState
          title="No verification attempts"
          description={app.latest_run ? "No verification channel applied on the latest run." : "Run validation from More actions to verify the documents."}
        />
      </Panel>
    );

  const columns: Column<Row>[] = [
    {
      id: "doc",
      header: "Document",
      cell: (r) => {
        const d = docs[r.docId];
        return (
          <div className="min-w-0">
            <div className="font-medium text-ink">{d ? label(d.declared_type) : r.docId}</div>
            <div className="truncate font-mono text-xs text-ink-3">{d?.original_filename}</div>
          </div>
        );
      },
      sortValue: (r) => (docs[r.docId] ? label(docs[r.docId].declared_type) : r.docId),
      className: "py-2",
    },
    // Channels no document used would be a column of "Not applicable"; leave them out
    ...CHANNELS.filter((c) => rows.some((r) => r.cells[c])).map(
      (c): Column<Row> => ({
        id: c,
        header: (
          <Tooltip content={channelMeta[c]?.meaning}>
            <span tabIndex={0} className="cursor-help rounded underline decoration-line-2 decoration-dotted underline-offset-4">
              {channelMeta[c]?.label ?? humanize(c)}
            </span>
          </Tooltip>
        ),
        cell: (r) => {
          const cell = r.cells[c];
          if (!cell) return <span className="text-xs whitespace-nowrap text-ink-3">Not applicable</span>;
          const a = cell.latest;
          const statusLabel = attemptMeta(a.status)?.label ?? humanize(a.status);
          return (
            <button
              type="button"
              onClick={() => select(a.id)}
              aria-label={`${channelMeta[c]?.label}: ${statusLabel}${a.simulated ? ", simulated source" : ""}${cell.count > 1 ? `, latest of ${cell.count}` : ""}. Open attempt`}
              aria-haspopup="dialog"
              className="-mx-1 inline-flex items-center gap-1.5 rounded-control px-1 py-1 transition-colors duration-150 hover:bg-surface-3"
            >
              <AttemptBadge status={a.status} />
              {cell.count > 1 && <span className="text-xs text-ink-3 tabular-nums">{cell.count}</span>}
            </button>
          );
        },
      }),
    ),
  ];

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <span>{summary}.</span>
        {simulated && (
          <span className="inline-flex items-center gap-1.5 text-ink-3">
            Issuer registry answers come from the issuer simulator <SimulatedTag />
          </span>
        )}
      </p>
      <Panel padding="none">
        <DataTable label="Verification by document and channel" density="compact" rows={rows} rowKey={(r) => r.docId} columns={columns} />
      </Panel>

      <Drawer
        open={!!sel}
        onClose={() => select(null)}
        width={560}
        title={sel ? (channelMeta[sel.channel]?.label ?? humanize(sel.channel)) : "Verification attempt"}
        description={sel?.document_id && docs[sel.document_id] ? label(docs[sel.document_id].declared_type) : undefined}
        footer={
          sel && canManual && NEEDS_MANUAL.has(sel.status) && sel.channel !== "manual_confirmation" && !all.some((x) => x.request?.follows === sel.id) ? (
            <>
              <Button variant="ghost" onClick={() => select(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form={formId} loading={pending}>
                Record confirmation
              </Button>
            </>
          ) : undefined
        }
      >
        {sel && <AttemptDetail a={sel} all={all} canManual={canManual} formId={formId} onPending={setPending} onRecorded={(n) => select(n.id)} />}
      </Drawer>
    </div>
  );
}
