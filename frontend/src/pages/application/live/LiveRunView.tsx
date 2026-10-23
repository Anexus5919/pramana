import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fmtMs, pluralize } from "../../../lib/format";
import { channelMeta, humanize, isSignatureChannel, stageLabel, verificationMeta } from "../../../lib/labels";
import { Tag } from "../../../ui/Badge";
import { BlockProgress, StatusCube, type BlockStage } from "../../../ui/Blocks";
import { cn } from "../../../ui/cn";
import { Counter } from "../../../ui/Counter";
import { dur, ease } from "../../../ui/motion";
import { toneClass, verificationTone } from "../../../ui/tone";
import { useDocTypeLabel } from "../context";
import { currentStage, DOC_STEPS, findingsSoFar, RUN_STAGES, type DocStep, type LiveCheck, type LiveDoc, type LiveState } from "./useLiveRun";

const STEP_LABEL: Record<DocStep, string> = {
  read: "Read and OCR",
  extract: "Extraction",
  fingerprints: "Fingerprints",
  forensics: "Forensics",
  qr: "QR codes",
};
const STEP_SHORT: Record<DocStep, string> = { read: "Read", extract: "Fields", fingerprints: "Prints", forensics: "Forensic", qr: "QR" };

type CellState = "done" | "cached" | "current" | "failed" | "pending";

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

function stageBlocks(s: LiveState): BlockStage[] {
  const cur = currentStage(s);
  const failed = s.status === "failed" || s.status === "interrupted";
  const firstMissing = RUN_STAGES.find((k) => !s.stages[k]);
  return RUN_STAGES.map((k) => {
    const st = s.stages[k];
    return {
      key: k,
      label: stageLabel[k] ?? humanize(k),
      state: st ? "done" : failed && k === firstMissing ? "failed" : k === cur ? "current" : "pending",
      ms: st?.ms,
    };
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

function docDetail(d: LiveDoc, active = false): string {
  if (d.cached) return "Read in an earlier run";
  if (d.status === "failed") return "Could not be read safely";
  const next = DOC_STEPS.find((k) => !d.steps[k]);
  if (active && next && !d.status) return `Now: ${STEP_LABEL[next]}`;
  const parts: string[] = [];
  const read = d.steps.read?.info;
  if (read) {
    const src = String(read.text_source ?? "");
    parts.push(src === "ocr" ? "OCR" : src === "digital" ? "Text layer" : src === "mixed" ? "Text and OCR" : humanize(src));
    if (typeof read.pages === "number") parts.push(pluralize(read.pages, "page"));
  }
  const ex = d.steps.extract?.info;
  if (ex && typeof ex.fields === "number") parts.push(pluralize(ex.fields, "field"));
  const fx = d.steps.forensics?.info;
  if (fx && typeof fx.signals === "number" && fx.signals > 0) parts.push(pluralize(fx.signals, "indicator"));
  const ms = DOC_STEPS.reduce((t, k) => t + (d.steps[k]?.ms ?? 0), 0);
  if (ms) parts.push(fmtMs(ms));
  return parts.join(", ") || "Waiting";
}

function Cell({ state, label }: { state: CellState; label: string }) {
  return (
    <span
      title={label}
      className={cn(
        "relative block h-3 overflow-hidden rounded-[4px] transition-colors duration-300",
        state === "done" && "bg-brand-500",
        state === "cached" && "bg-brand-200 dark:bg-brand-300/40",
        state === "current" && "bg-brand-200",
        state === "failed" && "bg-mismatch-dot",
        state === "pending" && "bg-surface-3",
      )}
    >
      {state === "done" && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-white/35" />}
      {state === "current" && <span aria-hidden className="absolute inset-0 shimmer-bg animate-shimmer" />}
    </span>
  );
}

function DocRow({ d, label, active, failed }: { d: LiveDoc; label: string; active: boolean; failed: boolean }) {
  const cells = docCells(d, active, failed);
  const done = cells.filter((c) => c === "done" || c === "cached").length;
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(150px,44%)] items-center gap-3 rounded-[10px] px-2.5 py-2 transition-colors duration-300",
        active && "bg-brand-soft",
      )}
      aria-label={`${label}: ${done} of ${DOC_STEPS.length} steps, ${docDetail(d, active)}`}
    >
      <div className="min-w-0">
        <div className={cn("truncate text-sm font-medium", d.status === "failed" ? "text-mismatch-fg" : "text-ink")}>{label}</div>
        <div className={cn("truncate text-xs", active ? "text-brand-ink" : "text-ink-3")}>{docDetail(d, active)}</div>
      </div>
      <div className="grid grid-cols-5 gap-1" aria-hidden>
        {cells.map((c, i) => (
          <Cell key={DOC_STEPS[i]} state={c} label={`${STEP_LABEL[DOC_STEPS[i]]}${d.steps[DOC_STEPS[i]] ? `, ${fmtMs(d.steps[DOC_STEPS[i]]!.ms)}` : ""}`} />
        ))}
      </div>
    </li>
  );
}

function CheckRow({ c }: { c: LiveCheck }) {
  const tone = verificationTone(c.status);
  const sim = c.simulated ? (isSignatureChannel(c.channel) ? "DEMO" : "SIMULATED") : null;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: -6, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: dur.ui, ease: ease.out }}
      className="flex min-w-0 items-center gap-2 py-1"
    >
      <StatusCube status={c.status} size={13} />
      <span className="min-w-0 truncate text-sm text-ink-2">{channelMeta[c.channel]?.label ?? humanize(c.channel)}</span>
      <span className={cn("shrink-0 text-xs font-medium", toneClass[tone].fg)}>{verificationMeta[c.status]?.label ?? humanize(c.status)}</span>
      {sim && <Tag variant="demo" className="shrink-0">{sim}</Tag>}
    </motion.li>
  );
}

function Tile({ label, children, tone }: { label: string; children: ReactNode; tone?: "alert" | "ok" | "muted" }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-line bg-surface-2/60 px-3.5 py-2.5">
      <div className="eyebrow mb-1 truncate">{label}</div>
      <div
        className={cn(
          "font-display text-2xl leading-none font-semibold tabular",
          tone === "alert" ? "text-mismatch-fg" : tone === "ok" ? "text-verified-fg" : tone === "muted" ? "text-ink-4" : "text-ink",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** What is happening now, in words, for the live region and the panel title. */
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

/** The live body of a run: stage blocks, per-document steps, checks as they land and running counts. */
export function LiveRunView({ s }: { s: LiveState }) {
  const label = useDocTypeLabel();
  const live = s.status === "running" || s.status === "queued";
  const failed = s.status === "failed" || s.status === "interrupted";
  const elapsed = useElapsed(s.startedAt ?? s.queuedAt, s.finishedAt, live);
  const found = findingsSoFar(s);
  const processing = currentStage(s) === "document_processing";
  const activeDoc = processing ? s.docs.findIndex((d) => !d.status) : -1;
  const stalledDoc = failed && !s.stages.document_processing ? s.docs.findIndex((d) => !d.status) : -1;

  const groups = useMemo(() => {
    const order = s.docs.map((d) => d.id);
    const by = new Map<string, LiveCheck[]>();
    for (const c of s.checks) by.set(c.docId, [...(by.get(c.docId) ?? []), c]);
    return [...by.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [s.checks, s.docs]);
  const problems = s.checks.filter((c) => c.status !== "verified" && c.status !== "not_checked").length;
  const verifying = currentStage(s) === "verification";
  const docsDone = s.docs.filter((d) => d.status).length;

  return (
    <div>
      <BlockProgress stages={stageBlocks(s)} showLabels />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section aria-label="Documents" className="min-w-0 rounded-[14px] border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-semibold text-ink">Documents</h3>
            <span className="text-xs text-ink-3 tabular">
              {docsDone} of {s.docs.length}
            </span>
          </div>
          <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_minmax(150px,44%)] gap-3 px-2.5" aria-hidden>
            <span />
            <div className="grid grid-cols-5 gap-1">
              {DOC_STEPS.map((k) => (
                <span key={k} className="truncate text-center text-[11px] font-medium text-ink-4">
                  {STEP_SHORT[k]}
                </span>
              ))}
            </div>
          </div>
          {s.docs.length ? (
            <ul className="space-y-0.5">
              {s.docs.map((d, i) => (
                <DocRow key={d.id ?? `${d.type}-${i}`} d={d} label={label(d.type)} active={i === activeDoc || i === stalledDoc} failed={failed} />
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-3 text-sm text-ink-3">{s.status === "queued" ? "Waiting for the worker to pick up this run." : "No documents."}</p>
          )}
        </section>

        <section aria-label="Verification checks" className="min-w-0 rounded-[14px] border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-semibold text-ink">Verification checks</h3>
            <span className="text-xs text-ink-3 tabular">{pluralize(s.checks.length, "check")}</span>
          </div>
          {groups.length ? (
            <ul className="space-y-2.5 px-1">
              {groups.map(([docId, cs]) => (
                <li key={docId} className="min-w-0">
                  <div className="truncate text-xs font-semibold text-ink-3">{label(cs[0].type)}</div>
                  <ul className="mt-0.5">
                    <AnimatePresence initial={false}>
                      {cs.map((c) => (
                        <CheckRow key={c.seq} c={c} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 py-3 text-sm text-ink-3">
              {verifying ? "Opening the first document's signatures." : s.stages.verification ? "No checks apply to these documents." : "Checks start once every document has been read."}
            </p>
          )}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={live ? "Findings so far" : "Findings"} tone={found ? "alert" : "muted"}>
          <Counter value={found} duration={0.4} />
        </Tile>
        <Tile label="Checks with issues" tone={problems ? "alert" : s.checks.length ? "ok" : "muted"}>
          <Counter value={problems} duration={0.4} />
          <span className="ml-1 text-sm font-normal text-ink-3">/ {s.checks.length}</span>
        </Tile>
        <Tile label="Rules evaluated" tone={s.rules ? undefined : "muted"}>
          {s.rules ? <Counter value={s.rules.evaluated} duration={0.4} /> : "-"}
          {s.rules && (s.rules.outcomes.fail ?? 0) > 0 && <span className="ml-1 text-sm font-normal text-mismatch-fg">{s.rules.outcomes.fail} not met</span>}
        </Tile>
        <Tile label="Elapsed">
          <span className="tabular">{elapsed.toFixed(1)}</span>
          <span className="ml-0.5 text-sm font-normal text-ink-3">s</span>
        </Tile>
      </div>
    </div>
  );
}
