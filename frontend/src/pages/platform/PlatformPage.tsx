import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, KeyRound, Lock, ServerCog, Timer, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtBytes, fmtRelative, pluralize } from "../../lib/format";
import type { PlatformStatus, RetentionPlan } from "../../types";
import { Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { Button } from "../../ui/Button";
import { SectionCard } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { Dialog } from "../../ui/Dialog";
import { KeyValue, PageHeader } from "../../ui/Layout";
import { fadeUp, stagger } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { ErrorState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import type { Tone } from "../../ui/tone";

const RUN_TONE: Record<string, Tone> = {
  complete: "verified",
  failed: "mismatch",
  interrupted: "manual",
  queued: "pending",
  running: "pending",
};

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "alert" | "muted" }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-line bg-surface-2/60 px-3 py-2.5">
      <div className="eyebrow mb-1 truncate">{label}</div>
      <div className={cn("font-display text-xl leading-none font-semibold tabular", tone === "alert" ? "text-mismatch-fg" : tone === "muted" ? "text-ink-4" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}

/** Ten blocks filled in proportion, for a worker's peak memory against its cap. */
function BlockMeter({ value, max, label }: { value: number; max: number; label: string }) {
  const n = Math.max(0, Math.min(10, Math.round((value / Math.max(max, 1)) * 10)));
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={cn("block h-2.5 w-2 rounded-[2px]", i < n ? (n >= 9 ? "bg-mismatch-dot" : "bg-brand-500") : "bg-surface-3")} />
      ))}
    </span>
  );
}

function Runs({ s }: { s: PlatformStatus }) {
  const j = s.jobs;
  return (
    <SectionCard
      eyebrow="Validation"
      title="Background runs"
      description="Submit, Run validation and Re-read leave the request at once and run on a worker thread; progress is streamed to the page."
    >
      <KeyValue
        labelWidth={150}
        items={[
          { label: "Mode", value: j.background_runs ? "Background, with live progress" : "Synchronous (background runs switched off)" },
          { label: "Job workers", value: `${j.workers} (${s.database === "sqlite" ? "one on SQLite, so job writes never compete" : "up to two on PostgreSQL"})` },
          { label: "Running now", value: j.active.length ? pluralize(j.active.length, "run") : "None" },
        ]}
      />
      <div className="mt-3">
        <div className="eyebrow mb-2">Recent runs</div>
        <ul className="space-y-1">
          {j.recent.map((r) => (
            <li key={r.id} className="flex min-w-0 items-center gap-2.5 text-sm">
              <StatusCube tone={RUN_TONE[r.status] ?? "unchecked"} size={13} />
              <Link to={`/applications/${encodeURIComponent(r.application_id)}/runs`} className="min-w-0 truncate font-mono text-[13px] text-ink-2 hover:text-brand-ink">
                {r.application_id}
              </Link>
              <span className={cn("shrink-0 text-xs font-medium capitalize", r.status === "failed" ? "text-mismatch-fg" : r.status === "interrupted" ? "text-manual-fg" : "text-ink-3")}>
                {r.status}
              </span>
              <span className="ml-auto shrink-0 text-xs text-ink-4">{fmtRelative(r.finished_at ?? r.started_at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

function Sandbox({ s }: { s: PlatformStatus }) {
  const b = s.sandbox;
  return (
    <SectionCard
      eyebrow="Untrusted files"
      title="Parser sandbox"
      description="Text and OCR, forensics, fingerprints, QR decoding, page rendering and upload checks run in separate worker processes."
      actions={<Tag variant={b.enabled ? "brand" : "neutral"}>{b.enabled ? "On" : "Off"}</Tag>}
    >
      <KeyValue
        labelWidth={110}
        items={[
          { label: "Isolation", value: b.enforced.isolation },
          { label: "Memory cap", value: b.enforced.memory },
          { label: "Time limit", value: b.enforced.timeout },
          { label: "Processes", value: b.enforced.processes },
        ]}
      />
      <div className="mt-3 grid grid-cols-2 gap-2.5 2xl:grid-cols-4">
        <Stat label="Parses" value={b.stats.calls} tone={b.stats.calls ? undefined : "muted"} />
        <Stat label="Stopped" value={b.stats.unsafe} tone={b.stats.unsafe ? "alert" : "muted"} />
        <Stat label="Workers" value={b.stats.spawned} />
        <Stat label="Mean time" value={b.stats.mean_ms === null ? "-" : `${Math.round(b.stats.mean_ms)} ms`} />
      </div>
      {b.idle_workers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {b.idle_workers.map((w) => (
            <li key={w.pid} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <span className="font-mono text-ink-2">pid {w.pid}</span>
              <span>{pluralize(w.tasks, "parse")}</span>
              {w.peak_mb !== null && (
                <span className="inline-flex items-center gap-2">
                  <BlockMeter value={w.peak_mb} max={b.memory_mb} label={`Peak ${w.peak_mb} MB of ${b.memory_mb} MB`} />
                  <span className="tabular">
                    peak {Math.round(w.peak_mb)} of {b.memory_mb} MB
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {b.recent_unsafe.length > 0 && (
        <div className="mt-3 rounded-[10px] border border-mismatch-dot/30 bg-mismatch-bg px-3 py-2 text-xs">
          <div className="mb-1 font-semibold text-mismatch-fg">Recently stopped</div>
          {b.recent_unsafe.map((u, i) => (
            <div key={i} className="text-ink-2">
              <span className="font-mono">{u.op}</span>: {u.reason}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function Keys({ s }: { s: PlatformStatus }) {
  const k = s.keys;
  const total = Object.values(k.files_by_kid).reduce((a, b) => a + b, 0);
  return (
    <SectionCard eyebrow="Storage" title="Document encryption" description="Each stored file has its own AES-256-GCM data key, wrapped by the master key.">
      <KeyValue
        labelWidth={150}
        items={[
          { label: "Active master key", value: k.active_kid, mono: true },
          { label: "Master keys held", value: k.master_keys.join(", "), mono: true },
          {
            label: "Files per key",
            value: Object.entries(k.files_by_kid).map(([kid, n]) => (
              <span key={kid} className="mr-3 inline-flex items-center gap-1.5">
                <StatusCube tone={kid === k.active_kid ? "verified" : "pending"} size={12} />
                <span className="font-mono text-[13px]">{kid}</span>
                <span className="text-ink-3 tabular">{n}</span>
              </span>
            )),
            hint: `${pluralize(total, "file")} encrypted, including cached page previews`,
          },
          {
            label: "Older format",
            value: k.legacy_files ? <span className="text-manual-fg">{pluralize(k.legacy_files, "file")} still use the single storage key</span> : "None",
            hint: k.legacy_files ? "Run scripts/keys.py migrate" : undefined,
          },
        ]}
      />
      <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-surface-2 px-3 py-2 text-xs text-ink-3">
        <KeyRound aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          Rotate with <span className="font-mono text-ink-2">python scripts/keys.py rotate --retire</span>: every data key is rewrapped under a new master
          key and the files themselves are not rewritten.
        </span>
      </p>
    </SectionCard>
  );
}

function SignIn({ s }: { s: PlatformStatus }) {
  const t = s.login_throttle;
  return (
    <SectionCard eyebrow="Accounts" title="Sign-in protection" actions={<Lock aria-hidden className="size-4 text-ink-3" />}>
      <KeyValue
        labelWidth={170}
        items={[
          { label: "Per client address", value: `${t.max_attempts_per_ip} attempts per ${Math.round(t.window_s / 60)} min` },
          { label: "Per username", value: `${t.max_failures_per_username} failed passwords per ${Math.round(t.window_s / 60)} min`, hint: "Each lockout is written to the audit trail once." },
          {
            label: "Session cookie",
            value: <span className="font-mono text-[13px]">{s.cookies.session_cookie}</span>,
            hint: "httpOnly, SameSite=Strict, CSRF token on every change",
          },
          { label: "HTTPS mode", value: s.cookies.secure ? `On, ${s.cookies.hsts}` : "Off for the local http demo (PRAMANA_COOKIE_SECURE)" },
        ]}
      />
    </SectionCard>
  );
}

const POLICY_ROWS: { key: string; label: string; clock: string }[] = [
  { key: "documents_after_close_days", label: "Document files", clock: "after the application is closed or withdrawn" },
  { key: "previews_days", label: "Page previews", clock: "after rendering" },
  { key: "run_events_days", label: "Run progress events", clock: "after the run finished" },
  { key: "sessions_after_expiry_days", label: "Sign-in sessions", clock: "after expiry" },
];

function Retention({ s, admin }: { s: PlatformStatus; admin: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const plan = useQuery({ queryKey: qk.retention, queryFn: api.retentionPlan, enabled: admin });
  const purge = useMutation({
    mutationFn: () => api.retentionPurge(false),
    onSuccess: (r: RetentionPlan) => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: qk.retention });
      void qc.invalidateQueries({ queryKey: qk.platform });
      toast.success("Retention purge complete", `${pluralize(r.documents_purged ?? 0, "document file")} deleted. Hashes, findings and the audit trail are kept.`);
    },
  });
  const p = plan.data;
  return (
    <SectionCard
      eyebrow="Data"
      title="Retention"
      description="A purge deletes stored bytes past their retention period. Hashes, extracted fields, findings, runs and the audit chain are always kept, and each deleted file gets an audit event."
      className="lg:col-span-2"
      actions={
        admin && p && p.documents_eligible + p.previews_eligible + p.run_events_eligible + p.sessions_eligible > 0 ? (
          <Button variant="danger" size="sm" leadingIcon={<Trash2 />} onClick={() => setConfirm(true)}>
            Purge now
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <table className="w-full text-sm">
          <caption className="sr-only">Retention policy</caption>
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="pb-2 font-medium">Kind</th>
              <th className="pb-2 font-medium">Kept for</th>
              <th className="pb-2 font-medium">Counted from</th>
            </tr>
          </thead>
          <tbody>
            {POLICY_ROWS.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="py-2 pr-3 text-ink">{r.label}</td>
                <td className="py-2 pr-3 font-medium whitespace-nowrap text-ink tabular">{pluralize(s.retention[r.key] ?? 0, "day")}</td>
                <td className="py-2 text-ink-3">{r.clock}</td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="py-2 pr-3 text-ink">Hashes, findings, audit chain</td>
              <td className="py-2 pr-3 font-medium text-ink">Always</td>
              <td className="py-2 text-ink-3">never purged</td>
            </tr>
          </tbody>
        </table>
        <div>
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <Timer aria-hidden className="size-3.5" /> Dry run, now
          </div>
          {!admin ? (
            <p className="text-sm text-ink-3">Only an administrator can preview or run a purge.</p>
          ) : plan.isPending ? (
            <Skeleton className="h-24" rounded="lg" />
          ) : plan.error ? (
            <ErrorState compact error={plan.error} onRetry={() => void plan.refetch()} />
          ) : p ? (
            <>
              <div className="grid grid-cols-2 gap-2.5 2xl:grid-cols-4">
                <Stat label="Files due" value={p.documents_eligible} tone={p.documents_eligible ? "alert" : "muted"} />
                <Stat label="Previews" value={p.previews_eligible} tone={p.previews_eligible ? undefined : "muted"} />
                <Stat label="Run events" value={p.run_events_eligible} tone={p.run_events_eligible ? undefined : "muted"} />
                <Stat label="Sessions" value={p.sessions_eligible} tone={p.sessions_eligible ? undefined : "muted"} />
              </div>
              <p className="mt-2.5 text-xs text-ink-3">
                {p.documents.length
                  ? `${pluralize(p.documents.length, "file")} belong to closed or withdrawn applications; ${p.documents_eligible} past retention (${fmtBytes(p.bytes_eligible)}).`
                  : "No application is closed or withdrawn, so no document file is on a retention clock yet."}
              </p>
            </>
          ) : null}
        </div>
      </div>
      <Dialog
        open={confirm}
        onClose={() => !purge.isPending && setConfirm(false)}
        title="Delete files past retention?"
        description="Deleted files cannot be recovered. Their hashes, findings and audit events stay, and each deletion is recorded."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={purge.isPending}>
              Cancel
            </Button>
            <Button variant="danger" leadingIcon={<Trash2 />} loading={purge.isPending} onClick={() => purge.mutate()} data-autofocus>
              Delete {pluralize(p?.documents_eligible ?? 0, "file")}
            </Button>
          </>
        }
      >
        {purge.error && <ErrorState compact error={purge.error} title="Purge did not run" />}
      </Dialog>
    </SectionCard>
  );
}

export default function PlatformPage() {
  const { is } = useAuth();
  const q = useQuery({ queryKey: qk.platform, queryFn: api.platformStatus, refetchInterval: 5000 });
  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Platform"
        description="What this server enforces right now. Every value on this page comes from the running server, and it refreshes every few seconds."
        meta={
          q.data && (
            <>
              <Tag variant="mono">{q.data.database}</Tag>
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                <ServerCog aria-hidden className="size-3.5" />
                {q.data.jobs.active.length ? `${pluralize(q.data.jobs.active.length, "run")} in progress` : "No run in progress"}
              </span>
              <Link to="/audit" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-brand-ink">
                Audit log <ArrowUpRight aria-hidden className="size-3" />
              </Link>
            </>
          )
        }
      />
      {q.isPending ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72" rounded="lg" />
          ))}
        </div>
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} title="Could not load the platform status" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid items-start gap-6 lg:grid-cols-2">
          <motion.div variants={fadeUp} className="min-w-0">
            <Runs s={q.data} />
          </motion.div>
          <motion.div variants={fadeUp} className="min-w-0">
            <Sandbox s={q.data} />
          </motion.div>
          <motion.div variants={fadeUp} className="min-w-0">
            <Keys s={q.data} />
          </motion.div>
          <motion.div variants={fadeUp} className="min-w-0">
            <SignIn s={q.data} />
          </motion.div>
          <motion.div variants={fadeUp} className="min-w-0 lg:col-span-2">
            <Retention s={q.data} admin={is("admin")} />
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
