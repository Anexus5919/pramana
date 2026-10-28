import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage, qk } from "../../../api";
import { fmtDate, fmtDateTime, fmtMs, fmtRelative, fmtValue, pluralize } from "../../../lib/format";
import { humanize, reviewActionLabel, roleLabel, roundLabel as roundName, roundPhrase, SEVERITIES, severityRank, stageLabel, type Tone } from "../../../lib/labels";
import { actionLabel } from "../../audit/chain";
import { workspacePath } from "../../../shell/nav";
import type { AuditEvent, ChainVerification, Finding, RunBrief, Stage } from "../../../types";
import {
  ActionMenu,
  Button,
  Callout,
  Checkbox,
  Code,
  DataTable,
  DescriptionList,
  Digest,
  Drawer,
  EmptyState,
  ErrorState,
  Panel,
  PanelDivider,
  SegmentedControl,
  SeverityIndicator,
  Skeleton,
  StatusBadge,
  Toolbar,
  type Column,
} from "../../../ui2";
import { useWorkspace } from "../context";
import { useParam, useRun, useSetParams } from "../data";

type View = "runs" | "audit";

/** Activity: what ran and when (runs, replay, compare), and whether the record is intact (audit trail). */
export function ActivitySection() {
  const [viewParam, setView] = useParam("view");
  const view: View = viewParam === "audit" ? "audit" : "runs";
  return (
    <div className="space-y-6">
      <Toolbar>
        <SegmentedControl
          label="View"
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: "runs", label: "Runs" },
            { value: "audit", label: "Audit trail" },
          ]}
        />
      </Toolbar>
      {view === "runs" ? <RunsView /> : <AuditView />}
    </div>
  );
}

/* Runs ------------------------------------------------------------------- */

const RUN_STATUS: Record<string, { tone: Tone; label: string }> = {
  complete: { tone: "verified", label: "Complete" },
  failed: { tone: "mismatch", label: "Failed" },
  interrupted: { tone: "mismatch", label: "Failed" },
  running: { tone: "pending", label: "Running" },
  queued: { tone: "pending", label: "Running" },
};

function RunStatus({ run }: { run: RunBrief }) {
  const m = RUN_STATUS[run.status] ?? { tone: "unchecked" as Tone, label: humanize(run.status) };
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

function roundLabel(r: RunBrief): string {
  return `${roundName(r.round)}${r.replay_of ? ", replay" : ""}`;
}

function severityText(r: RunBrief): string {
  return SEVERITIES.filter((s) => r.by_severity?.[s])
    .map((s) => `${r.by_severity[s]} ${s}`)
    .join(", ");
}

function stageNote(s: Stage): string | null {
  const bits: string[] = [];
  if (typeof s.documents === "number") bits.push(pluralize(s.documents, "document"));
  if (typeof s.newly_processed === "number" && s.newly_processed) bits.push(`${s.newly_processed} newly processed`);
  if (typeof s.evaluated === "number") bits.push(`${s.evaluated} rules evaluated`);
  if (typeof s.facts === "number") bits.push(`${s.facts} facts`);
  if (typeof s.links === "number") bits.push(pluralize(s.links, "link"));
  return bits.length ? bits.join(", ") : null;
}

function replayResult(run: RunBrief, all: RunBrief[]): string | null {
  if (!run.replay_of) return null;
  const original = all.find((r) => r.id === run.replay_of);
  if (!original) return "Replay of an earlier run";
  const same = !!original.report_digest && original.report_digest === run.report_digest;
  return `Replay of the ${roundPhrase(original.round)} run: ${same ? "reproduced identically" : "report differs from the original"}`;
}

function RunsView() {
  const { app, actions } = useWorkspace();
  const q = useQuery({ queryKey: qk.runs(app.id), queryFn: () => api.runs(app.id) });
  const [sp] = useSearchParams();
  const setParams = useSetParams();
  const [openId, setOpenId] = useState<string | null>(null);

  const runs = useMemo(() => [...(q.data ?? [])].sort((x, y) => (y.started_at ?? "").localeCompare(x.started_at ?? "")), [q.data]);
  const latest = runs[0];
  const byId = (id: string | null) => runs.find((r) => r.id === id) ?? null;
  // Default comparison: the previous run as A and the latest as B; "none" clears a slot
  const aParam = sp.get("a");
  const bParam = sp.get("b");
  const a = byId(aParam) ?? (aParam === null && runs.length > 1 ? runs[1] : null);
  const b = byId(bParam) ?? (bParam === null && runs.length > 1 ? runs[0] : null);

  const pick = (r: RunBrief) => {
    if (a?.id === r.id) return setParams({ a: "none" });
    if (b?.id === r.id) return setParams({ b: "none" });
    if (!a) return setParams({ a: r.id });
    if (!b) return setParams({ b: r.id });
    setParams({ a: b.id, b: r.id });
  };
  const compareWithLatest = (r: RunBrief) => latest && setParams({ a: r.id, b: latest.id });

  if (q.isPending)
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading runs</span>
        <Skeleton className="h-48" />
      </div>
    );
  if (q.error) return <ErrorState error={q.error} title="Could not load runs" onRetry={() => void q.refetch()} />;
  if (!runs.length)
    return (
      <Panel>
        <EmptyState
          size="sm"
          title="No runs yet"
          description="Run validation to create the first run."
          action={actions.validate ? <Button onClick={actions.validate}>Run validation</Button> : undefined}
        />
      </Panel>
    );

  const columns: Column<RunBrief>[] = [
    {
      id: "pick",
      header: <span className="sr-only">Compare</span>,
      width: "44px",
      cell: (r) => (
        <Checkbox checked={a?.id === r.id || b?.id === r.id} onChange={() => pick(r)} aria-label={`Compare ${roundLabel(r).toLowerCase()}`} />
      ),
    },
    { id: "round", header: "Round", cell: (r) => roundLabel(r) },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <RunStatus run={r} />
          {r.id === latest?.id && <span className="text-xs text-ink-3">Latest</span>}
          {r.replay_of && <span className="text-xs text-ink-3">Replay</span>}
        </span>
      ),
    },
    { id: "started", header: "Started", cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.started_at)}</span> },
    { id: "actor", header: "Actor", hideBelow: "xl", cell: (r) => r.triggered_by ?? "System" },
    { id: "asof", header: "As of", hideBelow: "2xl", cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.as_of)}</span> },
    {
      id: "findings",
      header: "Findings",
      cell: (r) => (
        <span>
          <span className="font-medium tabular-nums">{r.findings ?? 0}</span>
          {severityText(r) && <span className="ml-2 text-xs text-ink-3">{severityText(r)}</span>}
        </span>
      ),
    },
    { id: "ruleset", header: "Ruleset", hideBelow: "2xl", cell: (r) => <Code className="text-xs">{r.ruleset_id}</Code> },
    {
      id: "digest",
      header: "Report digest",
      hideBelow: "xl",
      cell: (r) => <Digest value={r.report_digest} label={`Report digest of ${roundLabel(r).toLowerCase()}`} head={8} tail={6} copy={false} />,
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "56px",
      align: "right",
      cell: (r) => (
        <ActionMenu
          label={`Actions for ${roundLabel(r).toLowerCase()}`}
          items={[
            { id: "compare", label: "Compare with latest", onSelect: () => compareWithLatest(r), hidden: r.id === latest?.id },
            { id: "replay", label: "Replay this run", onSelect: () => actions.replay?.(r.id), hidden: !actions.replay || r.status !== "complete" },
            { id: "pack", label: "Export evidence pack", onSelect: () => actions.exportPack?.(), hidden: !actions.exportPack },
          ]}
        />
      ),
    },
  ];

  const ordered = a && b && a.id !== b.id ? ((a.started_at ?? "") <= (b.started_at ?? "") ? ([a, b] as const) : ([b, a] as const)) : null;
  const openRun = byId(openId);

  return (
    <div className="space-y-6">
      <Panel padding="none">
        {/* Visible overflow keeps the row menus from being clipped; columns hide on narrow screens instead of scrolling */}
        <DataTable
          label="Validation runs, newest first"
          rows={runs}
          columns={columns}
          rowKey={(r) => r.id}
          linkColumn="round"
          onRowClick={(r) => setOpenId(r.id)}
          selectedKey={openId}
          className="overflow-visible!"
        />
      </Panel>

      {ordered ? (
        <CompareRuns appId={app.id} a={ordered[0]} b={ordered[1]} onClear={() => setParams({ a: "none", b: "none" })} />
      ) : (
        <p className="text-sm text-ink-3">
          {runs.length < 2
            ? "Run validation again, or replay the latest run, to compare findings across runs."
            : "Tick two runs to compare their findings."}
        </p>
      )}

      <RunDrawer
        run={openRun}
        all={runs}
        latestId={latest?.id}
        onClose={() => setOpenId(null)}
        onCompare={(r) => {
          compareWithLatest(r);
          setOpenId(null);
        }}
        onReplay={actions.replay}
      />
    </div>
  );
}

function compareLine({ label, a, b, same, changed }: { label: string; a: string | null; b: string | null; same: string; changed: string }) {
  const eq = !!a && a === b;
  return { label, value: <span className={eq ? "text-ink-2" : "font-medium text-ink"}>{eq ? "Same" : "Changed"}</span>, hint: eq ? same : changed };
}

function FindingList({ title, items, appId, empty }: { title: string; items: Finding[]; appId: string; empty: string }) {
  return (
    <section className="min-w-0">
      <h3 className="text-sm font-semibold text-ink">
        {title} <span className="font-normal text-ink-3 tabular-nums">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {items.map((f) => (
            <li key={f.fingerprint}>
              <Link
                to={workspacePath(appId, "findings", { finding: f.id })}
                className="flex min-w-0 items-center gap-3 rounded py-2 text-sm text-ink transition-colors duration-150 hover:text-ink-2 hover:underline"
              >
                <SeverityIndicator severity={f.severity} className="w-24 shrink-0" />
                <span className="min-w-0 truncate">{f.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CompareRuns({ appId, a, b, onClear }: { appId: string; a: RunBrief; b: RunBrief; onClear: () => void }) {
  const qa = useQuery({ queryKey: qk.findings(appId, a.id), queryFn: () => api.findings(appId, a.id), staleTime: 5 * 60_000 });
  const qb = useQuery({ queryKey: qk.findings(appId, b.id), queryFn: () => api.findings(appId, b.id), staleTime: 5 * 60_000 });
  const diff = useMemo(() => {
    if (!qa.data || !qb.data) return null;
    const inA = new Set(qa.data.map((f) => f.fingerprint));
    const inB = new Set(qb.data.map((f) => f.fingerprint));
    const bySev = (x: Finding, y: Finding) => (severityRank[x.severity] ?? 9) - (severityRank[y.severity] ?? 9);
    return {
      appeared: qb.data.filter((f) => !inA.has(f.fingerprint)).sort(bySev),
      resolved: qa.data.filter((f) => !inB.has(f.fingerprint)).sort(bySev),
      persisted: qb.data.filter((f) => inA.has(f.fingerprint)).sort(bySev),
    };
  }, [qa.data, qb.data]);

  return (
    <Panel
      title="Compare runs"
      description={`${roundLabel(a)} to ${roundLabel(b).toLowerCase()}. Findings are matched by fingerprint, so a finding that persists keeps its identity.`}
      actions={
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      }
    >
      <DescriptionList
        labelWidth={120}
        items={[
          compareLine({ label: "Ruleset", a: a.ruleset_hash, b: b.ruleset_hash, same: "Both runs applied the same rules.", changed: "The rules changed between these runs." }),
          compareLine({
            label: "Inputs",
            a: a.input_digest,
            b: b.input_digest,
            same: "Same documents, declared data and reference records.",
            changed: "Documents, declared data or reference records changed.",
          }),
          compareLine({ label: "Report", a: a.report_digest, b: b.report_digest, same: "The findings are byte for byte the same.", changed: "The findings differ; see below." }),
        ]}
      />
      <PanelDivider />
      {qa.error || qb.error ? (
        <ErrorState error={qa.error ?? qb.error} title="Could not load findings for these runs" onRetry={() => void (qa.refetch(), qb.refetch())} />
      ) : !diff ? (
        <div role="status" className="grid gap-6 md:grid-cols-3">
          <span className="sr-only">Loading findings for both runs</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <FindingList title={`Appeared in the ${roundPhrase(b.round)} run`} items={diff.appeared} appId={appId} empty="Nothing new." />
          <FindingList title={`Resolved since the ${roundPhrase(a.round)} run`} items={diff.resolved} appId={appId} empty="Nothing resolved." />
          <FindingList title="Persisted" items={diff.persisted} appId={appId} empty="No findings in common." />
        </div>
      )}
    </Panel>
  );
}

function RunDrawer({
  run,
  all,
  latestId,
  onClose,
  onCompare,
  onReplay,
}: {
  run: RunBrief | null;
  all: RunBrief[];
  latestId: string | undefined;
  onClose: () => void;
  onCompare: (r: RunBrief) => void;
  onReplay?: (runId?: string) => void;
}) {
  const full = useRun(run?.id);
  const stages = full.data?.stages ?? [];
  const total = stages.reduce((t, s) => t + s.ms, 0);
  const resolved = full.data?.resolved_since_previous ?? [];
  const canCompare = !!run && run.id !== latestId;
  const canReplay = !!run && !!onReplay && run.status === "complete";

  return (
    <Drawer
      open={!!run}
      onClose={onClose}
      width={560}
      title={run ? roundLabel(run) : "Run"}
      description={run ? `Started ${fmtDateTime(run.started_at)}` : undefined}
      footer={
        run && (canCompare || canReplay) ? (
          <>
            {canCompare && <Button onClick={() => onCompare(run)}>Compare with latest</Button>}
            {canReplay && (
              <Button
                onClick={() => {
                  onReplay?.(run.id);
                  onClose();
                }}
              >
                Replay this run
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {run && (
        <div className="space-y-6 p-5">
          {run.error && (
            <Callout tone="danger" title="The run stopped with an error">
              {run.error}
            </Callout>
          )}
          <DescriptionList
            labelWidth={140}
            items={[
              { label: "Status", value: <RunStatus run={run} /> },
              { label: "Started", value: fmtDateTime(run.started_at) },
              { label: "Finished", value: run.finished_at ? fmtDateTime(run.finished_at) : null },
              { label: "Started by", value: run.triggered_by ?? "System" },
              { label: "As of", value: fmtDate(run.as_of) },
              { label: "Ruleset", value: <Code>{run.ruleset_id}</Code> },
              { label: "Engine", value: <Code>{run.engine_version}</Code> },
              { label: "Findings", value: `${run.findings ?? 0}${severityText(run) ? `: ${severityText(run)}` : ""}` },
              { label: "Inputs digest", value: <Digest value={run.input_digest} label="Inputs digest" head={12} tail={8} /> },
              { label: "Report digest", value: <Digest value={run.report_digest} label="Report digest" head={12} tail={8} /> },
              { label: "Replay", value: replayResult(run, all), hidden: !run.replay_of },
            ]}
          />

          <section aria-labelledby="run-stages">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 id="run-stages" className="text-base font-semibold text-ink">
                Stage timings
              </h3>
              {stages.length > 0 && <span className="text-xs text-ink-3 tabular-nums">{fmtMs(total)} total</span>}
            </div>
            {full.isPending ? (
              <div role="status" className="space-y-2">
                <span className="sr-only">Loading stage timings</span>
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : full.error ? (
              <ErrorState error={full.error} title="Could not load this run" onRetry={() => void full.refetch()} />
            ) : stages.length === 0 ? (
              <p className="text-sm text-ink-3">No stage timings were recorded for this run.</p>
            ) : (
              <ol className="divide-y divide-line">
                {stages.map((s) => (
                  <li key={s.stage} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{stageLabel[s.stage] ?? humanize(s.stage)}</span>
                      {stageNote(s) && <span className="block text-xs text-ink-3">{stageNote(s)}</span>}
                    </span>
                    <span className="shrink-0 text-sm text-ink-2 tabular-nums">{s.ms ? fmtMs(s.ms) : "Under 1 ms"}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="run-resolved">
            <h3 id="run-resolved" className="mb-2 text-base font-semibold text-ink">
              Resolved since the previous run
            </h3>
            {full.isPending ? (
              <Skeleton className="h-8" />
            ) : resolved.length === 0 ? (
              <p className="text-sm text-ink-3">{full.data?.previous_run ? "Nothing was resolved between this run and the one before." : "No earlier run to compare with."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {resolved.map((r, i) => (
                  <li key={`${r.code}-${i}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 text-ink">{r.title}</span>
                    <Code className="shrink-0 text-xs">{r.code}</Code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

/* Audit trail ------------------------------------------------------------ */

function actionText(action: string): string {
  const dot = action.indexOf(".");
  const [obj, verb] = dot >= 0 ? [action.slice(0, dot), action.slice(dot + 1)] : ["", action];
  if (obj === "finding" && reviewActionLabel[verb]) return `Finding: ${reviewActionLabel[verb]}`;
  if (action === "verification.manual_recorded") return "Manual verification recorded";
  if (obj === "ec_report") return actionLabel(action);
  return humanize(`${obj} ${verb}`.trim());
}

function actorText(e: AuditEvent): string {
  return e.actor_role ? `${e.actor}, ${roleLabel[e.actor_role] ?? humanize(e.actor_role)}` : e.actor;
}

function detailValue(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : fmtValue(v);
}

function VerifyResult({ v, onShow, canShow }: { v: ChainVerification; onShow: () => void; canShow: boolean }) {
  const badCheckpoints = v.checkpoints.filter((c) => !c.signature_valid || !c.matches_chain).length;
  const checkpoints = v.checkpoints.length
    ? badCheckpoints
      ? ` ${pluralize(badCheckpoints, "signed checkpoint")} did not verify.`
      : ` ${pluralize(v.checkpoints.length, "signed checkpoint")} verified and ${v.checkpoints.length === 1 ? "matches" : "match"} the chain.`
    : "";
  return v.intact ? (
    <Callout tone="success" title="Chain intact" role="status">
      {pluralize(v.events_checked, "event")} checked across the whole system chain, not only this application. Every hash matches its contents and links to the
      one before it.{checkpoints} Head hash <Digest value={v.head_hash} label="Head hash" head={10} tail={6} copy={false} />
    </Callout>
  ) : (
    <Callout
      tone="danger"
      title={`Chain broken at event #${v.first_broken_seq}`}
      role="alert"
      action={
        canShow ? (
          <Button size="sm" onClick={onShow}>
            Show event
          </Button>
        ) : undefined
      }
    >
      Events from this point on cannot be trusted until the break is explained.{checkpoints}
    </Callout>
  );
}

function AuditView() {
  const { app, role } = useWorkspace();
  const q = useQuery({ queryKey: qk.appAudit(app.id), queryFn: () => api.applicationAudit(app.id) });
  const verify = useMutation({ mutationFn: api.verifyAudit });
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const canVerify = role === "officer" || role === "admin";

  const events = useMemo(() => [...(q.data ?? [])].sort((x, y) => x.seq - y.seq), [q.data]);
  const v = verify.data ?? null;
  const broken = v?.first_broken_seq ?? null;
  const open = events.find((e) => e.seq === openSeq) ?? null;

  return (
    <Panel
      title="Audit trail"
      description="Every action on this application. Each event stores the hash of the event before it, so a change anywhere breaks every link after it."
      padding="none"
      actions={
        canVerify ? (
          <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate()}>
            {v ? "Verify again" : "Verify chain"}
          </Button>
        ) : undefined
      }
    >
      {(v || verify.error) && (
        <div className="px-5 pb-4">
          {verify.error ? (
            <Callout tone="danger" title="The chain could not be verified" role="alert">
              {errorMessage(verify.error)}
            </Callout>
          ) : (
            v && <VerifyResult v={v} canShow={events.some((e) => e.seq === broken)} onShow={() => setOpenSeq(broken)} />
          )}
        </div>
      )}
      <div className="border-t border-line">
        {q.isPending ? (
          <div role="status" className="space-y-2 p-5">
            <span className="sr-only">Loading the audit trail</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : q.error ? (
          <ErrorState className="m-5" error={q.error} title="Could not load the audit trail" onRetry={() => void q.refetch()} />
        ) : events.length === 0 ? (
          <EmptyState size="sm" title="No audit events" description="Nothing has been recorded for this application yet." />
        ) : (
          <AuditTable events={events} broken={broken} selected={openSeq} onOpen={setOpenSeq} />
        )}
      </div>
      <AuditDrawer e={open} broken={broken} onClose={() => setOpenSeq(null)} />
    </Panel>
  );
}

const TH = "h-9 px-3 text-left text-xs font-medium whitespace-nowrap text-ink-3";
const TD = "h-9 px-3 align-middle";

/** Compact event table; a muted row stands in for events from other applications between two of these. */
function AuditTable({ events, broken, selected, onOpen }: { events: AuditEvent[]; broken: number | null; selected: number | null; onOpen: (seq: number) => void }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Audit events for this application, oldest first</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={TH} style={{ width: 64 }}>
              #
            </th>
            <th scope="col" className={TH}>
              Action
            </th>
            <th scope="col" className={TH}>
              Actor
            </th>
            <th scope="col" className={TH}>
              Time
            </th>
            <th scope="col" className={`${TH} hidden md:table-cell`}>
              Hash
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const prev = events[i - 1];
            const gap = prev ? e.seq - prev.seq - 1 : 0;
            const isBroken = broken !== null && e.seq === broken;
            return (
              <Fragment key={e.seq}>
                {gap > 0 && (
                  <tr className="border-b border-line">
                    <td colSpan={5} className={`${TD} text-xs text-ink-3`}>
                      {pluralize(gap, "event")} from other applications
                    </td>
                  </tr>
                )}
                <tr
                  aria-selected={selected === e.seq}
                  onClick={(ev) => {
                    if (ev.target instanceof Element && ev.target.closest("button")) return;
                    onOpen(e.seq);
                  }}
                  className={`cursor-pointer border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-surface-2 ${selected === e.seq ? "bg-brand-soft hover:bg-brand-soft" : ""}`}
                >
                  <td className={`${TD} text-ink-3 tabular-nums`}>{e.seq}</td>
                  <td className={TD}>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
                      <button type="button" onClick={() => onOpen(e.seq)} className="rounded text-left font-medium text-ink hover:underline">
                        {actionText(e.action)}
                      </button>
                      <Code className="hidden text-xs text-ink-3 lg:inline">{e.action}</Code>
                      {isBroken && <StatusBadge tone="mismatch">Hash does not match</StatusBadge>}
                    </span>
                  </td>
                  <td className={`${TD} text-ink-2`}>{actorText(e)}</td>
                  <td className={`${TD} whitespace-nowrap text-ink-2`}>
                    <span title={fmtDateTime(e.ts)}>{fmtRelative(e.ts)}</span>
                  </td>
                  <td className={`${TD} hidden md:table-cell`}>
                    <Code className="text-xs text-ink-3">{e.hash.slice(0, 10)}</Code>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditDrawer({ e, broken, onClose }: { e: AuditEvent | null; broken: number | null; onClose: () => void }) {
  const details = Object.entries(e?.details ?? {});
  return (
    <Drawer open={!!e} onClose={onClose} width={520} title={e ? actionText(e.action) : "Audit event"} description={e ? `Event #${e.seq}, ${fmtDateTime(e.ts)}` : undefined}>
      {e && (
        <div className="space-y-6 p-5">
          {broken !== null && e.seq === broken && (
            <Callout tone="danger" title="This event's hash does not match its contents">
              The event was changed after it was recorded, or the link to the event before it is broken.
            </Callout>
          )}
          <DescriptionList
            labelWidth={120}
            items={[
              { label: "Action", value: <Code>{e.action}</Code> },
              { label: "Actor", value: actorText(e) },
              { label: "Time", value: fmtDateTime(e.ts) },
              {
                label: "Object",
                value: (
                  <span>
                    {humanize(e.object_type)} {e.object_id && <Code>{e.object_id}</Code>}
                  </span>
                ),
              },
            ]}
          />
          <section aria-labelledby="audit-details">
            <h3 id="audit-details" className="mb-2 text-base font-semibold text-ink">
              Details
            </h3>
            {details.length === 0 ? (
              <p className="text-sm text-ink-3">No details recorded.</p>
            ) : (
              <DescriptionList labelWidth={120} items={details.map(([k, val]) => ({ label: humanize(k), value: detailValue(val), mono: true }))} />
            )}
          </section>
          <section aria-labelledby="audit-chain">
            <h3 id="audit-chain" className="mb-2 text-base font-semibold text-ink">
              Chain
            </h3>
            <DescriptionList
              labelWidth={120}
              items={[
                { label: "Previous hash", value: <Digest value={e.prev_hash} label="Previous hash" head={16} tail={12} /> },
                { label: "This event's hash", value: <Digest value={e.hash} label="Event hash" head={16} tail={12} /> },
              ]}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}
