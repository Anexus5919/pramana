import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { fmtMs, pluralize, sum } from "../../lib/format";
import { stageLabel } from "../../lib/labels";
import type { Finding, RunFull } from "../../types";
import { BlockProgress, SeverityMeter, type BlockStage } from "../../ui/Blocks";
import { IconButton } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Counter } from "../../ui/Counter";
import { dur, ease } from "../../ui/motion";
import { ErrorState } from "../../ui/States";
import { appPath, useInvalidateApp } from "./data";

type Phase = "idle" | "running" | "filling" | "done" | "error";

export interface ValidationState {
  phase: Phase;
  tick: number;
  filled: number;
  run: RunFull | null;
  added: Finding[];
  error: unknown;
}

// The order the server runs them in (pipeline/validate.py)
const ORDER = ["document_processing", "extraction_checks", "verification", "rules", "forensics", "cross_application"];

/** Runs POST /validate and drives the stage blocks from the real response. */
export function useValidation(appId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateApp(appId);
  const [s, setS] = useState<ValidationState>({ phase: "idle", tick: 0, filled: 0, run: null, added: [], error: null });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // While pending, one block at a time shimmers in pipeline order
  useEffect(() => {
    if (s.phase !== "running") return;
    const t = window.setInterval(() => setS((x) => ({ ...x, tick: x.tick + 1 })), 420);
    return () => window.clearInterval(t);
  }, [s.phase]);

  // On completion, fill each block with its real duration
  useEffect(() => {
    if (s.phase !== "filling" || !s.run) return;
    if (s.filled >= s.run.stages.length) {
      setS((x) => ({ ...x, phase: "done" }));
      return;
    }
    const t = window.setTimeout(() => setS((x) => ({ ...x, filled: x.filled + 1 })), 140);
    return () => window.clearTimeout(t);
  }, [s.phase, s.filled, s.run]);

  const start = useCallback(async () => {
    const before = new Set((qc.getQueryData<Finding[]>(qk.findings(appId)) ?? []).map((f) => f.fingerprint));
    setS({ phase: "running", tick: 0, filled: 0, run: null, added: [], error: null });
    try {
      const run = await api.validate(appId);
      qc.setQueryData(qk.run(run.id), run);
      const after = await api.findings(appId, run.id).catch(() => [] as Finding[]);
      if (!alive.current) return;
      setS((x) => ({ ...x, phase: "filling", run, added: after.filter((f) => !before.has(f.fingerprint)) }));
      invalidate();
      void qc.invalidateQueries({ queryKey: qk.metrics });
    } catch (error) {
      if (alive.current) setS((x) => ({ ...x, phase: "error", error }));
    }
  }, [appId, qc, invalidate]);

  const dismiss = useCallback(() => setS((x) => ({ ...x, phase: "idle" })), []);
  return { state: s, start, dismiss, pending: s.phase === "running" };
}

function stagesFor(s: ValidationState): BlockStage[] {
  if (s.run && (s.phase === "filling" || s.phase === "done")) {
    return s.run.stages.map((st, i) => ({
      key: st.stage,
      label: stageLabel[st.stage] ?? st.stage,
      state: i < s.filled || s.phase === "done" ? "done" : "pending",
      ms: i < s.filled || s.phase === "done" ? st.ms : undefined,
    }));
  }
  const cur = s.tick % ORDER.length;
  return ORDER.map((k, i) => ({
    key: k,
    label: stageLabel[k] ?? k,
    state: s.phase === "error" ? (i === cur ? "failed" : "pending") : i === cur ? "current" : "pending",
  }));
}

export function RunPanel({ appId, v }: { appId: string; v: ReturnType<typeof useValidation> }) {
  const s = v.state;
  const total = s.run ? sum(s.run.stages.map((x) => x.ms)) : 0;
  const resolved = s.run?.resolved_since_previous ?? [];
  const title =
    s.phase === "running"
      ? "Running the pipeline"
      : s.phase === "error"
        ? "Validation could not run"
        : s.phase === "filling"
          ? "Recording stage timings"
          : s.run?.status === "complete"
            ? `Validation complete in ${fmtMs(total)}`
            : `Validation ${s.run?.status ?? ""}`;

  return (
    <AnimatePresence initial={false}>
      {s.phase !== "idle" && (
        <motion.section
          key="run-panel"
          aria-live="polite"
          aria-label="Validation run"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto", transition: { duration: dur.panel, ease: ease.out } }}
          exit={{ opacity: 0, height: 0, transition: { duration: dur.ui, ease: ease.inOut } }}
          className="overflow-hidden"
        >
          <div className="mb-5 rounded-card border border-brand-200/70 bg-surface p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="eyebrow mb-1">Validation run</div>
                <h2 className="font-display text-md font-semibold tracking-title">{title}</h2>
                <p className="mt-0.5 text-sm text-ink-3">
                  {s.phase === "running"
                    ? "Six stages run on the server. Timings appear when the run returns; nothing here is estimated."
                    : s.run
                      ? `Ruleset ${s.run.ruleset_id}, as of ${s.run.as_of ?? "today"}.`
                      : null}
                </p>
              </div>
              {s.phase !== "running" && <IconButton size="sm" label="Close the run panel" icon={<X />} onClick={v.dismiss} />}
            </div>
            <BlockProgress stages={stagesFor(s)} showLabels />
            {s.phase === "error" && <ErrorState className="mt-4" compact error={s.error} onRetry={() => void v.start()} />}
            <AnimatePresence>
              {s.phase === "done" && s.run && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: dur.panel, ease: ease.out }}
                  className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-start"
                >
                  <div className="flex items-baseline gap-2 pr-4">
                    <span className={cn("font-display text-3xl leading-none font-semibold", s.added.length ? "text-mismatch-fg" : "text-ink-4")}>
                      {s.added.length ? "+" : ""}
                      <Counter value={s.added.length} duration={0.8} />
                    </span>
                    <span className="text-sm text-ink-3">new {s.added.length === 1 ? "finding" : "findings"}</span>
                  </div>
                  <div className="flex items-baseline gap-2 pr-4">
                    <span className={cn("font-display text-3xl leading-none font-semibold", resolved.length ? "text-verified-fg" : "text-ink-4")}>
                      {resolved.length ? "-" : ""}
                      <Counter value={resolved.length} duration={0.8} />
                    </span>
                    <span className="text-sm text-ink-3">resolved</span>
                  </div>
                  <div className="min-w-0 space-y-1.5 text-sm">
                    {s.added.slice(0, 3).map((f) => (
                      <Link
                        key={f.id}
                        to={appPath(appId, "findings", { finding: f.id })}
                        className="flex min-w-0 items-center gap-2 text-ink hover:text-brand-ink"
                      >
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
                    {!s.added.length && !resolved.length && (
                      <p className="text-ink-3">
                        Same findings as before: {pluralize(s.run.findings ?? 0, "finding")} on {pluralize(s.run.checklist.length, "rule")}.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
