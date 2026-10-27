import { ArrowUpRight, ScanSearch } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtBytes, fmtConfidence, fmtDateTime, fmtValue, pluralize } from "../../../../lib/format";
import { channelMeta, humanize } from "../../../../lib/labels";
import { workspacePath } from "../../../../shell/nav";
import type { DocumentDetail, ExtractedField, TableRow } from "../../../../types";
import {
  Button,
  cn,
  DataTable,
  DescriptionList,
  Digest,
  EmptyState,
  MetaList,
  SeverityIndicator,
  StatusBadge,
  type Column,
} from "../../../../ui2";
import { useWorkspace } from "../../context";
import { isLlmMethod, methodLabel, validBox, type LlmReport } from "../../data";
import { AttemptBadge, ComparisonTable, RevisionDiffView, SimTag } from "../../parts";
import { FieldSourceLine, ScriptNote } from "../../tabs/ScriptNote";
import type { Focus } from "../../viewer/DocViewer";
import type { InstructionLine } from "../../viewer/overlays";
import { OfficerReview } from "./OfficerReview";
import { currentAttempts } from "./shared";

function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
      <span>{children}</span>
      {aside && <span className="text-xs font-normal text-ink-3 tabular-nums">{aside}</span>}
    </h3>
  );
}

function LocateButton({ onClick, label = "Locate" }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="ghost" leadingIcon={<ScanSearch />} onClick={onClick} className="shrink-0">
      {label}
    </Button>
  );
}

/* ---------- Fields ---------- */

function RowsTable({ rows, onFocus }: { rows: TableRow[]; onFocus: (f: Focus) => void }) {
  const cols = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) if (!k.startsWith("_")) s.add(k);
    return [...s].slice(0, 5);
  }, [rows]);
  const indexed = rows.map((r, i) => ({ r, i }));
  const columns: Column<{ r: TableRow; i: number }>[] = [
    { id: "n", header: "#", cell: (x) => <span className="text-ink-3 tabular-nums">{x.i + 1}</span>, width: "48px" },
    ...cols.map((c) => ({ id: c, header: humanize(c), cell: (x: { r: TableRow }) => <span className="font-mono whitespace-nowrap">{fmtValue(x.r[c])}</span> })),
  ];
  return (
    <DataTable
      label="Table rows read from the document"
      density="compact"
      rows={indexed}
      rowKey={(x) => String(x.i)}
      columns={columns}
      onRowClick={(x) => x.r._page && validBox(x.r._bbox) && onFocus({ page: x.r._page, bbox: x.r._bbox, label: `Row ${x.i + 1}` })}
    />
  );
}

export function FieldsPanel({
  doc,
  onLocate,
  onFocus,
  flash,
}: {
  doc: DocumentDetail;
  onLocate: (f: ExtractedField) => void;
  onFocus: (f: Focus) => void;
  flash: string | null;
}) {
  const rows = doc.rows ?? [];
  if (!doc.fields.length && !rows.length) return <EmptyState size="sm" title="No fields defined" description="This document type has no fields to extract." />;
  return (
    <div>
      <ul className="divide-y divide-line">
        {doc.fields.map((f) => {
          const located = !!f.page && validBox(f.bbox);
          const llm = isLlmMethod(f.method);
          const missing = f.status === "missing" || f.value === null;
          const key = `field-${f.id}`;
          return (
            <li key={f.id} data-field={key} className={cn("px-5 py-3 transition-colors duration-150", flash === key && "bg-brand-soft")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-2">{humanize(f.name)}</span>
                    {llm && (
                      <StatusBadge tone="primary" title="Proposed by a language model, then kept only because the same text was found on the page.">
                        AI, grounded
                      </StatusBadge>
                    )}
                    {f.status !== "extracted" && <StatusBadge tone={missing ? "mismatch" : "manual"}>{humanize(f.status)}</StatusBadge>}
                  </div>
                  <div className={cn("mt-0.5 font-mono text-sm break-words", missing ? "text-ink-4" : "text-ink")}>{missing ? "Not found on the page" : fmtValue(f.value)}</div>
                  {f.raw && f.raw !== f.value && <div className="mt-0.5 text-xs text-ink-3">Read on the page as "{f.raw}"</div>}
                  <FieldSourceLine doc={doc} f={f} />
                  <div className="mt-0.5 text-xs text-ink-3">
                    <MetaList items={[methodLabel(f.method), f.confidence !== null ? `confidence ${fmtConfidence(f.confidence)}` : null, f.page ? `page ${f.page}` : null]} />
                  </div>
                </div>
                {located && <LocateButton onClick={() => onLocate(f)} />}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > 0 && (
        <details className="group border-t border-line">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-ink hover:bg-surface-2">Table rows ({rows.length})</summary>
          <div className="border-t border-line">
            <RowsTable rows={rows} onFocus={onFocus} />
          </div>
        </details>
      )}
    </div>
  );
}

/* ---------- Verification (this document) ---------- */

export function DocVerificationPanel({ doc }: { doc: DocumentDetail }) {
  const { app, run } = useWorkspace();
  const shown = currentAttempts(doc.verifications ?? [], app.latest_run?.id);
  // The document's status on the latest run, with later confirmations and reviews applied by the server
  const status = (run?.document_status ?? app.latest_run?.document_status ?? {})[doc.id];
  const review = status ? <OfficerReview doc={doc} status={status} /> : null;
  if (!shown.length)
    return (
      <>
        {review}
        <EmptyState size="sm" title="No verification attempts" description="No verification channel applied to this document on the latest run." />
      </>
    );
  return (
    <div>
      {review}
      <ul className="divide-y divide-line">
        {shown.map((a) => {
          const r = a.response as { signer?: string; signer_role?: string };
          return (
            <li key={a.id} className="space-y-1.5 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {channelMeta[a.channel]?.label ?? humanize(a.channel)}
                  <SimTag channel={a.channel} simulated={a.simulated} />
                </span>
                <AttemptBadge status={a.status} />
              </div>
              {(r.signer || r.signer_role) && (
                <p className="text-xs text-ink-3">
                  Signed by <span className="text-ink-2">{r.signer ?? "unknown signer"}</span>
                  {r.signer_role && <> as {humanize(r.signer_role)}</>}
                </p>
              )}
              {a.detail && <p className="text-sm text-ink-2 text-pretty">{a.detail}</p>}
              {a.comparison.length > 0 && <ComparisonTable comparisons={a.comparison} />}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                <MetaList items={[a.source_name, a.completed_at ? fmtDateTime(a.completed_at) : null]} />
                <Link
                  to={workspacePath(app.id, "documents", { view: "verification", attempt: a.id })}
                  className="inline-flex items-center gap-1 rounded font-medium text-ink-2 hover:text-ink hover:underline"
                >
                  Open attempt <ArrowUpRight aria-hidden className="size-3" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Forensics (officer only) ---------- */

export function ForensicsPanel({ doc, onFocus }: { doc: DocumentDetail; onFocus: (f: Focus) => void }) {
  const signals = doc.forensic_signals ?? [];
  const facts = doc.forensic_facts ?? {};
  const diffs = facts.revision_diffs ?? [];
  const meta = { ...(facts.metadata?.info ?? {}), ...(facts.metadata?.xmp ?? {}) };
  const exif = ["Make", "Model", "Software", "DateTime", "DateTimeOriginal"].filter((k) => facts[k]);
  return (
    <div>
      <section className="pt-4">
        <div className="px-5">
          <SubHeading aside={signals.length}>Indicators</SubHeading>
        </div>
        {signals.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-ink-3">No structural or forensic indicators were raised for this file.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {signals.map((s, i) => {
              const region = s.evidence.find((e) => (e.kind === "region" || e.kind === "revision_diff") && validBox((e as { bbox?: unknown }).bbox) && (e as { page?: number }).page);
              return (
                <li key={`${s.code}-${i}`} className="space-y-1.5 px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">{s.title}</div>
                      <div className="mt-0.5 text-xs text-ink-3">
                        <MetaList items={[<SeverityIndicator key="sev" severity={s.severity} />, <code key="code" className="font-mono text-xs text-ink-2">{s.code}</code>]} />
                      </div>
                    </div>
                    {region && (
                      <LocateButton
                        label="Show region"
                        onClick={() => {
                          const r = region as { page: number; bbox: [number, number, number, number] };
                          onFocus({ page: r.page, bbox: r.bbox, label: s.title });
                        }}
                      />
                    )}
                  </div>
                  <p className="text-sm text-ink-2 text-pretty">{s.detail}</p>
                  {s.limitation && <p className="text-xs text-ink-3 text-pretty">Limitation: {s.limitation}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {diffs.length > 0 && (
        <section className="border-t border-line pt-4">
          <div className="px-5">
            <SubHeading>Revision changes</SubHeading>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {diffs.map((d, i) => (
              <li key={i} className="space-y-2 px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">Page {d.page}</span>
                  {validBox(d.bbox) && <LocateButton label="Show region" onClick={() => onFocus({ page: d.page, bbox: d.bbox!, label: "Changed in a later revision" })} />}
                </div>
                <RevisionDiffView diff={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-line px-5 py-4">
        <SubHeading>File facts</SubHeading>
        <DescriptionList
          labelWidth={128}
          items={[
            { label: "SHA-256", value: <Digest value={doc.sha256} label="SHA-256" /> },
            { label: "Size", value: `${fmtBytes(doc.size_bytes)}, ${pluralize(doc.page_count, "page")}` },
            { label: "Revisions", value: String(facts.revisions), hidden: typeof facts.revisions !== "number" },
            { label: "Created", value: fmtDateTime(facts.created), hidden: !facts.created },
            { label: "Modified", value: fmtDateTime(facts.modified), hidden: !facts.modified },
            ...exif.map((k) => ({ label: humanize(k), value: String(facts[k]), mono: true })),
            ...Object.entries(meta)
              .filter(([, v]) => v)
              .slice(0, 8)
              .map(([k, v]) => ({ label: humanize(k.replace(/^\//, "")), value: String(v), mono: true })),
            { label: "Fonts", value: facts.metadata?.fonts?.join(", "), mono: true, hidden: !facts.metadata?.fonts?.length },
          ]}
        />
      </section>
    </div>
  );
}

/* ---------- Extraction: model-assisted fields, Hindi OCR, instruction lines ---------- */

export function ExtractionPanel({
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
  const hasModel = !!report || llmFields.length > 0;
  const hindi = (doc.ocr_scripts ?? []).some((n) => n.script === "devanagari");
  const model = report?.model ?? llmFields[0]?.method.split(":").slice(2).join(":").replace(/\+grounded\(\d+\)$/, "");
  const provider = report?.provider ?? llmFields[0]?.method.split(":")[1];
  const accepted = report?.accepted ?? llmFields.map((f) => ({ field: f.name, value: f.raw ?? f.value ?? "", alignment: Number(f.method.match(/grounded\((\d+)\)/)?.[1] ?? 0) }));
  const rejected = report?.rejected ?? [];

  if (!hasModel && !hindi && !lines.length)
    return (
      <EmptyState
        size="sm"
        title="Rules read every field"
        description="No language model was asked for this document, no Hindi text needed OCR and no text addressed an automated reader."
      />
    );

  return (
    <div className="divide-y divide-line">
      {hindi && (
        <section className="px-5 py-4">
          <ScriptNote doc={doc} />
        </section>
      )}

      {hasModel && (
        <section className="space-y-3 px-5 py-4">
          <SubHeading>Model-assisted extraction</SubHeading>
          <p className="text-sm text-ink-2 text-pretty">
            Rules extract what they can. For fields they miss, a language model proposes a value. Pramana keeps a proposal only if the same text is found on the page,
            and never uses a line that addresses an automated reader as grounding.
          </p>
          <DescriptionList
            labelWidth={112}
            items={[
              { label: "Model", value: provider ? `${provider}${model ? ` / ${model}` : ""}` : null, mono: true, hidden: !provider },
              { label: "Runs on", value: "This server", hidden: !report },
              { label: "Asked for", value: report?.asked.map(humanize).join(", ") || "Nothing", hidden: !report },
              {
                label: "Outcome",
                value: report ? `${report.asked.length} asked, ${report.accepted.length} kept, ${report.rejected.length} rejected` : `${accepted.length} kept`,
              },
            ]}
          />
          {!report && <p className="text-xs text-ink-3">The full model report was not returned for this document. Showing the fields the model filled.</p>}
        </section>
      )}

      {rejected.length > 0 && (
        <section className="pt-4">
          <div className="px-5">
            <SubHeading aside={rejected.length}>Rejected by grounding</SubHeading>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {rejected.map((r, i) => {
              const src = lines.find((l) => r.proposed && l.text.replace(/\s+/g, "").includes(r.proposed.replace(/\s+/g, "")));
              return (
                <li key={`${r.field}-${i}`} className="space-y-1.5 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-2">{humanize(r.field)}</span>
                    <StatusBadge tone="mismatch">Discarded</StatusBadge>
                  </div>
                  <div className="font-mono text-sm text-ink line-through decoration-mismatch-dot decoration-2">{r.proposed}</div>
                  <p className="text-sm text-ink-2">
                    {r.reason}. The value was not used for any rule.
                  </p>
                  {src && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-ink-3">The only place this value appears is a line addressed to an automated reader.</span>
                      <LocateButton label="Show the source line" onClick={() => onFocus({ page: src.page, bbox: src.bbox, label: "Where the proposal came from" })} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {lines.length > 0 && (
        <section className="pt-4">
          <div className="px-5">
            <SubHeading aside={lines.length}>Text addressed to an automated reader</SubHeading>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {lines.map((l, i) => (
              <li key={i} className="space-y-1.5 px-5 py-3">
                <p className="font-mono text-sm break-words text-ink">"{l.text}"</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-ink-3">Page {l.page}. Excluded from grounding.</span>
                  <LocateButton label="Show on page" onClick={() => onFocus({ page: l.page, bbox: l.bbox, label: "Instruction text" })} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasModel && (
        <section className="pt-4">
          <div className="px-5">
            <SubHeading aside={accepted.length}>Grounded and kept</SubHeading>
          </div>
          {accepted.length === 0 ? (
            <p className="border-t border-line px-5 py-3 text-sm text-ink-3">No model proposals were kept.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {accepted.map((a, i) => (
                <li key={`${a.field}-${i}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-2">{humanize(a.field)}</div>
                    <div className="mt-0.5 font-mono text-sm break-words text-ink">{a.value}</div>
                    <div className="mt-0.5 text-xs text-ink-3">{a.alignment}% alignment with the page text</div>
                  </div>
                  <LocateButton onClick={() => onLocateField(a.field)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
