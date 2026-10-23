import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtBytes, fmtDateTime, fmtRelative, pluralize } from "../../lib/format";
import type { Tone } from "../../lib/labels";
import { workspacePath } from "../../shell/nav";
import type { PlatformStatus, RetentionPlan } from "../../types";
import {
  Button,
  Code,
  DataTable,
  DescriptionList,
  Dialog,
  ErrorState,
  Field,
  MetaList,
  Page,
  PageHeader,
  Panel,
  PanelDivider,
  Skeleton,
  StatusBadge,
  Textarea,
  cn,
  useToast,
  type Column,
} from "../../ui2";

const RUN_STATUS: Record<string, { tone: Tone; label: string }> = {
  complete: { tone: "verified", label: "Complete" },
  failed: { tone: "mismatch", label: "Failed" },
  interrupted: { tone: "manual", label: "Interrupted" },
  queued: { tone: "pending", label: "Queued" },
  running: { tone: "pending", label: "Running" },
};

const MIN_REASON = 10;

/** A row of up to four figures inside a panel: hairline-divided cells, not cards and not a nested panel. */
function MiniStats({ items }: { items: { label: string; value: ReactNode; alert?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 bg-surface px-4 py-3">
          <dt className="truncate text-xs text-ink-3">{it.label}</dt>
          <dd className={cn("mt-0.5 text-md font-semibold tabular-nums", it.alert ? "text-mismatch-fg" : "text-ink")}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type RecentRun = PlatformStatus["jobs"]["recent"][number];

const RUN_COLUMNS: Column<RecentRun>[] = [
  { id: "app", header: "Application", cell: (r) => <span className="font-mono text-sm">{r.application_id}</span> },
  { id: "round", header: "Round", hideBelow: "sm", cell: (r) => <span className="text-ink-2">{r.round}</span> },
  {
    id: "status",
    header: "Status",
    cell: (r) => <StatusBadge tone={RUN_STATUS[r.status]?.tone ?? "unchecked"}>{RUN_STATUS[r.status]?.label ?? r.status}</StatusBadge>,
  },
  {
    id: "when",
    header: "Finished",
    align: "right",
    cell: (r) => {
      const at = r.finished_at ?? r.started_at;
      return (
        <span className="whitespace-nowrap text-ink-3" title={fmtDateTime(at)}>
          {r.finished_at ? fmtRelative(at) : "Not finished"}
        </span>
      );
    },
  },
];

function Runs({ s }: { s: PlatformStatus }) {
  const j = s.jobs;
  return (
    <Panel
      title="Runs"
      description="Submit, Run validation and Re-read return at once and run on a worker thread; progress streams to the page."
      padding="none"
    >
      <div className="px-5 pb-4">
        <DescriptionList
          labelWidth={132}
          items={[
            { label: "Mode", value: j.background_runs ? "Background, with live progress" : "Synchronous, background runs switched off" },
            {
              label: "Job workers",
              value: j.workers,
              hint: s.database === "sqlite" ? "One on SQLite, so job writes never compete" : "Up to two on PostgreSQL",
            },
            { label: "Running now", value: j.active.length ? pluralize(j.active.length, "run") : "None" },
          ]}
        />
      </div>
      <div className="border-t border-line">
        <DataTable
          label="Recent validation runs"
          rows={j.recent}
          columns={RUN_COLUMNS}
          rowKey={(r) => r.id}
          rowHref={(r) => workspacePath(r.application_id, "activity")}
          density="compact"
          empty="No validation run yet."
        />
      </div>
    </Panel>
  );
}

function Sandbox({ s }: { s: PlatformStatus }) {
  const b = s.sandbox;
  const peaks = b.idle_workers.map((w) => w.peak_mb).filter((v): v is number => v !== null);
  return (
    <Panel
      title="Parser sandbox"
      description="Text and OCR, forensics, fingerprints, QR decoding, page rendering and upload checks run in separate worker processes."
      actions={<StatusBadge tone={b.enabled ? "verified" : "unchecked"}>{b.enabled ? "On" : "Off"}</StatusBadge>}
    >
      <DescriptionList
        labelWidth={132}
        items={[
          { label: "Isolation", value: b.enforced.isolation },
          { label: "Memory cap", value: b.enforced.memory },
          { label: "Time limit", value: b.enforced.timeout },
          { label: "Processes", value: b.enforced.processes },
          {
            label: "Idle workers",
            value: b.idle_workers.length,
            hint: peaks.length ? `Peak ${Math.round(Math.max(...peaks))} of ${b.memory_mb} MB` : undefined,
          },
        ]}
      />
      <div className="mt-4">
        <MiniStats
          items={[
            { label: "Parses", value: b.stats.calls },
            { label: "Stopped", value: b.stats.unsafe, alert: b.stats.unsafe > 0 },
            { label: "Started", value: b.stats.spawned },
            { label: "Mean time", value: b.stats.mean_ms === null ? "None yet" : `${Math.round(b.stats.mean_ms)} ms` },
          ]}
        />
      </div>
      {b.recent_unsafe.length > 0 && (
        <>
          <PanelDivider label="Recently stopped" />
          <ul className="divide-y divide-line">
            {b.recent_unsafe.map((u, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm first:pt-0">
                <span className="min-w-0 text-ink-2">
                  <Code>{u.op}</Code>: {u.reason}
                </span>
                <span className="shrink-0 text-xs text-ink-3" title={fmtDateTime(u.at)}>
                  {fmtRelative(u.at)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function Keys({ s }: { s: PlatformStatus }) {
  const k = s.keys;
  const total = Object.values(k.files_by_kid).reduce((a, b) => a + b, 0);
  return (
    <Panel title="Document encryption" description="Each stored file has its own AES-256-GCM data key, wrapped by the master key.">
      <DescriptionList
        labelWidth={148}
        items={[
          { label: "Active master key", value: k.active_kid, mono: true },
          { label: "Master keys held", value: k.master_keys.join(", "), mono: true },
          {
            label: "Files per key",
            value: (
              <MetaList
                items={Object.entries(k.files_by_kid).map(([kid, n]) => (
                  <span key={kid}>
                    <Code>{kid}</Code> {n}
                    {kid === k.active_kid && <span className="text-ink-3"> (active)</span>}
                  </span>
                ))}
              />
            ),
            hint: `${pluralize(total, "file")} encrypted, including cached page previews`,
          },
          {
            label: "Older format",
            value: k.legacy_files ? `${pluralize(k.legacy_files, "file")} still use the single storage key` : "None",
            hint: k.legacy_files ? "Run scripts/keys.py migrate" : undefined,
          },
        ]}
      />
      <p className="mt-4 text-xs text-ink-3 text-pretty">
        Rotate with <code className="font-mono text-xs text-ink-2">python scripts/keys.py rotate --retire</code>: every data key is rewrapped under a new master key and the files
        themselves are not rewritten.
      </p>
    </Panel>
  );
}

function SignIn({ s }: { s: PlatformStatus }) {
  const t = s.login_throttle;
  const mins = Math.round(t.window_s / 60);
  return (
    <Panel title="Sign-in protection">
      <DescriptionList
        labelWidth={148}
        items={[
          { label: "Per client address", value: `${t.max_attempts_per_ip} attempts per ${mins} min` },
          {
            label: "Per username",
            value: `${t.max_failures_per_username} failed passwords per ${mins} min`,
            hint: "Each lockout is written to the audit log once.",
          },
          { label: "Session cookie", value: s.cookies.session_cookie, mono: true, hint: "httpOnly, SameSite=Strict, CSRF token on every change" },
          { label: "HTTPS mode", value: s.cookies.secure ? `On, ${s.cookies.hsts}` : "Off for the local http demo (PRAMANA_COOKIE_SECURE)" },
        ]}
      />
    </Panel>
  );
}

const POLICY_ROWS: { key: string; label: string; clock: string }[] = [
  { key: "documents_after_close_days", label: "Document files", clock: "After the application is closed or withdrawn" },
  { key: "previews_days", label: "Page previews", clock: "After rendering" },
  { key: "run_events_days", label: "Run progress events", clock: "After the run finished" },
  { key: "sessions_after_expiry_days", label: "Sign-in sessions", clock: "After expiry" },
  { key: "always", label: "Hashes, findings, audit log", clock: "Never purged" },
];

function Retention({ s, admin }: { s: PlatformStatus; admin: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const plan = useQuery({ queryKey: qk.retention, queryFn: api.retentionPlan, enabled: admin });
  const purge = useMutation({
    mutationFn: () => api.retentionPurge(false, reason.trim()),
    onSuccess: (r: RetentionPlan) => {
      setConfirm(false);
      setReason("");
      setTouched(false);
      void qc.invalidateQueries({ queryKey: qk.retention });
      void qc.invalidateQueries({ queryKey: qk.platform });
      toast.success("Retention purge complete", `${pluralize(r.documents_purged ?? 0, "document file")} deleted. Hashes, findings and the audit log are kept.`);
    },
  });
  const p = plan.data;
  const due = p ? p.documents_eligible + p.previews_eligible + p.run_events_eligible + p.sessions_eligible : 0;
  const reasonOk = reason.trim().length >= MIN_REASON;
  const close = () => {
    if (purge.isPending) return;
    setConfirm(false);
    setTouched(false);
  };

  const policyColumns: Column<(typeof POLICY_ROWS)[number]>[] = [
    { id: "kind", header: "Kind", cell: (r) => r.label },
    {
      id: "kept",
      header: "Kept for",
      cell: (r) => <span className="whitespace-nowrap">{r.key === "always" ? "Always" : pluralize(s.retention[r.key] ?? 0, "day")}</span>,
    },
    { id: "clock", header: "Counted from", cell: (r) => <span className="text-ink-3">{r.clock}</span> },
  ];

  return (
    <Panel
      title="Retention"
      description="A purge deletes stored bytes past their retention period. Hashes, extracted fields, findings, runs and the audit log are always kept, and each deleted file gets an audit event."
      padding="none"
      className="xl:col-span-2"
      actions={
        admin ? (
          <Button
            variant="danger"
            size="sm"
            leadingIcon={<Trash2 aria-hidden />}
            disabled={!p || due === 0}
            aria-describedby="retention-dry-run"
            onClick={() => setConfirm(true)}
          >
            Purge now
          </Button>
        ) : undefined
      }
    >
      <div className="border-t border-line">
        <DataTable label="Retention policy" rows={POLICY_ROWS} columns={policyColumns} rowKey={(r) => r.key} density="compact" />
      </div>
      <div className="border-t border-line px-5 py-4">
        <h3 className="mb-3 text-sm font-medium text-ink">Dry run, now</h3>
        {!admin ? (
          <p className="text-sm text-ink-3">Only an administrator can preview or run a purge.</p>
        ) : plan.isPending ? (
          <Skeleton className="h-12" rounded="lg" />
        ) : plan.error ? (
          <ErrorState compact error={plan.error} title="Could not load the dry run" onRetry={() => void plan.refetch()} retrying={plan.isFetching} />
        ) : p ? (
          <>
            <DescriptionList
              layout="stacked"
              columns={4}
              items={[
                { label: "Document files due", value: p.documents_eligible, hint: p.documents_eligible ? fmtBytes(p.bytes_eligible) : undefined },
                { label: "Page previews due", value: p.previews_eligible },
                { label: "Run events due", value: p.run_events_eligible },
                { label: "Sessions due", value: p.sessions_eligible },
              ]}
            />
            <p id="retention-dry-run" className="mt-3 text-xs text-ink-3">
              {p.documents.length
                ? `${pluralize(p.documents.length, "file")} belong to closed or withdrawn applications; ${p.documents_eligible} past retention.`
                : "No application is closed or withdrawn, so no document file is on a retention clock yet."}
              {due === 0 && " Nothing is due for purging now."}
            </p>
          </>
        ) : null}
      </div>
      <Dialog
        open={confirm}
        onClose={close}
        title="Purge files past retention"
        description="Deleted files cannot be recovered. Their hashes, findings and audit events stay, and each deletion is recorded."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={purge.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              leadingIcon={<Trash2 aria-hidden />}
              loading={purge.isPending}
              disabled={!reasonOk}
              onClick={() => {
                setTouched(true);
                if (reasonOk) purge.mutate();
              }}
            >
              Purge now
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {p && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-ink">What will be removed</h3>
              <DescriptionList
                labelWidth={168}
                items={[
                  { label: "Document files", value: p.documents_eligible ? `${p.documents_eligible} (${fmtBytes(p.bytes_eligible)})` : "0" },
                  { label: "Page previews", value: String(p.previews_eligible) },
                  { label: "Run progress events", value: String(p.run_events_eligible) },
                  { label: "Sign-in sessions", value: String(p.sessions_eligible) },
                ]}
              />
            </div>
          )}
          <Field
            label="Reason"
            required
            hint={`At least ${MIN_REASON} characters. Say why the purge is needed now.`}
            error={touched && !reasonOk ? `Write at least ${MIN_REASON} characters.` : undefined}
          >
            <Textarea value={reason} rows={3} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} data-autofocus />
          </Field>
          {purge.error && <ErrorState compact error={purge.error} title="The purge did not run" />}
        </div>
      </Dialog>
    </Panel>
  );
}

function PlatformSkeleton() {
  return (
    <Page role="status" aria-live="polite">
      <span className="sr-only">Loading the platform status</span>
      <Skeleton className="h-12 w-80" />
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-72" rounded="lg" />
        ))}
      </div>
    </Page>
  );
}

export default function PlatformPage() {
  const { is } = useAuth();
  const q = useQuery({ queryKey: qk.platform, queryFn: api.platformStatus, refetchInterval: 5000 });

  if (q.isPending) return <PlatformSkeleton />;
  if (!q.data)
    return (
      <Page>
        <ErrorState error={q.error} title="Could not load the platform status" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </Page>
    );

  const s = q.data;
  return (
    <Page>
      <PageHeader
        title="Platform"
        context={
          <MetaList
            items={[
              <span key="db">
                Database <Code>{s.database}</Code>
              </span>,
              s.jobs.active.length ? `${pluralize(s.jobs.active.length, "run")} in progress` : "No run in progress",
              <Link key="audit" to="/audit" className="rounded text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                Audit log
              </Link>,
            ]}
          />
        }
      />
      {q.error && <ErrorState compact error={q.error} title="Showing the last loaded status" />}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Runs s={s} />
        <Sandbox s={s} />
        <Keys s={s} />
        <SignIn s={s} />
        <Retention s={s} admin={is("admin")} />
      </div>
    </Page>
  );
}
