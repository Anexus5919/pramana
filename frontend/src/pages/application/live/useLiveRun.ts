import { useEffect, useReducer } from "react";
import { ApiError, api } from "../../../api";
import type { RunBrief, RunEvent } from "../../../types";

/** Per-document steps in the order the server runs them (pipeline/process.py). */
export const DOC_STEPS = ["read", "extract", "fingerprints", "forensics", "qr"] as const;
export type DocStep = (typeof DOC_STEPS)[number];

/** Run stages in the order the server runs them (pipeline/validate.py). */
export const RUN_STAGES = ["document_processing", "extraction_checks", "verification", "rules", "forensics", "cross_application"] as const;

export const TERMINAL = new Set(["complete", "failed", "interrupted"]);
const CLEAN = new Set(["verified", "not_checked"]);

export interface LiveDoc {
  id: string | null;
  type: string;
  cached: boolean;
  steps: Partial<Record<DocStep, { ms: number; info: Record<string, unknown> }>>;
  status: string | null;
}

export interface LiveCheck {
  seq: number;
  docId: string;
  type: string;
  channel: string;
  status: string;
  simulated: boolean;
  source: string;
}

export interface LiveState {
  runId: string | null;
  status: string;
  reason: string | null;
  lastSeq: number;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  docs: LiveDoc[];
  stages: Record<string, { ms: number; findings: number | null; info: Record<string, unknown> }>;
  checks: LiveCheck[];
  /** Findings counted at the last finished stage */
  stageFindings: number;
  /** Problem checks seen since that stage, each of which becomes a finding */
  pendingFindings: number;
  rules: { evaluated: number; outcomes: Record<string, number> } | null;
  summary: { total: number; by_severity: Record<string, number>; by_category: Record<string, number> } | null;
  error: string | null;
  done: boolean;
  transport: "stream" | "polling" | null;
  run: RunBrief | null;
}

function initial(runId: string | null): LiveState {
  return {
    runId,
    status: runId ? "queued" : "idle",
    reason: null,
    lastSeq: 0,
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    docs: [],
    stages: {},
    checks: [],
    stageFindings: 0,
    pendingFindings: 0,
    rules: null,
    summary: null,
    error: null,
    done: false,
    transport: null,
    run: null,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);

function apply(s: LiveState, e: RunEvent): LiveState {
  if (e.seq <= s.lastSeq) return s;
  const d = e.data ?? {};
  const next: LiveState = { ...s, lastSeq: e.seq };
  switch (e.kind) {
    case "run.queued":
      return { ...next, status: "queued", queuedAt: e.ts, reason: str(d.reason) || null };
    case "run.started": {
      const docs = Array.isArray(d.documents) ? (d.documents as Record<string, unknown>[]) : [];
      return {
        ...next,
        status: "running",
        startedAt: e.ts,
        docs: docs.map((x) => ({ id: str(x.document_id) || null, type: str(x.declared_type), cached: !!x.cached, steps: {}, status: x.cached ? "processed" : null })),
      };
    }
    case "doc.step": {
      const step = str(d.step) as DocStep;
      const { document_id, declared_type, step: _s, ms, ...info } = d;
      void _s;
      return {
        ...next,
        docs: next.docs.map((x) =>
          x.id === document_id || (!x.id && x.type === declared_type) ? { ...x, cached: false, steps: { ...x.steps, [step]: { ms: num(ms), info } } } : x,
        ),
      };
    }
    case "doc.done":
      return {
        ...next,
        docs: next.docs.map((x) => (x.id === d.document_id || (!x.id && x.type === d.declared_type && !x.status) ? { ...x, status: str(d.status) } : x)),
      };
    case "check": {
      const c: LiveCheck = {
        seq: e.seq,
        docId: str(d.document_id),
        type: str(d.declared_type),
        channel: str(d.channel),
        status: str(d.status),
        simulated: !!d.simulated,
        source: str(d.source),
      };
      return { ...next, checks: [...next.checks, c], pendingFindings: next.pendingFindings + (CLEAN.has(c.status) ? 0 : 1) };
    }
    case "rules":
      return { ...next, rules: { evaluated: num(d.evaluated), outcomes: (d.outcomes as Record<string, number>) ?? {} } };
    case "stage.finished": {
      const { stage, ms, findings, ...info } = d;
      const f = typeof findings === "number" ? findings : null;
      return {
        ...next,
        stages: { ...next.stages, [str(stage)]: { ms: num(ms), findings: f, info } },
        stageFindings: f ?? next.stageFindings,
        pendingFindings: f === null ? next.pendingFindings : 0,
      };
    }
    case "findings":
      return {
        ...next,
        summary: {
          total: num(d.total),
          by_severity: (d.by_severity as Record<string, number>) ?? {},
          by_category: (d.by_category as Record<string, number>) ?? {},
        },
        stageFindings: num(d.total),
        pendingFindings: 0,
      };
    case "run.finished":
      return { ...next, status: str(d.status) || "complete", finishedAt: e.ts, error: str(d.error) || null };
    default:
      return next;
  }
}

type Action =
  | { type: "reset"; runId: string | null }
  | { type: "events"; events: RunEvent[] }
  | { type: "run"; run: RunBrief }
  | { type: "done" }
  | { type: "transport"; transport: "stream" | "polling" };

function reducer(s: LiveState, a: Action): LiveState {
  switch (a.type) {
    case "reset":
      return initial(a.runId);
    case "events":
      return a.events.reduce(apply, s);
    case "run":
      return {
        ...s,
        run: a.run,
        status: TERMINAL.has(a.run.status) ? a.run.status : s.status,
        error: s.error ?? a.run.error,
        finishedAt: s.finishedAt ?? a.run.finished_at,
      };
    case "done":
      return { ...s, done: true };
    case "transport":
      return { ...s, transport: a.transport };
  }
}

/** Follows a run's persisted progress events: Server-Sent Events first, polling if the stream cannot open. */
export function useLiveRun(runId: string | null): LiveState {
  const [state, dispatch] = useReducer(reducer, runId, initial);

  useEffect(() => {
    dispatch({ type: "reset", runId });
    if (!runId) return;
    let closed = false;
    let last = 0;
    let timer: number | undefined;
    let es: EventSource | null = null;
    const take = (events: RunEvent[]) => {
      if (!events.length) return;
      last = Math.max(last, ...events.map((e) => e.seq));
      dispatch({ type: "events", events });
    };
    const poll = async () => {
      if (closed) return;
      try {
        const p = await api.runProgress(runId, last);
        if (closed) return;
        take(p.events);
        if (p.run) dispatch({ type: "run", run: p.run });
        if (p.done && !p.events.length) {
          dispatch({ type: "done" });
          return;
        }
      } catch (err) {
        // A run that is gone or not ours ends the view; anything else is retried
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          dispatch({ type: "done" });
          return;
        }
      }
      timer = window.setTimeout(poll, 800);
    };
    const fallback = () => {
      es?.close();
      es = null;
      if (closed) return;
      dispatch({ type: "transport", transport: "polling" });
      void poll();
    };

    if (typeof EventSource === "undefined") fallback();
    else {
      let opened = false;
      es = new EventSource(api.runEventsUrl(runId, 0));
      dispatch({ type: "transport", transport: "stream" });
      es.addEventListener("progress", (m) => {
        opened = true;
        take([JSON.parse((m as MessageEvent<string>).data) as RunEvent]);
      });
      es.addEventListener("end", (m) => {
        const d = JSON.parse((m as MessageEvent<string>).data) as { run: RunBrief | null };
        if (d.run) dispatch({ type: "run", run: d.run });
        dispatch({ type: "done" });
        es?.close();
      });
      // Before the first event an error means the stream is not usable here; afterwards the browser reconnects
      es.onerror = () => {
        if (!opened || es?.readyState === EventSource.CLOSED) fallback();
      };
    }
    return () => {
      closed = true;
      es?.close();
      window.clearTimeout(timer);
    };
  }, [runId]);

  return state;
}

/** Findings counted so far: the last stage's count plus problem checks that will each become a finding. */
export function findingsSoFar(s: LiveState): number {
  return s.summary ? s.summary.total : s.stageFindings + s.pendingFindings;
}

/** The stage that is running now, inferred from the stages that have finished (they run strictly in order). */
export function currentStage(s: LiveState): string | null {
  if (s.status !== "running") return null;
  return RUN_STAGES.find((k) => !s.stages[k]) ?? null;
}
