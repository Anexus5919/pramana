import { Bot, CircleCheck, Languages, QrCode, ScanSearch, ShieldAlert, SquareDashed } from "lucide-react";
import { motion } from "motion/react";
import { fmtBytes, fmtConfidence, fmtValue, pluralize } from "../../lib/format";
import { humanize, severityRank } from "../../lib/labels";
import type { ExtractedField } from "../../types";
import { Tag } from "../../ui/Badge";
import { SeverityMeter, StatusPill } from "../../ui/Blocks";
import { cn } from "../../ui/cn";
import { fadeUp, stagger } from "../../ui/motion";
import { Tooltip } from "../../ui/Tooltip";
import { isLlmMethod, methodLabel, validBox } from "../application/data";
import { CautionNote, ComparisonTable, PaneLabel } from "../application/parts";
import { FieldSourceLine, ScriptNote } from "../application/tabs/ScriptNote";
import type { Focus } from "../application/viewer/DocViewer";
import type { Analysis } from "./analyseApi";
import { actionCls, Quiet, Section } from "./parts";
import { isPdf, signedOnly, TEXT_SOURCE } from "./summary";

type OnFocus = (f: Focus) => void;

export function IntakeSection({ a }: { a: Analysis }) {
  const kind = isPdf(a) ? "PDF" : a.mime === "image/png" ? "PNG image" : "JPEG image";
  return (
    <Section id="intake" eyebrow="Intake" title="Accepted for reading" description="The same upload checks an application document goes through, run in the parser sandbox.">
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {[
          `Content is a ${kind}, matching the file extension`,
          `${pluralize(a.page_count, "page")}, ${fmtBytes(a.size_bytes)}, within the upload limits`,
          isPdf(a) ? "Not password protected and parsed without errors" : "Decoded safely, within the pixel limit",
          "Never re-encoded, so signatures and revisions stay intact",
        ].map((t) => (
          <li key={t} className="flex items-start gap-2 text-ink-2">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-verified-dot" />
            {t}
          </li>
        ))}
      </ul>
      {isPdf(a) && (
        <div className="mt-4">
          <PaneLabel aside={<span className="text-xs text-ink-3 tabular">{a.intake.active_content.length}</span>}>Active content</PaneLabel>
          {a.intake.active_content.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <CircleCheck aria-hidden className="size-4 text-verified-dot" /> No scripts, launch actions or embedded files.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {a.intake.active_content.map((x) => (
                <li key={x.key} className="flex items-start gap-2.5 rounded-control bg-manual-bg px-3 py-2 text-sm">
                  <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-manual-dot" />
                  <span className="min-w-0">
                    <span className="font-mono text-xs font-semibold text-ink">{x.key}</span>
                    <span className="ml-1.5 text-xs text-ink-3">x{x.count}</span>
                    <span className="block text-ink-2">{x.meaning}. Never executed; the file is only parsed.</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {a.intake.notes.length > 0 && <p className="mt-3 text-xs text-ink-3">{a.intake.notes.join(" ")}</p>}
    </Section>
  );
}

export function TextSection({ a }: { a: Analysis }) {
  const doc = a.document;
  return (
    <Section
      id="text"
      eyebrow="Text"
      title={`Read from ${(TEXT_SOURCE[a.text.source ?? ""] ?? "the page").toLowerCase()}`}
      description="Pages with a usable text layer are read directly. Scanned pages, and pages whose Hindi text layer is broken, are rendered and read by OCR."
      aside={
        a.text.hindi_lines > 0 ? (
          <Tag variant="brand" className="gap-1">
            <Languages aria-hidden className="size-3" /> {pluralize(a.text.hindi_lines, "Hindi line")}
          </Tag>
        ) : undefined
      }
    >
      <ScriptNote doc={doc} />
      <div className="overflow-hidden rounded-[12px] border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] tracking-[0.08em] text-ink-3 uppercase">
              <th scope="col" className="px-3 py-2 font-semibold">Page</th>
              <th scope="col" className="px-3 py-2 font-semibold">Read by</th>
              <th scope="col" className="px-3 py-2 font-semibold">OCR confidence</th>
              <th scope="col" className="px-3 py-2 font-semibold">Words</th>
            </tr>
          </thead>
          <tbody>
            {doc.pages.slice(0, 12).map((p) => {
              const dev = (doc.ocr_scripts ?? []).find((n) => n.page === p.page_no && n.script === "devanagari");
              return (
                <tr key={p.page_no} className="border-t border-line">
                  <td className="px-3 py-2 tabular text-ink-2">{p.page_no}</td>
                  <td className={cn("px-3 py-2", p.text_source === "unreadable" ? "text-mismatch-fg" : "text-ink")}>
                    {TEXT_SOURCE[p.text_source] ?? humanize(p.text_source)}
                    {dev && <span className="text-ink-3">{dev.read === false ? ", Hindi not read" : ", Devanagari recogniser"}</span>}
                  </td>
                  <td className="px-3 py-2 tabular text-ink-2">{p.ocr_mean_confidence !== null ? fmtConfidence(p.ocr_mean_confidence) : "Not OCR"}</td>
                  <td className="px-3 py-2 tabular text-ink-2">{p.text ? p.text.split(/\s+/).filter(Boolean).length : 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {doc.pages.length > 12 && <p className="border-t border-line px-3 py-2 text-xs text-ink-3">{doc.pages.length - 12} more pages read the same way.</p>}
      </div>
      {a.text.unreadable_pages.length > 0 && (
        <CautionNote className="mt-3" title="Needs review">
          {pluralize(a.text.unreadable_pages.length, "page")} could not be read ({a.text.unreadable_pages.join(", ")}). Nothing is guessed for these pages.
        </CautionNote>
      )}
    </Section>
  );
}

export function TypeSection({ a }: { a: Analysis }) {
  const cls = a.doc_type.classification;
  const cands = cls?.candidates ?? [];
  return (
    <Section
      id="type"
      eyebrow="Document type"
      title={a.doc_type.label ?? "Not one of the ruleset's document types"}
      description="Keyword rules from the active ruleset score each document type. The type decides which fields are read and which issuer registry applies."
      aside={<Tag variant="mono">{cls?.method ?? "keyword-rules"}</Tag>}
    >
      {cands.length === 0 ? (
        <Quiet>
          No document type in the ruleset scored enough. That is expected for a gazette or any document outside the AICTE checklist: no fields are read and no issuer registry is queried,
          but signatures, QR codes, revisions and structure are still checked.
        </Quiet>
      ) : (
        <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2">
          {cands.map((c, i) => (
            <motion.li key={c.type} variants={fadeUp} className={cn("rounded-[12px] border p-3", i === 0 && !cls?.ambiguous ? "border-brand-300 bg-brand-soft/50" : "border-line")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{a.doc_type.labels[c.type] ?? humanize(c.type)}</span>
                <span className="text-xs text-ink-3 tabular">score {c.score}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.matched.map((k) => (
                  <Tag key={k} variant="mono">
                    {k}
                  </Tag>
                ))}
                {c.excluded_by.map((k) => (
                  <Tag key={k} variant="mono" className="line-through decoration-mismatch-dot">
                    {k}
                  </Tag>
                ))}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {cls?.ambiguous && <p className="mt-2 text-xs text-manual-fg">Two types scored the same, so neither was chosen.</p>}
    </Section>
  );
}

export function FieldsSection({ a, onLocate, onPeek }: { a: Analysis; onLocate: (f: ExtractedField) => void; onPeek: (key: string | null) => void }) {
  const fields = a.document.fields;
  const read = fields.filter((f) => f.value !== null).length;
  return (
    <Section
      id="fields"
      eyebrow="Fields"
      title={fields.length ? `${read} of ${pluralize(fields.length, "field")} read` : "No fields for this type"}
      description="Each value points at the words it came from. Hover to see the box on the page; Locate scrolls the page to it."
    >
      {fields.length === 0 ? (
        <Quiet>Fields are defined per document type, and this file did not match one.</Quiet>
      ) : (
        <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
          {fields.map((f) => {
            const located = !!f.page && validBox(f.bbox);
            const missing = f.status === "missing" || f.value === null;
            const key = `field-${f.id}`;
            return (
              <motion.li
                key={f.id}
                variants={fadeUp}
                onPointerEnter={() => located && onPeek(key)}
                onPointerLeave={() => onPeek(null)}
                className={cn("px-3 py-2.5 transition-colors duration-200", located && "hover:bg-surface-2/60")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-ink-2">{humanize(f.name)}</span>
                      {isLlmMethod(f.method) && (
                        <Tooltip content="Proposed by the local model, then accepted only because the same text was found on the page.">
                          <Tag variant="brand" tabIndex={0} className="gap-1">
                            <Bot aria-hidden className="size-3" /> Model, grounded
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
                    <FieldSourceLine doc={a.document} f={f} />
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
      )}
    </Section>
  );
}

function Payload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-[minmax(80px,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-[10px] bg-surface-2/60 px-3 py-2 text-xs">
      {Object.entries(payload).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-ink-3">{k}</dt>
          <dd className="min-w-0 font-mono break-words text-ink">{fmtValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function QrSection({ a, onFocus }: { a: Analysis; onFocus: OnFocus }) {
  return (
    <Section
      id="qr"
      eyebrow="Signed QR"
      title={a.qr.length ? pluralize(a.qr.length, "QR code") : "No QR code found"}
      description="A signed QR carries the issuer's own values under its signature. It is decoded, its signature checked with the issuer's published key, and its values compared with the printed text."
    >
      {a.qr.length === 0 ? (
        <Quiet>No QR code was decoded on {a.page_count > 1 ? "any page" : "the page"}.</Quiet>
      ) : (
        <ul className="space-y-3">
          {a.qr.map((q, i) => (
            <li key={i} className="rounded-[12px] border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <QrCode aria-hidden className="size-4 text-ink-3" />
                  <StatusPill status={q.status} label={q.signed ? undefined : "Not a signed token"} />
                  {q.signed && q.simulated && <Tag variant="demo">SIMULATED issuer key</Tag>}
                </span>
                {validBox(q.bbox) && (
                  <button type="button" className={actionCls} onClick={() => onFocus({ page: q.page, bbox: q.bbox, label: "QR code" })}>
                    <SquareDashed aria-hidden className="size-3.5" /> Show on page {q.page}
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm text-ink-2 text-pretty">{q.detail}</p>
              {q.signed && q.issuer && <p className="mt-1 text-xs text-ink-3">Signed by {q.issuer}{q.kid ? `, key ${q.kid}` : ""}.</p>}
              {!q.signed && q.text && (
                <p className="mt-2 rounded-[8px] bg-surface-2 px-2 py-1.5 font-mono text-[12px] break-all text-ink-2">
                  {q.text}
                  <span className="mt-1 block font-sans text-[11px] text-ink-3">Shown as text only; Pramana never opens links found in a document.</span>
                </p>
              )}
              {q.payload && (
                <div className="mt-2">
                  <PaneLabel>Signed values</PaneLabel>
                  <Payload payload={q.payload} />
                </div>
              )}
              {(q.comparisons ?? []).length > 0 && <ComparisonTable className="mt-2" comparisons={q.comparisons!} />}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function RegistrySection({ a }: { a: Analysis }) {
  const r = a.registry;
  const res = r.result;
  return (
    <Section
      id="registry"
      eyebrow="Issuer registry"
      title={r.issuer ?? "Issuer registry lookup"}
      description="When the type has an issuing authority and its reference number was read, the issuer's registry is asked about it."
      aside={<Tag variant="demo">SIMULATED</Tag>}
    >
      {!r.queried || !res ? (
        <Quiet>{r.reason}</Quiet>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={res.status} />
            <span className="text-xs text-ink-3">
              Reference <span className="font-mono text-ink-2">{r.ref_no}</span> ({humanize(r.ref_field)})
            </span>
          </div>
          <p className="text-sm text-ink-2 text-pretty">{res.detail}</p>
          {res.comparisons.length > 0 && <ComparisonTable comparisons={res.comparisons} />}
          <p className="text-xs text-ink-3">A simulated stand-in for the issuer's lookup service. Not a real-world confirmation.</p>
        </div>
      )}
    </Section>
  );
}

export function IndicatorsSection({ a, onFocus }: { a: Analysis; onFocus: OnFocus }) {
  const signals = [...(a.document.forensic_signals ?? [])].sort((x, y) => (severityRank[x.severity] ?? 9) - (severityRank[y.severity] ?? 9));
  const sealed = signedOnly(a).some((s) => s.response.intact && s.response.coverage === "ENTIRE_FILE");
  const pdf = isPdf(a);
  return (
    <Section
      id="structure"
      eyebrow={pdf ? "Structure forensics" : "Photo forensics"}
      title={signals.length ? pluralize(signals.length, "indicator") : "No indicators"}
      description={
        pdf
          ? "Overlaid and covered text, text changed in a later revision, a value in a font no other value uses, editor metadata. Each is a reason to look, not a conclusion."
          : "Capture metadata and editing software recorded in the file. Easy to strip or edit, so each is a reason to look, not a conclusion."
      }
    >
      {sealed && signals.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-[10px] bg-surface-2/60 px-3 py-2 text-xs text-ink-2">
          <ShieldAlert aria-hidden className="mt-px size-3.5 shrink-0 text-brand-500" />
          The signature covers the entire file, so these features were already present when it was signed.
        </p>
      )}
      {signals.length === 0 ? (
        <Quiet>No structural indicators were raised for this file.</Quiet>
      ) : (
        <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2">
          {signals.map((s, i) => {
            const region = s.evidence.find((e) => (e.kind === "region" || e.kind === "revision_diff") && validBox((e as { bbox?: unknown }).bbox) && (e as { page?: number }).page) as
              | { page: number; bbox: [number, number, number, number] }
              | undefined;
            return (
              <motion.li key={`${s.code}-${i}`} variants={fadeUp} className="rounded-[12px] border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityMeter severity={s.severity} />
                      <span className="text-sm font-medium text-ink">{s.title}</span>
                    </div>
                    <Tag variant="mono" className="mt-1">
                      {s.code}
                    </Tag>
                  </div>
                  {region && (
                    <button type="button" className={actionCls} onClick={() => onFocus({ page: region.page, bbox: region.bbox, label: s.title })}>
                      <SquareDashed aria-hidden className="size-3.5" /> Show region
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm break-words text-ink-2 text-pretty">{s.detail}</p>
                {s.limitation && <CautionNote className="mt-2">{s.limitation}</CautionNote>}
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </Section>
  );
}

export function InstructionsSection({ a, onFocus }: { a: Analysis; onFocus: OnFocus }) {
  const lines = a.document.instruction_lines ?? [];
  return (
    <Section
      id="instructions"
      eyebrow="Text aimed at AI readers"
      title={lines.length ? pluralize(lines.length, "line addresses software") : "No instruction lines"}
      description="Issuers do not write to software. A line that tells an automated reader what to do is shown here, and no value found only in such a line is accepted."
    >
      {lines.length === 0 ? (
        <Quiet>No line on this document addresses an automated reader.</Quiet>
      ) : (
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-[12px] border border-manual-dot/40 bg-manual-bg/50 p-3">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-manual-fg">Page {l.page}</span>
                <p className="mt-0.5 font-mono text-[12.5px] break-words text-ink">{l.text}</p>
              </div>
              {validBox(l.bbox) && (
                <button type="button" className={actionCls} onClick={() => onFocus({ page: l.page, bbox: l.bbox, label: "Text addressed to an automated reader" })}>
                  <SquareDashed aria-hidden className="size-3.5" /> Show
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
