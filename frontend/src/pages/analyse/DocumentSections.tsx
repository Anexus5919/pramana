import { CircleCheck, ScanSearch, SquareDashed } from "lucide-react";
import { fmtBytes, fmtConfidence, fmtValue, pluralize } from "../../lib/format";
import { humanize, severityRank } from "../../lib/labels";
import type { ExtractedField } from "../../types";
import { Callout, Code, DataTable, DescriptionList, MetaList, PanelDivider, SeverityIndicator, SimulatedTag, StatusBadge, VerificationBadge, cn, type Column } from "../../ui2";
import { isLlmMethod, methodLabel, validBox } from "../application/data";
import { ComparisonTable } from "../application/parts";
import type { Focus } from "../application/viewer/DocViewer";
import type { Analysis } from "./analyseApi";
import { FieldSourceLine, Quiet, ReportPanel, RowAction, ScriptNote } from "./parts";
import { isPdf, signedOnly, TEXT_SOURCE } from "./summary";

type OnFocus = (f: Focus) => void;

const TEXT_TITLE: Record<string, string> = {
  digital: "Read from the text layer",
  ocr: "Read by OCR",
  mixed: "Read from the text layer and by OCR",
  unreadable: "Could not be read",
};

export function IntakeSection({ a }: { a: Analysis }) {
  const pdf = isPdf(a);
  const kind = pdf ? "PDF" : a.mime === "image/png" ? "PNG image" : "JPEG image";
  const active = a.intake.active_content;
  return (
    <ReportPanel id="intake" title="Intake" description="The upload checks an application document goes through, run in the parser sandbox.">
      <DescriptionList
        labelWidth={128}
        items={[
          { label: "Content", value: `${kind}, matching the file extension` },
          { label: "Size", value: `${pluralize(a.page_count, "page")}, ${fmtBytes(a.size_bytes)}, within the upload limits` },
          { label: "Parsing", value: pdf ? "Not password protected and parsed without errors" : "Decoded safely, within the pixel limit" },
          { label: "Encoding", value: pdf ? "Never re-encoded, so signatures and revisions stay intact" : "Never re-encoded, so metadata and Content Credentials stay intact" },
          {
            label: "Active content",
            hidden: !pdf,
            value:
              active.length === 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <CircleCheck aria-hidden className="size-4 text-verified-fg" /> None: no scripts, launch actions or embedded files
                </span>
              ) : (
                <ul className="space-y-1">
                  {active.map((x) => (
                    <li key={x.key}>
                      <Code>{x.key}</Code> <span className="text-ink-3">x{x.count}</span>
                      <span className="block text-ink-2">{x.meaning}. Never executed; the file is only parsed.</span>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      {a.intake.notes.length > 0 && <p className="mt-3 text-xs text-ink-3">{a.intake.notes.join(" ")}</p>}
    </ReportPanel>
  );
}

type PageRow = Analysis["document"]["pages"][number];

export function TextSection({ a }: { a: Analysis }) {
  const doc = a.document;
  const columns: Column<PageRow>[] = [
    { id: "page", header: "Page", width: "64px", cell: (p) => <span className="text-ink-2">{p.page_no}</span> },
    {
      id: "source",
      header: "Read by",
      cell: (p) => {
        const dev = (doc.ocr_scripts ?? []).find((n) => n.page === p.page_no && n.script === "devanagari");
        return (
          <span className={cn(p.text_source === "unreadable" && "font-medium text-mismatch-fg")}>
            {TEXT_SOURCE[p.text_source] ?? humanize(p.text_source)}
            {dev && <span className="text-ink-3">{dev.read === false ? ", Hindi not read" : ", Devanagari recogniser"}</span>}
          </span>
        );
      },
    },
    { id: "conf", header: "OCR confidence", cell: (p) => <span className="text-ink-2">{p.ocr_mean_confidence !== null ? fmtConfidence(p.ocr_mean_confidence) : "Not OCR"}</span> },
    { id: "words", header: "Words", align: "right", cell: (p) => <span className="text-ink-2">{p.text ? p.text.split(/\s+/).filter(Boolean).length : 0}</span> },
  ];
  return (
    <ReportPanel
      id="text"
      title="Text"
      padding="none"
      description={
        <MetaList items={[TEXT_TITLE[a.text.source ?? ""] ?? "Read from the page", a.text.hindi_lines > 0 ? pluralize(a.text.hindi_lines, "Hindi line") : null]} />
      }
    >
      {(doc.ocr_scripts ?? []).some((n) => n.script === "devanagari") && (
        <div className="px-5 pb-4">
          <ScriptNote doc={doc} />
        </div>
      )}
      <div className="border-t border-line">
        <DataTable label="How each page was read" density="compact" rows={doc.pages.slice(0, 12)} columns={columns} rowKey={(p) => String(p.page_no)} />
      </div>
      {doc.pages.length > 12 && <p className="border-t border-line px-5 py-2.5 text-xs text-ink-3">{doc.pages.length - 12} more pages read the same way.</p>}
      {a.text.unreadable_pages.length > 0 && (
        <div className="border-t border-line p-5">
          <Callout tone="warning" title="Needs review">
            {pluralize(a.text.unreadable_pages.length, "page")} could not be read ({a.text.unreadable_pages.join(", ")}). Nothing is guessed for these pages.
          </Callout>
        </div>
      )}
    </ReportPanel>
  );
}

export function TypeSection({ a }: { a: Analysis }) {
  const cls = a.doc_type.classification;
  const cands = cls?.candidates ?? [];
  return (
    <ReportPanel
      id="type"
      title="Document type"
      description={a.doc_type.label ?? "Not one of the ruleset's document types"}
      actions={<code className="font-mono text-xs text-ink-3">{cls?.method ?? "keyword-rules"}</code>}
    >
      {cands.length === 0 ? (
        <Quiet>
          No document type in the ruleset scored enough. That is expected for a gazette or any document outside the AICTE checklist: no fields are read and no issuer
          registry is queried, but signatures, QR codes, revisions and structure are still checked.
        </Quiet>
      ) : (
        <ul className="divide-y divide-line">
          {cands.map((c, i) => (
            <li key={c.type} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">
                  {a.doc_type.labels[c.type] ?? humanize(c.type)}
                  {i === 0 && !cls?.ambiguous && a.doc_type.type === c.type && <span className="ml-2 text-xs font-normal text-ink-3">Chosen</span>}
                </span>
                <span className="text-xs text-ink-3">Score {c.score}</span>
              </div>
              <div className="mt-0.5 font-mono text-xs break-words text-ink-3">
                {c.matched.join(", ")}
                {c.excluded_by.length > 0 && (
                  <>
                    {c.matched.length > 0 && ", "}
                    <span className="line-through">{c.excluded_by.join(", ")}</span>
                    <span className="font-sans"> (excluded)</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {cls?.ambiguous && <p className="mt-3 text-sm font-medium text-manual-fg">Two types scored the same, so neither was chosen.</p>}
    </ReportPanel>
  );
}

export function FieldsSection({ a, onLocate, onPeek }: { a: Analysis; onLocate: (f: ExtractedField) => void; onPeek: (key: string | null) => void }) {
  const fields = a.document.fields;
  const read = fields.filter((f) => f.value !== null).length;
  return (
    <ReportPanel
      id="fields"
      title="Fields"
      padding="none"
      description={fields.length ? `${read} of ${pluralize(fields.length, "field")} read. Hover a value to see its box on the page.` : "No fields for this type"}
    >
      {fields.length === 0 ? (
        <div className="px-5 pb-5">
          <Quiet>Fields are defined per document type, and this file did not match one.</Quiet>
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {fields.map((f) => {
            const located = !!f.page && validBox(f.bbox);
            const missing = f.status === "missing" || f.value === null;
            const key = `field-${f.id}`;
            return (
              <li
                key={f.id}
                onPointerEnter={() => located && onPeek(key)}
                onPointerLeave={() => onPeek(null)}
                className={cn("flex items-start justify-between gap-3 px-5 py-3 transition-colors duration-150", located && "hover:bg-surface-2")}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-2">{humanize(f.name)}</span>
                    {f.status !== "extracted" && <StatusBadge tone={missing ? "mismatch" : "manual"}>{humanize(f.status)}</StatusBadge>}
                  </div>
                  <div className={cn("mt-0.5 font-mono text-sm break-words", missing ? "text-ink-3" : "text-ink")}>{missing ? "Not found on the page" : fmtValue(f.value)}</div>
                  {f.raw && f.raw !== f.value && <div className="mt-0.5 text-xs text-ink-3">Read on the page as "{f.raw}"</div>}
                  <FieldSourceLine doc={a.document} f={f} />
                  <div className="mt-0.5 text-xs text-ink-3">
                    <MetaList
                      items={[
                        isLlmMethod(f.method) ? (
                          <span title="Proposed by the local model, then accepted only because the same text was found on the page.">Model proposed, grounded on the page</span>
                        ) : (
                          methodLabel(f.method)
                        ),
                        f.confidence !== null ? `Confidence ${fmtConfidence(f.confidence)}` : null,
                        f.page ? `Page ${f.page}` : null,
                      ]}
                    />
                  </div>
                </div>
                {located && (
                  <RowAction leadingIcon={<ScanSearch />} onClick={() => onLocate(f)} aria-label={`Locate ${humanize(f.name)} on the page`}>
                    Locate
                  </RowAction>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ReportPanel>
  );
}

export function QrSection({ a, onFocus }: { a: Analysis; onFocus: OnFocus }) {
  return (
    <ReportPanel
      id="qr"
      title="Signed QR"
      description={a.qr.length ? pluralize(a.qr.length, "QR code") : "No QR code found"}
    >
      {a.qr.length === 0 ? (
        <Quiet>
          No QR code was decoded on {a.page_count > 1 ? "any page" : "the page"}. A signed QR carries the issuer's own values under its signature; its signature is
          checked with the issuer's published key and its values compared with the printed text.
        </Quiet>
      ) : (
        <div>
          {a.qr.map((q, i) => (
            <div key={i}>
              {i > 0 && <PanelDivider />}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  {q.signed ? <VerificationBadge status={q.status} /> : <StatusBadge tone="unchecked">Not a signed token</StatusBadge>}
                  {q.signed && q.simulated && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                      <SimulatedTag /> issuer key
                    </span>
                  )}
                </span>
                {validBox(q.bbox) && (
                  <RowAction leadingIcon={<SquareDashed />} onClick={() => onFocus({ page: q.page, bbox: q.bbox, label: "QR code" })}>
                    Show on page {q.page}
                  </RowAction>
                )}
              </div>
              <p className="mt-2 text-sm text-ink-2 text-pretty">{q.detail}</p>
              {q.signed && q.issuer && (
                <p className="mt-1 text-xs text-ink-3">
                  Signed by {q.issuer}
                  {q.kid ? `, key ${q.kid}` : ""}.
                </p>
              )}
              {!q.signed && q.text && (
                <div className="mt-2">
                  <p className="font-mono text-xs break-all text-ink-2">{q.text}</p>
                  <p className="mt-1 text-xs text-ink-3">Shown as text only; Pramana never opens links found in a document.</p>
                </div>
              )}
              {q.payload && (
                <>
                  <PanelDivider label="Signed values" />
                  <DescriptionList labelWidth={128} items={Object.entries(q.payload).map(([k, v]) => ({ label: <code className="font-mono text-xs">{k}</code>, value: fmtValue(v), mono: true }))} />
                </>
              )}
              {(q.comparisons ?? []).length > 0 && <ComparisonTable className="mt-3" comparisons={q.comparisons!} />}
            </div>
          ))}
        </div>
      )}
    </ReportPanel>
  );
}

export function RegistrySection({ a }: { a: Analysis }) {
  const r = a.registry;
  const res = r.result;
  return (
    <ReportPanel
      id="registry"
      title="Issuer registry"
      description={r.issuer ?? "Asked when the type has an issuing authority and its reference number was read."}
      actions={!r.queried || !res ? <SimulatedTag /> : undefined}
    >
      {!r.queried || !res ? (
        <Quiet>{r.reason}</Quiet>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <VerificationBadge status={res.status} />
            <SimulatedTag />
            <span className="text-xs text-ink-3">
              Reference <code className="font-mono text-xs text-ink-2">{r.ref_no}</code> ({humanize(r.ref_field)})
            </span>
          </div>
          <p className="text-sm text-ink-2 text-pretty">{res.detail}</p>
          {res.comparisons.length > 0 && <ComparisonTable comparisons={res.comparisons} />}
          <p className="text-xs text-ink-3">A simulated stand-in for the issuer's lookup service, not a real-world confirmation.</p>
        </div>
      )}
    </ReportPanel>
  );
}

export function IndicatorsSection({ a, onFocus }: { a: Analysis; onFocus: OnFocus }) {
  const signals = [...(a.document.forensic_signals ?? [])].sort((x, y) => (severityRank[x.severity] ?? 9) - (severityRank[y.severity] ?? 9));
  const sealed = signedOnly(a).some((s) => s.response.intact && s.response.coverage === "ENTIRE_FILE");
  const pdf = isPdf(a);
  const real = signals.filter((x) => x.severity !== "info").length;
  const count = real ? pluralize(real, "indicator") : signals.length ? `No indicators, ${pluralize(signals.length, "note")}` : "No indicators";
  return (
    <ReportPanel
      id="structure"
      title="Indicators"
      padding="none"
      description={
        <>
          {count}.{" "}
          {pdf
            ? "Overlaid or covered text, text changed in a later revision, an odd font, editor metadata. Each is a reason to look, not a conclusion."
            : "Capture metadata and editing software recorded in the file. Each is a reason to look, not a conclusion."}
        </>
      }
    >
      {sealed && signals.length > 0 && (
        <p className="px-5 pb-3 text-xs text-ink-3">The signature covers the entire file, so these features were already present when it was signed.</p>
      )}
      {signals.length === 0 ? (
        <div className="px-5 pb-5">
          <Quiet>No structural indicators were raised for this file.</Quiet>
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {signals.map((s, i) => {
            const region = s.evidence.find(
              (e) => (e.kind === "region" || e.kind === "revision_diff") && validBox((e as { bbox?: unknown }).bbox) && (e as { page?: number }).page,
            ) as { page: number; bbox: [number, number, number, number] } | undefined;
            return (
              <li key={`${s.code}-${i}`} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{s.title}</div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      <MetaList items={[<SeverityIndicator key="s" severity={s.severity} className="text-xs" />, <code key="c" className="font-mono text-xs">{s.code}</code>]} />
                    </div>
                  </div>
                  {region && (
                    <RowAction leadingIcon={<SquareDashed />} onClick={() => onFocus({ page: region.page, bbox: region.bbox, label: s.title })}>
                      Show region
                    </RowAction>
                  )}
                </div>
                <p className="mt-1.5 text-sm break-words text-ink-2 text-pretty">{s.detail}</p>
                {s.limitation && (
                  <p className="mt-1 text-xs text-ink-3 text-pretty">
                    <span className="font-medium text-ink-2">Limitation. </span>
                    {s.limitation}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ReportPanel>
  );
}

export function InstructionsSection({ a, onFocus }: { a: Analysis; onFocus: OnFocus }) {
  const lines = a.document.instruction_lines ?? [];
  return (
    <ReportPanel
      id="instructions"
      title="Text aimed at AI readers"
      padding="none"
      description={`${lines.length ? pluralize(lines.length, "line addresses", "lines address") + " software" : "No line addresses software"}. Issuers do not write to software, so no value found only in such a line is accepted.`}
    >
      {lines.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <span className="text-xs text-ink-3">Page {l.page}</span>
                <p className="mt-0.5 font-mono text-sm break-words text-ink">{l.text}</p>
              </div>
              {validBox(l.bbox) && (
                <RowAction leadingIcon={<SquareDashed />} onClick={() => onFocus({ page: l.page, bbox: l.bbox, label: "Text addressed to an automated reader" })}>
                  Show
                </RowAction>
              )}
            </li>
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}
