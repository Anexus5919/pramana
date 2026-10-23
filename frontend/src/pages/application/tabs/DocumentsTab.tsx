import { AlertTriangle, ArrowUpRight, Bot, FileText, GitCompareArrows, ScanSearch, ShieldCheck, SquareDashed } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fmtBytes, fmtConfidence, fmtDateTime, fmtValue, pluralize } from "../../../lib/format";
import { channelMeta, humanize } from "../../../lib/labels";
import type { DocumentDetail, DocumentSummary, ExtractedField, Finding, TableRow } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { SeverityMeter, StatusCube } from "../../../ui/Blocks";
import { cn } from "../../../ui/cn";
import { Digest } from "../../../ui/Digest";
import { KeyValue } from "../../../ui/Layout";
import { dur, ease, fadeUp, spring, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { Segmented } from "../../../ui/Tabs";
import { Tooltip } from "../../../ui/Tooltip";
import { useDocTypeLabel, useWorkspace } from "../context";
import { FieldSourceLine, ScriptNote } from "./ScriptNote";
import { appPath, bboxParam, isLlmMethod, llmReportOf, methodLabel, parseBBox, useDocument, useWidth, validBox, type LlmReport } from "../data";
import { CautionNote, ComparisonTable, PaneLabel, RevisionDiffView, SimTag } from "../parts";
import { RevisionPanel, RevisionStage } from "../history/TimeMachine";
import { DocViewer, type Focus } from "../viewer/DocViewer";
import { INSTRUCTION_CODE, instructionLinesOf, type InstructionLine, type OverlayBox } from "../viewer/overlays";

type Panel = "fields" | "forensics" | "verification" | "rows" | "model" | "revisions";
const SPLIT_AT = 860;

const actionCls =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100 disabled:opacity-50";

function useDocParams() {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (patch: Record<string, string | number | null>) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "") n.delete(k);
            else n.set(k, String(v));
          }
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );
  return {
    doc: params.get("doc"),
    page: Number(params.get("page")) || null,
    hl: parseBBox(params.get("hl")),
    hlabel: params.get("hlabel"),
    panel: params.get("panel") as Panel | null,
    set,
  };
}

/** Instruction lines from the document, or from the instruction finding when the API does not return them. */
function instructionLinesFor(doc: DocumentDetail, findings: Finding[] | undefined): InstructionLine[] {
  const own = instructionLinesOf(doc);
  if (own.length) return own;
  const out: InstructionLine[] = [];
  for (const f of findings ?? []) {
    if (f.code !== INSTRUCTION_CODE) continue;
    for (const e of f.evidence) {
      if (e.kind === "region" && (e.document_id ?? f.document_id) === doc.id && e.page && validBox(e.bbox)) out.push({ page: e.page, bbox: e.bbox, text: String(e.value ?? e.raw ?? "") });
    }
  }
  return out;
}

function docFindings(findings: Finding[] | undefined, docId: string): Finding[] {
  return (findings ?? []).filter((f) => f.document_id === docId || f.evidence.some((e) => "document_id" in e && e.document_id === docId));
}

/* ---------- Document list ---------- */

function DocChip({ d, selected, status, onSelect, flagged }: { d: DocumentSummary; selected: boolean; status: string | undefined; onSelect: () => void; flagged: number }) {
  const label = useDocTypeLabel();
  const typeDiffers = !!d.detected_type && d.detected_type !== d.declared_type;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex w-full min-w-0 items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors duration-200",
        selected ? "border-transparent" : "border-line bg-surface hover:border-line-2 hover:bg-surface-2/60",
        d.superseded && "opacity-60",
      )}
    >
      {selected && (
        <motion.span layoutId="doc-selected" transition={spring.snappy} aria-hidden className="absolute inset-0 rounded-[12px] bg-brand-soft ring-1 ring-brand-300/60" />
      )}
      <span className="relative">
        <StatusCube status={status ?? "not_checked"} size={18} explain />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", selected ? "text-brand-ink" : "text-ink")}>{label(d.declared_type)}</span>
        <span className="block truncate text-[11.5px] text-ink-3">{d.original_filename}</span>
      </span>
      <span className="relative flex shrink-0 flex-col items-end gap-1">
        {flagged > 0 && (
          <Tooltip content={`${pluralize(flagged, "finding")} point at this document`}>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-mismatch-bg px-1.5 text-[11px] font-semibold text-mismatch-fg tabular" tabIndex={0}>
              {flagged}
            </span>
          </Tooltip>
        )}
        {typeDiffers && (
          <Tooltip content={`Declared as ${label(d.declared_type)}, but the content reads as ${label(d.detected_type)}.`}>
            <AlertTriangle aria-label="Declared type differs from detected type" className="size-3.5 text-manual-dot" tabIndex={0} />
          </Tooltip>
        )}
      </span>
    </button>
  );
}

/* ---------- Panels ---------- */

function FieldsPanel({ doc, onLocate, onPeek, flash }: { doc: DocumentDetail; onLocate: (f: ExtractedField) => void; onPeek: (key: string | null) => void; flash: string | null }) {
  if (!doc.fields.length) return <EmptyState compact title="No fields defined" description="This document type has no fields to extract." />;
  return (
    <>
    <ScriptNote doc={doc} />
    <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
      {doc.fields.map((f) => {
        const located = !!f.page && validBox(f.bbox);
        const llm = isLlmMethod(f.method);
        const missing = f.status === "missing" || f.value === null;
        const key = `field-${f.id}`;
        return (
          <motion.li
            key={f.id}
            variants={fadeUp}
            data-field={key}
            onPointerEnter={() => located && onPeek(key)}
            onPointerLeave={() => onPeek(null)}
            className={cn("relative px-3 py-2.5 transition-colors duration-200", located && "hover:bg-surface-2/60", flash === key && "bg-brand-soft")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-ink-2">{humanize(f.name)}</span>
                  {llm && (
                    <Tooltip content="Proposed by the language model, then accepted only because the same text was found on the page.">
                      <Tag variant="brand" tabIndex={0} className="gap-1">
                        <Bot aria-hidden className="size-3" /> AI, grounded
                      </Tag>
                    </Tooltip>
                  )}
                  {f.status !== "extracted" && (
                    <span className={cn("inline-flex h-5 items-center rounded-[5px] px-1.5 text-[11px] font-semibold", missing ? "bg-mismatch-bg text-mismatch-fg" : "bg-manual-bg text-manual-fg")}>
                      {humanize(f.status)}
                    </span>
                  )}
                </div>
                <div className={cn("mt-0.5 font-mono text-[13px] break-words", missing ? "text-ink-4" : "text-ink")}>{missing ? "Not found on the page" : fmtValue(f.value)}</div>
                {f.raw && f.raw !== f.value && <div className="mt-0.5 text-xs text-ink-3">Read on the page as "{f.raw}"</div>}
                <FieldSourceLine doc={doc} f={f} />
                <div className="mt-0.5 text-[11.5px] text-ink-3">
                  {[methodLabel(f.method), f.confidence !== null ? `confidence ${fmtConfidence(f.confidence)}` : null, f.page ? `page ${f.page}` : null].filter(Boolean).join(", ")}
                </div>
              </div>
              {located && (
                <button type="button" className={actionCls} onClick={() => onLocate(f)}>
                  <ScanSearch aria-hidden className="size-3.5" /> Locate
                </button>
              )}
            </div>
          </motion.li>
        );
      })}
    </motion.ul>
    </>
  );
}

function ForensicsPanel({ doc, onFocus }: { doc: DocumentDetail; onFocus: (f: Focus) => void }) {
  const signals = doc.forensic_signals ?? [];
  const facts = doc.forensic_facts ?? {};
  const diffs = facts.revision_diffs ?? [];
  const meta = { ...(facts.metadata?.info ?? {}), ...(facts.metadata?.xmp ?? {}) };
  const exif = ["Make", "Model", "Software", "DateTime", "DateTimeOriginal"].filter((k) => facts[k]);
  return (
    <div className="space-y-5">
      <section>
        <PaneLabel aside={<span className="text-xs text-ink-3 tabular">{signals.length}</span>}>Signals</PaneLabel>
        {signals.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-3 py-3 text-sm text-ink-3">No structural or forensic indicators were raised for this file.</p>
        ) : (
          <ul className="space-y-2">
            {signals.map((s, i) => {
              const region = s.evidence.find((e) => (e.kind === "region" || e.kind === "revision_diff") && validBox((e as { bbox?: unknown }).bbox) && (e as { page?: number }).page);
              return (
                <li key={`${s.code}-${i}`} className="rounded-[12px] border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityMeter severity={s.severity} />
                        <span className="text-sm font-medium text-ink">{s.title}</span>
                      </div>
                      <Tag variant="mono" className="mt-1">{s.code}</Tag>
                    </div>
                    {region && (
                      <button
                        type="button"
                        className={actionCls}
                        onClick={() => {
                          const r = region as { page: number; bbox: [number, number, number, number] };
                          onFocus({ page: r.page, bbox: r.bbox, label: s.title });
                        }}
                      >
                        <SquareDashed aria-hidden className="size-3.5" /> Show region
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-ink-2 text-pretty">{s.detail}</p>
                  {s.limitation && <CautionNote className="mt-2">{s.limitation}</CautionNote>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {diffs.length > 0 && (
        <section>
          <PaneLabel>Revision changes</PaneLabel>
          <ul className="space-y-2">
            {diffs.map((d, i) => (
              <li key={i} className="rounded-[12px] border border-line bg-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <GitCompareArrows aria-hidden className="size-4 text-ink-3" /> Page {d.page}
                  </span>
                  {validBox(d.bbox) && (
                    <button type="button" className={actionCls} onClick={() => onFocus({ page: d.page, bbox: d.bbox!, label: "Changed in a later revision" })}>
                      <SquareDashed aria-hidden className="size-3.5" /> Show region
                    </button>
                  )}
                </div>
                <RevisionDiffView diff={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <PaneLabel>File facts</PaneLabel>
        <KeyValue
          labelWidth={128}
          items={[
            { label: "SHA-256", value: <Digest value={doc.sha256} label="SHA-256" /> },
            { label: "Size", value: `${fmtBytes(doc.size_bytes)}, ${pluralize(doc.page_count, "page")}` },
            ...(typeof facts.revisions === "number" ? [{ label: "Revisions", value: String(facts.revisions) }] : []),
            ...(facts.created ? [{ label: "Created", value: fmtDateTime(facts.created) }] : []),
            ...(facts.modified ? [{ label: "Modified", value: fmtDateTime(facts.modified) }] : []),
            ...exif.map((k) => ({ label: humanize(k), value: String(facts[k]), mono: true })),
            ...Object.entries(meta)
              .filter(([, v]) => v)
              .slice(0, 8)
              .map(([k, v]) => ({ label: humanize(k.replace(/^\//, "")), value: String(v), mono: true })),
            ...(facts.metadata?.fonts?.length ? [{ label: "Fonts", value: facts.metadata.fonts.join(", "), mono: true }] : []),
          ]}
        />
      </section>
    </div>
  );
}

function VerificationPanel({ doc }: { doc: DocumentDetail }) {
  const { app } = useWorkspace();
  const attempts = doc.verifications ?? [];
  const latestRun = app.latest_run?.id;
  const shown = attempts.filter((a) => !latestRun || a.run_id === latestRun || a.channel === "manual_confirmation");
  if (!shown.length) return <EmptyState compact title="No verification attempts" description="No verification channel applied to this document on the latest run." />;
  return (
    <div className="space-y-2">
      {shown.map((a) => {
        const r = a.response as { signer?: string; signer_role?: string; note?: string };
        return (
          <article key={a.id} className="rounded-[12px] border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <ShieldCheck aria-hidden className="size-4 text-ink-3" />
                {channelMeta[a.channel]?.label ?? humanize(a.channel)}
                <SimTag channel={a.channel} simulated={a.simulated} />
              </span>
              <span className="text-sm text-ink-2">
                <StatusCube status={a.status} label explain />
              </span>
            </div>
            {(r.signer || r.signer_role) && (
              <p className="mt-1.5 text-xs text-ink-3">
                Signed by <span className="text-ink-2">{r.signer ?? "unknown signer"}</span>
                {r.signer_role && <> as <span className="font-medium text-ink-2">{r.signer_role}</span></>}
              </p>
            )}
            {a.channel === "applicant_signature" && (
              <CautionNote title="Applicant signature" className="mt-2">
                Proves who uploaded the file, not who issued it.
              </CautionNote>
            )}
            {a.detail && <p className="mt-2 text-sm text-ink-2 text-pretty">{a.detail}</p>}
            {a.comparison.length > 0 && <ComparisonTable comparisons={a.comparison} className="mt-2" />}
            <p className="mt-2 text-[11px] text-ink-4">{[a.source_name, a.completed_at ? fmtDateTime(a.completed_at) : null].filter(Boolean).join(", ")}</p>
          </article>
        );
      })}
      <Link to={appPath(app.id, "verification", { attempt: shown[0].id })} className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-brand-ink hover:underline">
        Open in the verification matrix <ArrowUpRight aria-hidden className="size-3" />
      </Link>
    </div>
  );
}

function RowsPanel({ rows, onPeek, onFocus }: { rows: TableRow[]; onPeek: (key: string | null) => void; onFocus: (f: Focus) => void }) {
  const cols = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) if (!k.startsWith("_")) s.add(k);
    return [...s].slice(0, 6);
  }, [rows]);
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[440px] text-[12.5px]">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            <th scope="col" className="px-2.5 py-2 font-semibold">#</th>
            {cols.map((c) => (
              <th key={c} scope="col" className="px-2.5 py-2 font-semibold whitespace-nowrap">
                {humanize(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const located = !!r._page && validBox(r._bbox);
            return (
              <tr
                key={i}
                onPointerEnter={() => located && onPeek(`row-${i}`)}
                onPointerLeave={() => onPeek(null)}
                onClick={() => located && onFocus({ page: r._page!, bbox: r._bbox!, label: `Row ${i + 1}` })}
                className={cn("border-t border-line", located && "cursor-pointer hover:bg-brand-soft/60")}
              >
                <td className="px-2.5 py-1.5 text-ink-3 tabular">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c} className="px-2.5 py-1.5 font-mono whitespace-nowrap text-ink">
                    {fmtValue(r[c])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AlignmentBar({ value, delay }: { value: number; delay: number }) {
  return (
    <span className="flex items-center gap-2" aria-label={`${value}% alignment with the page text`}>
      <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full bg-verified-dot"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay, duration: dur.story, ease: ease.out }}
        />
      </span>
      <span className="text-[11px] text-ink-3 tabular">{value}%</span>
    </span>
  );
}

function ModelPanel({
  doc,
  report,
  lines,
  onLocateField,
  onFocus,
}: {
  doc: DocumentDetail;
  report: LlmReport | null;
  lines: InstructionLine[];
  onLocateField: (name: string) => void;
  onFocus: (f: Focus) => void;
}) {
  const llmFields = doc.fields.filter((f) => isLlmMethod(f.method));
  const model = report?.model ?? llmFields[0]?.method.split(":").slice(2).join(":").replace(/\+grounded\(\d+\)$/, "");
  const provider = report?.provider ?? llmFields[0]?.method.split(":")[1];
  const accepted = report?.accepted ?? llmFields.map((f) => ({ field: f.name, value: f.raw ?? f.value ?? "", alignment: Number(f.method.match(/grounded\((\d+)\)/)?.[1] ?? 0) }));
  const rejected = report?.rejected ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-line bg-surface-2/50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Bot aria-hidden className="size-4 text-brand-500" />
          <span className="text-sm font-semibold text-ink">Model-assisted extraction</span>
          {report && report.external === false && <Tag variant="neutral">Runs on this server</Tag>}
          {report?.external && <Tag variant="demo">External service</Tag>}
        </div>
        <p className="mt-1.5 text-xs text-ink-3 text-pretty">
          Rules extract what they can. For fields they miss, a language model proposes a value. Pramana keeps a proposal only if the same text is found on the page, and
          never uses a line that addresses an automated reader as grounding.
        </p>
        <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {provider && (
            <>
              <dt className="text-ink-3">Model</dt>
              <dd className="font-mono break-all text-ink">
                {provider}
                {model ? ` / ${model}` : ""}
              </dd>
            </>
          )}
          {report && (
            <>
              <dt className="text-ink-3">Asked for</dt>
              <dd className="text-ink">{report.asked.map(humanize).join(", ") || "nothing"}</dd>
            </>
          )}
        </dl>
        {report && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { n: report.asked.length, l: "asked", c: "text-ink" },
              { n: report.accepted.length, l: "grounded", c: "text-verified-fg" },
              { n: report.rejected.length, l: "rejected", c: report.rejected.length ? "text-mismatch-fg" : "text-ink-3" },
            ].map((x) => (
              <div key={x.l} className="rounded-[10px] border border-line bg-surface py-1.5">
                <div className={cn("font-display text-xl font-semibold tabular", x.c)}>{x.n}</div>
                <div className="text-[11px] text-ink-3">{x.l}</div>
              </div>
            ))}
          </div>
        )}
        {!report && (
          <p className="mt-2 text-xs text-ink-3">The full model report was not returned for this document. Showing the fields the model filled.</p>
        )}
      </div>

      {rejected.length > 0 && (
        <section>
          <PaneLabel>Rejected by grounding</PaneLabel>
          <ul className="space-y-2">
            {rejected.map((r, i) => (
              <li key={`${r.field}-${i}`} className="rounded-[12px] border border-mismatch-dot/30 bg-mismatch-bg/40 p-3">
                <div className="text-[13px] font-medium text-ink-2">{humanize(r.field)}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="relative font-mono text-[14px] text-mismatch-fg">
                    {r.proposed}
                    <motion.span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-[2px] w-full origin-left rounded-full bg-mismatch-dot"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.5 + i * 0.15, duration: dur.panel, ease: ease.out }}
                    />
                  </span>
                  <span className="text-xs text-ink-3">proposed by the model</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-2">
                  <span className="font-semibold text-mismatch-fg">Discarded: </span>
                  {r.reason}. The value was not used for any rule.
                </p>
                {(() => {
                  const src = lines.find((l) => r.proposed && l.text.replace(/\s+/g, "").includes(r.proposed.replace(/\s+/g, "")));
                  return src ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-surface/70 px-2.5 py-2">
                      <span className="text-xs text-ink-2">The only place this value appears is a line addressed to an automated reader.</span>
                      <button type="button" className={actionCls} onClick={() => onFocus({ page: src.page, bbox: src.bbox, label: "Where the proposal came from" })}>
                        <SquareDashed aria-hidden className="size-3.5" /> Show the source line
                      </button>
                    </div>
                  ) : null;
                })()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lines.length > 0 && (
        <section>
          <PaneLabel>Text addressed to an automated reader</PaneLabel>
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className="rounded-[12px] border border-manual-dot/40 bg-manual-bg/60 p-3">
                <p className="font-mono text-[12.5px] break-words text-ink">"{l.text}"</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-ink-3">Page {l.page}. Excluded from grounding.</span>
                  <button type="button" className={actionCls} onClick={() => onFocus({ page: l.page, bbox: l.bbox, label: "Instruction text" })}>
                    <SquareDashed aria-hidden className="size-3.5" /> Show on page
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <PaneLabel>Grounded and kept</PaneLabel>
        {accepted.length === 0 ? (
          <p className="text-sm text-ink-3">No model proposals were kept.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
            {accepted.map((a, i) => (
              <li key={`${a.field}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink-2">{humanize(a.field)}</div>
                  <div className="mt-0.5 font-mono text-[13px] break-words text-ink">{a.value}</div>
                  <div className="mt-1">
                    <AlignmentBar value={a.alignment} delay={0.2 + i * 0.08} />
                  </div>
                </div>
                <button type="button" className={actionCls} onClick={() => onLocateField(a.field)}>
                  <ScanSearch aria-hidden className="size-3.5" /> Locate
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- Tab ---------- */

function DocHeader({ doc, status }: { doc: DocumentDetail; status: string | undefined }) {
  const label = useDocTypeLabel();
  const detected = doc.detected_type;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-title text-ink">
          <FileText aria-hidden className="size-4.5 shrink-0 text-ink-3" />
          <span className="truncate">{label(doc.declared_type)}</span>
        </h3>
        <p className="mt-0.5 truncate text-xs text-ink-3">{doc.original_filename}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2 text-ink-2">
          <StatusCube status={status ?? "not_checked"} label explain size={12} />
        </span>
        <Tooltip
          content={
            !detected
              ? "No document type could be recognised from the content, so the declared type was used."
              : detected === doc.declared_type
                ? "The content matches the declared type."
                : `The content reads as ${label(detected)}, not ${label(doc.declared_type)}.`
          }
        >
          <span
            tabIndex={0}
            className={cn(
              "inline-flex h-6 items-center rounded-full px-2 font-medium",
              !detected ? "bg-surface-2 text-ink-3" : detected === doc.declared_type ? "bg-verified-bg text-verified-fg" : "bg-manual-bg text-manual-fg",
            )}
          >
            {!detected ? "Type not detected" : detected === doc.declared_type ? "Type confirmed" : `Reads as ${label(detected)}`}
          </span>
        </Tooltip>
        <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2 text-ink-2">{humanize(doc.text_source ?? "unknown")} text</span>
        {doc.processing_status !== "processed" && (
          <span className="inline-flex h-6 items-center rounded-full bg-mismatch-bg px-2 font-medium text-mismatch-fg">{humanize(doc.processing_status)}</span>
        )}
        {doc.superseded && <Tag variant="neutral">Superseded</Tag>}
      </div>
    </div>
  );
}

export function DocumentsTab() {
  const { app, run, findings } = useWorkspace();
  const navigate = useNavigate();
  const p = useDocParams();
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const split = width >= SPLIT_AT;
  const status = run?.document_status ?? app.latest_run?.document_status ?? {};

  const ordered = useMemo(() => [...app.documents].sort((a, b) => Number(a.superseded) - Number(b.superseded)), [app.documents]);
  const docId = p.doc && app.documents.some((d) => d.id === p.doc) ? p.doc : (ordered[0]?.id ?? null);
  const q = useDocument(docId);
  const doc = q.data && q.data.id === docId ? q.data : undefined;

  const [peek, setPeek] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const page = p.page ?? 1;
  const focus: Focus | null = p.hl ? { page: p.page ?? 1, bbox: p.hl, label: p.hlabel } : null;

  const report = doc ? llmReportOf(doc) : null;
  const lines = useMemo(() => (doc ? instructionLinesFor(doc, findings) : []), [doc, findings]);
  const hasModel = !!doc && (!!report || lines.length > 0 || doc.fields.some((f) => isLlmMethod(f.method)));
  const rows = doc?.rows ?? [];
  const thisDocFindings = useMemo(() => (docId ? docFindings(findings, docId) : []), [findings, docId]);

  const panels: { value: Panel; label: ReactNode; count?: number }[] = doc
    ? [
        { value: "fields", label: "Fields", count: doc.fields.length },
        { value: "forensics", label: "Forensics", count: (doc.forensic_signals ?? []).length || undefined },
        { value: "verification", label: "Verification", count: (doc.verifications ?? []).length || undefined },
        ...(rows.length ? [{ value: "rows" as Panel, label: "Rows", count: rows.length }] : []),
        ...(hasModel ? [{ value: "model" as Panel, label: "AI extraction" }] : []),
        ...(doc.mime === "application/pdf" && doc.forensic_facts
          ? [{ value: "revisions" as Panel, label: "Time machine", count: (doc.forensic_facts.revisions ?? 0) > 1 ? doc.forensic_facts.revisions : undefined }]
          : []),
      ]
    : [];
  const panel: Panel = p.panel && panels.some((x) => x.value === p.panel) ? p.panel : hasModel && (report?.rejected.length || lines.length) ? "model" : "fields";

  const selectDoc = (id: string) => p.set({ doc: id, page: null, hl: null, hlabel: null, panel: null, rev: null });
  const setFocus = (f: Focus) => p.set({ page: f.page, hl: bboxParam(f.bbox), hlabel: f.label ?? null });
  const locate = (f: ExtractedField) => f.page && validBox(f.bbox) && setFocus({ page: f.page, bbox: f.bbox, label: humanize(f.name) });

  // Clicking a field box in the page selects that field in the side panel
  const onBoxClick = (b: OverlayBox) => {
    if (b.findingId) {
      navigate(appPath(app.id, "findings", { finding: b.findingId }));
      return;
    }
    if (b.layer === "fields") {
      p.set({ panel: "fields" });
      setFlash(b.key);
      window.setTimeout(() => {
        wrap.current?.querySelector(`[data-field="${CSS.escape(b.key)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 60);
      window.setTimeout(() => setFlash((k) => (k === b.key ? null : k)), 1400);
    }
  };
  const onHover = useCallback((b: OverlayBox | null) => {
    if (b?.layer === "fields") setFlash(b.key);
    else setFlash(null);
  }, []);

  useEffect(() => setPeek(null), [docId, panel]);

  if (!app.documents.length) return <EmptyState sky title="No documents uploaded" description="The institution has not uploaded any documents for this application." />;

  const findingsCount = (id: string) => docFindings(findings, id).filter((f) => ["open", "acknowledged", "evidence_requested"].includes(f.review_status)).length;

  return (
    <div ref={wrap} className="space-y-4">
      <LayoutGroup id="doc-list">
        <motion.div variants={stagger(0.03)} initial="hidden" animate="show" className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2" role="list" aria-label="Documents">
          {ordered.map((d) => (
            <motion.div key={d.id} variants={fadeUp} role="listitem" className="min-w-0">
              <DocChip d={d} selected={d.id === docId} status={status[d.id]} onSelect={() => selectDoc(d.id)} flagged={findingsCount(d.id)} />
            </motion.div>
          ))}
        </motion.div>
      </LayoutGroup>

      {q.isPending && docId ? (
        <div className={cn("grid gap-4", split && "grid-cols-[minmax(0,1fr)_minmax(320px,380px)]")}>
          <Skeleton className="h-[640px]" rounded="lg" />
          <Skeleton className="h-[640px]" rounded="lg" />
        </div>
      ) : q.error || !doc ? (
        <ErrorState error={q.error} title="Could not load the document" onRetry={() => void q.refetch()} />
      ) : (
        <div className="rounded-panel border border-line bg-surface/70 p-3 shadow-xs sm:p-4">
          <DocHeader doc={doc} status={status[doc.id]} />
          <div className={cn("mt-3 grid gap-4", split && "grid-cols-[minmax(0,1fr)_minmax(320px,380px)]")}>
            {panel === "revisions" ? (
              <RevisionStage doc={doc} className={split ? "h-[min(78vh,880px)]" : "h-[72vh]"} />
            ) : (
              <DocViewer
                doc={doc}
                findings={thisDocFindings}
                page={page}
                onPage={(n) => p.set({ page: n, hl: null, hlabel: null })}
                focus={focus}
                peek={peek}
                onHover={onHover}
                onBoxClick={onBoxClick}
                isClickable={(b) => !!b.findingId || b.layer === "fields"}
                className={split ? "h-[min(78vh,880px)]" : "h-[72vh]"}
              />
            )}
            <aside aria-label="Document details" className={cn("min-w-0", split && "h-[min(78vh,880px)] overflow-y-auto pr-1")}>
              <div className={cn("z-10 -mx-1 bg-surface/0 px-1 pb-3", split && "sticky top-0 bg-gradient-to-b from-surface via-surface to-surface/0")}>
                <div className="overflow-x-auto">
                  <Segmented label="Document detail" options={panels} value={panel} onChange={(v) => p.set({ panel: v })} />
                </div>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${doc.id}-${panel}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0, transition: { duration: dur.ui, ease: ease.out } }}
                  exit={{ opacity: 0, transition: { duration: dur.micro } }}
                >
                  {panel === "fields" && <FieldsPanel doc={doc} onLocate={locate} onPeek={setPeek} flash={flash} />}
                  {panel === "forensics" && <ForensicsPanel doc={doc} onFocus={setFocus} />}
                  {panel === "verification" && <VerificationPanel doc={doc} />}
                  {panel === "rows" && <RowsPanel rows={rows} onPeek={setPeek} onFocus={setFocus} />}
                  {panel === "revisions" && <RevisionPanel doc={doc} />}
                  {panel === "model" && (
                    <ModelPanel
                      doc={doc}
                      report={report}
                      lines={lines}
                      onFocus={setFocus}
                      onLocateField={(name) => {
                        const f = doc.fields.find((x) => x.name === name);
                        if (f) locate(f);
                      }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
              {thisDocFindings.length > 0 && (
                <div className="mt-4 rounded-[12px] border border-line bg-surface-2/50 p-3">
                  <PaneLabel>Findings on this document</PaneLabel>
                  <ul className="space-y-1">
                    {thisDocFindings.slice(0, 6).map((f) => (
                      <li key={f.id}>
                        <Link
                          to={appPath(app.id, "findings", { finding: f.id })}
                          className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink"
                        >
                          <SeverityMeter severity={f.severity} />
                          <span className="min-w-0 flex-1 truncate">{f.title}</span>
                          <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-ink-4" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
