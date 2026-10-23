import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, qk } from "../../../api";
import type { Finding, QueuedRun, RunFull } from "../../../types";
import { useInvalidateApp } from "../data";
import { TERMINAL, useLiveRun, type LiveState } from "./useLiveRun";

export type Phase = "idle" | "starting" | "live" | "finishing" | "done" | "error";

export interface ValidationState {
  phase: Phase;
  runId: string | null;
  live: LiveState;
  /** The finished run and the findings it added, once it is complete */
  result: { run: RunFull; added: Finding[] } | null;
  error: unknown;
}

export const REASON_LABEL: Record<string, string> = {
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
