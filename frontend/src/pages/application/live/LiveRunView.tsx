import { useEffect, useMemo, useState } from "react";
import { fmtMs, pluralize } from "../../../lib/format";
import { channelMeta, humanize, stageLabel } from "../../../lib/labels";
import { cn, DescriptionList, SimulatedTag, Stepper, type Step } from "../../../ui2";
import { useDocTypeLabel } from "../context";
import { AttemptBadge } from "../parts";
import { currentStage, DOC_STEPS, findingsSoFar, RUN_STAGES, type DocStep, type LiveCheck, type LiveDoc, type LiveState } from "./useLiveRun";

const STEP_LABEL: Record<DocStep, string> = {
  read: "Read",
  extract: "Fields",
  fingerprints: "Fingerprints",
  forensics: "Forensics",
  qr: "QR codes",
};

type CellState = "done" | "cached" | "current" | "failed" | "pending";

const CELL_TEXT: Record<CellState, string> = {
  done: "Done",
  cached: "Cached",
  current: "Running",
  failed: "Stopped",
  pending: "Waiting",
};

/** Elapsed seconds since a timestamp, ticking only while the run is live. */
export function useElapsed(from: string | null, to: string | null, live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [live]);
  if (!from) return 0;
  const end = to ? new Date(to).getTime() : now;
  return Math.max(0, (end - new Date(from).getTime()) / 1000);
}

function stageSteps(s: LiveState): Step[] {
  const cur = currentStage(s);
  const failed = s.status === "failed" || s.status === "interrupted";
  const firstMissing = RUN_STAGES.find((k) => !s.stages[k]);
  return RUN_STAGES.map((k) => {
    const st = s.stages[k];
    const status = st ? "complete" : failed && k === firstMissing ? "attention" : k === cur ? "current" : "upcoming";
    const description = st
      ? `${fmtMs(st.ms)}${st.findings != null ? `, ${pluralize(st.findings, "finding")} so far` : ""}`
      : status === "attention"
        ? "Stopped here"
        : status === "current"
          ? "Running"
          : undefined;
    return { id: k, label: stageLabel[k] ?? humanize(k), status, description };
  });
}

function docCells(d: LiveDoc, active: boolean, failed: boolean): CellState[] {
  const nextStep = DOC_STEPS.find((k) => !d.steps[k]);
  return DOC_STEPS.map((k) => {
    if (d.steps[k]) return "done";
    if (d.cached) return "cached";
    if (d.status === "failed" || (failed && active)) return k === nextStep ? "failed" : "pending";
    if (d.status === "processed") return "cached";
    return active && k === nextStep ? "current" : "pending";
  });
}

/** What is happening now, in words, for the live region and the callout. */
export function liveHeadline(s: LiveState): string {
  if (s.status === "queued") return "Queued, starting shortly";
  if (s.status === "complete") return "Validation complete";
  if (s.status === "failed") return "Validation did not finish";
  if (s.status === "interrupted") return "Validation was interrupted";
  const cur = currentStage(s);
  if (cur === "document_processing") {
    const done = s.docs.filter((d) => d.status).length;
    return `Reading documents, ${done} of ${s.docs.length} done`;
  }
  if (cur === "verification") return "Verifying signatures, signed QR codes and issuer registries";
  if (cur === "rules") return "Applying the handbook rules";
  if (cur === "forensics") return "Collecting forensic indicators";
  if (cur === "cross_application") return "Checking links with other applications";
  if (cur === "extraction_checks") return "Checking what was read";
  return "Running";
}

function CheckRow({ c, docLabel }: { c: LiveCheck; docLabel: string }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{channelMeta[c.channel]?.label ?? humanize(c.channel)}</span>
        <span className="block truncate text-xs text-ink-3">{docLabel}</span>
      </span>
      {c.simulated && <SimulatedTag />}
      <AttemptBadge status={c.status} />
    </li>
  );
}

/** The live body of a run: stages, per-document steps, checks as they land and running counts. */
export function LiveRunView({ s }: { s: LiveState }) {
  const label = useDocTypeLabel();
  const live = s.status === "running" || s.status === "queued";
  const failed = s.status === "failed" || s.status === "interrupted";
  const elapsed = useElapsed(s.startedAt ?? s.queuedAt, s.finishedAt, live);
  const found = findingsSoFar(s);
  const processing = currentStage(s) === "document_processing";
  const activeDoc = processing ? s.docs.findIndex((d) => !d.status) : -1;
  const stalledDoc = failed && !s.stages.document_processing ? s.docs.findIndex((d) => !d.status) : -1;
  const docsDone = s.docs.filter((d) => d.status).length;
  const verifying = currentStage(s) === "verification";

  const checks = useMemo(() => {
    const order = s.docs.map((d) => d.id);
    return [...s.checks].sort((a, b) => order.indexOf(a.docId) - order.indexOf(b.docId) || a.seq - b.seq);
  }, [s.checks, s.docs]);

  return (
    <div className="space-y-6">
      <DescriptionList
        layout="stacked"
        columns={4}
        items={[
          { label: "Elapsed", value: `${elapsed.toFixed(live ? 0 : 1)} s` },
          { label: "Documents read", value: s.docs.length ? `${docsDone} of ${s.docs.length}` : "None yet" },
          { label: "Checks done", value: String(s.checks.length) },
          { label: live ? "Findings so far" : "Findings", value: String(found) },
        ]}
      />

      <section aria-labelledby="run-stages-h">
        <h3 id="run-stages-h" className="mb-3 text-sm font-semibold text-ink">
          Stages
        </h3>
        <Stepper steps={stageSteps(s)} label="Validation stages" orientation="vertical" />
      </section>

      <section aria-labelledby="run-docs-h">
        <h3 id="run-docs-h" className="mb-2 text-sm font-semibold text-ink">
          Documents
        </h3>
        {s.docs.length ? (
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Steps per document</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="h-8 px-3 text-left font-medium text-ink-3">
                    Document
                  </th>
                  {DOC_STEPS.map((k) => (
                    <th key={k} scope="col" className="h-8 px-2 text-left font-medium whitespace-nowrap text-ink-3">
                      {STEP_LABEL[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.docs.map((d, i) => {
                  const active = i === activeDoc || i === stalledDoc;
                  const cells = docCells(d, active, failed);
                  return (
                    <tr key={d.id ?? `${d.type}-${i}`} className={cn("border-b border-line last:border-b-0", active && "bg-brand-soft")}>
                      <th scope="row" className={cn("h-8 max-w-[180px] truncate px-3 text-left text-sm font-medium", d.status === "failed" ? "text-mismatch-fg" : "text-ink")}>
                        {label(d.type)}
                      </th>
                      {cells.map((c, j) => {
                        const step = d.steps[DOC_STEPS[j]];
                        return (
                          <td
                            key={DOC_STEPS[j]}
                            className={cn(
                              "h-8 px-2 whitespace-nowrap",
                              c === "done" ? "text-ink-2" : c === "current" ? "font-medium text-brand-ink" : c === "failed" ? "font-medium text-mismatch-fg" : "text-ink-4",
                            )}
                          >
                            {c === "done" && step ? fmtMs(step.ms) : CELL_TEXT[c]}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-3">{s.status === "queued" ? "Waiting for the worker to pick up this run." : "No documents."}</p>
        )}
      </section>

      <section aria-labelledby="run-checks-h">
        <h3 id="run-checks-h" className="mb-1 text-sm font-semibold text-ink">
          Verification checks
        </h3>
        {checks.length ? (
          <ul className="divide-y divide-line">
            {checks.map((c) => (
              <CheckRow key={c.seq} c={c} docLabel={label(c.type)} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">
            {verifying ? "Opening the first document's signatures." : s.stages.verification ? "No checks apply to these documents." : "Checks start once every document has been read."}
          </p>
        )}
      </section>
    </div>
  );
}
