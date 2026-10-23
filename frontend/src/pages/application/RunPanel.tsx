import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { fmtMs, pluralize, sum } from "../../lib/format";
import { stageLabel } from "../../lib/labels";
import type { Finding, QueuedRun, RunFull } from "../../types";
import { Tag } from "../../ui/Badge";
import { BlockProgress, SeverityMeter } from "../../ui/Blocks";
import { Button, IconButton } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Counter } from "../../ui/Counter";
import { dur, ease } from "../../ui/motion";
import { ErrorState } from "../../ui/States";
import { appPath, useInvalidateApp } from "./data";
import { liveHeadline, LiveRunView } from "./live/LiveRunView";
import { TERMINAL, useLiveRun, type LiveState } from "./live/useLiveRun";

type Phase = "idle" | "starting" | "live" | "finishing" | "done" | "error";

export interface ValidationState {
  phase: Phase;
  runId: string | null;
  live: LiveState;
  /** The finished run and the findings it added, once it is complete */
  result: { run: RunFull; added: Finding[] } | null;
  error: unknown;
}

const REASON_LABEL: Record<string, string> = {
  validate: "Run validation",
  reprocess: "Re-read documents",
  retry: "Retry",
  submitted: "Institution submission",
};

/** Starts runs (validate, re-read, retry), follows them live and resumes a run already in progress on load. */
export function useValidation(appId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateApp(appId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationState["result"]>(null);
  const [error, setError] = useState<unknown>(null);
  const before = useRef<Set<string>>(new Set());
  const alive = useRef(true);
  const live = useLiveRun(runId);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const snapshot = useCallback(() => {
    before.current = new Set((qc.getQueryData<Finding[]>(qk.findings(appId)) ?? []).map((f) => f.fingerprint));
  }, [qc, appId]);

  // A reload, or another officer's run, resumes from the persisted events
  // While idle, look every few seconds so a run started elsewhere (an institution's submission) shows up live
  const active = useQuery({
    queryKey: qk.activeRun(appId),
    queryFn: () => api.activeRun(appId),
    enabled: !!appId && phase === "idle",
    refetchInterval: 5000,
  });
  useEffect(() => {
    const r = active.data?.run;
    if (phase !== "idle" || !r || TERMINAL.has(r.status)) return;
    snapshot();
    setRunId(r.id);
    setPhase("live");
  }, [active.data, phase, snapshot]);

  // When the run ends, load its report, work out what is new and refresh the workspace
  useEffect(() => {
    if (phase !== "live" || !live.done || !runId) return;
    setPhase("finishing");
    void (async () => {
      let done: ValidationState["result"] = null;
      if (live.status === "complete") {
        try {
          const run = await api.run(runId);
          qc.setQueryData(qk.run(runId), run);
          const after = await api.findings(appId, runId);
          done = { run, added: after.filter((f) => !before.current.has(f.fingerprint)) };
        } catch {
          done = null;
        }
      }
      if (!alive.current) return;
      setResult(done);
      setPhase("done");
      invalidate();
      void qc.invalidateQueries({ queryKey: qk.metrics });
    })();
  }, [phase, live.done, live.status, runId, appId, qc, invalidate]);

  const begin = useCallback(
    async (call: () => Promise<RunFull | QueuedRun>) => {
      snapshot();
      setError(null);
      setResult(null);
      setRunId(null);
      setPhase("starting");
      try {
        const r = await call();
        if (!alive.current) return;
        if ("background" in r && r.background) {
          setRunId(r.id);
          setPhase("live");
          return;
        }
        // A server with background runs switched off answers with the finished run
        const run = r as RunFull;
        qc.setQueryData(qk.run(run.id), run);
        const after = await api.findings(appId, run.id).catch(() => [] as Finding[]);
        if (!alive.current) return;
        setResult({ run, added: after.filter((f) => !before.current.has(f.fingerprint)) });
        setPhase("done");
        invalidate();
      } catch (e) {
        if (alive.current) {
          setError(e);
          setPhase("error");
        }
      }
    },
    [appId, qc, invalidate, snapshot],
  );

  const start = useCallback(() => begin(() => api.validate(appId)), [begin, appId]);
  const reprocess = useCallback(() => begin(() => api.reprocess(appId)), [begin, appId]);
  const retry = useCallback((id: string) => begin(() => api.retryRun(id)), [begin]);
  const dismiss = useCallback(() => {
    setPhase("idle");
    setRunId(null);
    setResult(null);
  }, []);

  const state: ValidationState = { phase, runId, live, result, error };
  return { state, start, reprocess, retry, dismiss, pending: phase === "starting" || phase === "live" || phase === "finishing" };
}

function StatusBadge({ s, phase }: { s: LiveState; phase: Phase }) {
  const status = phase === "starting" ? "queued" : s.runId ? s.status : "complete";
  const meta: Record<string, { label: string; cls: string; pulse?: boolean }> = {
    queued: { label: "Queued", cls: "bg-pending-bg text-pending-fg" },
    running: { label: "Live", cls: "bg-brand-soft text-brand-ink", pulse: true },
    complete: { label: "Complete", cls: "bg-verified-bg text-verified-fg" },
    failed: { label: "Failed", cls: "bg-mismatch-bg text-mismatch-fg" },
    interrupted: { label: "Interrupted", cls: "bg-manual-bg text-manual-fg" },
  };
  const m = meta[status] ?? meta.running;
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold tracking-wide uppercase", m.cls)}>
      <span aria-hidden className="relative inline-flex size-1.5">
        {m.pulse && <span className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:hidden" />}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {m.label}
    </span>
  );
}

function Summary({ appId, result }: { appId: string; result: { run: RunFull; added: Finding[] } }) {
  const resolved = result.run.resolved_since_previous ?? [];
  const added = result.added;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-start"
    >
      <div className="flex items-baseline gap-2 pr-4">
        <span className={cn("font-display text-3xl leading-none font-semibold", added.length ? "text-mismatch-fg" : "text-ink-4")}>
          {added.length ? "+" : ""}
          <Counter value={added.length} duration={0.8} />
        </span>
        <span className="text-sm text-ink-3">new {added.length === 1 ? "finding" : "findings"}</span>
      </div>
      <div className="flex items-baseline gap-2 pr-4">
        <span className={cn("font-display text-3xl leading-none font-semibold", resolved.length ? "text-verified-fg" : "text-ink-4")}>
          {resolved.length ? "-" : ""}
          <Counter value={resolved.length} duration={0.8} />
        </span>
        <span className="text-sm text-ink-3">resolved</span>
      </div>
      <div className="min-w-0 space-y-1.5 text-sm">
        {added.slice(0, 3).map((f) => (
          <Link key={f.id} to={appPath(appId, "findings", { finding: f.id })} className="flex min-w-0 items-center gap-2 text-ink hover:text-brand-ink">
            <SeverityMeter severity={f.severity} />
            <span className="truncate">{f.title}</span>
            <ArrowUpRight aria-hidden className="size-3 shrink-0 text-ink-4" />
          </Link>
        ))}
        {resolved.slice(0, 3).map((r) => (
          <div key={r.code} className="flex min-w-0 items-center gap-2 text-ink-3">
            <span aria-hidden className="inline-block h-px w-[22px] shrink-0 bg-verified-dot" />
            <span className="truncate line-through decoration-verified-dot">{r.title}</span>
          </div>
        ))}
        {!added.length && !resolved.length && (
          <p className="text-ink-3">
            Same findings as before: {pluralize(result.run.findings ?? 0, "finding")} on {pluralize(result.run.checklist.length, "rule")}.
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function RunPanel({ appId, v }: { appId: string; v: ReturnType<typeof useValidation> }) {
  const { phase, runId, live, result, error } = v.state;
  const syncRun = !runId ? result?.run : null;
  const total = result ? sum(result.run.stages.map((x) => x.ms)) : 0;
  const ended = live.status === "failed" || live.status === "interrupted";
  const cachedDocs = live.docs.filter((d) => d.cached).length;
  const title =
    phase === "starting"
      ? "Queuing the run"
      : phase === "error"
        ? "Validation could not start"
        : runId
          ? live.status === "complete" && result
            ? `Validation complete in ${fmtMs(total)}`
            : liveHeadline(live)
          : result
            ? `Validation complete in ${fmtMs(total)}`
            : "Validation run";

  return (
    <AnimatePresence initial={false}>
      {phase !== "idle" && (
        <motion.section
          key="run-panel"
          aria-label="Validation run"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto", transition: { duration: dur.panel, ease: ease.out } }}
          exit={{ opacity: 0, height: 0, transition: { duration: dur.ui, ease: ease.inOut } }}
          className="overflow-hidden [overflow-anchor:none]"
        >
          <div className="mb-5 rounded-card border border-brand-200/70 bg-surface p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="eyebrow">Validation run</span>
                  <StatusBadge s={live} phase={phase} />
                  {live.reason && <Tag>{REASON_LABEL[live.reason] ?? live.reason}</Tag>}
                </div>
                <h2 className="font-display text-md font-semibold tracking-title">{title}</h2>
                <p className="mt-0.5 text-sm text-ink-3">
                  {runId
                    ? `Runs on the server in the background; each block fills as that step finishes. Updates by ${
                        live.transport === "polling" ? "polling" : "live stream"
                      }, nothing here is estimated.`
                    : syncRun
                      ? `Ruleset ${syncRun.ruleset_id}, as of ${syncRun.as_of ?? "today"}.`
                      : null}
                </p>
              </div>
              {!v.pending && <IconButton size="sm" label="Close the run panel" icon={<X />} onClick={v.dismiss} />}
            </div>
            <p className="sr-only" aria-live="polite">
              {runId ? liveHeadline(live) : title}
            </p>

            {runId && <LiveRunView s={live} />}
            {syncRun && (
              <BlockProgress
                stages={syncRun.stages.map((st) => ({ key: st.stage, label: stageLabel[st.stage] ?? st.stage, state: "done" as const, ms: st.ms }))}
                showLabels
              />
            )}
            {phase === "error" && <ErrorState className="mt-4" compact error={error} onRetry={() => void v.start()} />}

            {runId && ended && (
              <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-mismatch-dot/30 bg-mismatch-bg px-3.5 py-3">
                <div className="min-w-0 text-sm">
                  <div className="font-semibold text-mismatch-fg">{live.status === "interrupted" ? "The server stopped during this run" : "The run stopped with an error"}</div>
                  <div className="text-ink-2">{live.error ?? "No reason was recorded."} The failure is in the audit trail.</div>
                </div>
                <Button size="sm" leadingIcon={<RotateCcw />} onClick={() => void v.retry(runId)}>
                  Retry run
                </Button>
              </div>
            )}

            <AnimatePresence>{phase === "done" && result && <Summary appId={appId} result={result} />}</AnimatePresence>

            {phase === "done" && runId && live.status === "complete" && cachedDocs > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-surface-2 px-3.5 py-2.5">
                <p className="min-w-0 text-sm text-ink-3">
                  {cachedDocs === live.docs.length ? "Every document was" : cachedDocs === 1 ? "1 document was" : `${cachedDocs} documents were`} read in an earlier
                  run, so only the checks ran now.
                  Re-read them to repeat text extraction, OCR and forensics from the stored files.
                </p>
                <Button size="sm" variant="secondary" leadingIcon={<RefreshCw />} onClick={() => void v.reprocess()}>
                  Re-read {pluralize(live.docs.length, "document")}
                </Button>
              </div>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
