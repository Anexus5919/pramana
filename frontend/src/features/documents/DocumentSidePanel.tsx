import clsx from "clsx";
import { Download, Crosshair } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { Pill, SeverityChip, SimulatedBadge, StatusPill, Tag } from "../../components/ui/Badge";
import { SectionTitle } from "../../components/ui/Card";
import { Digest } from "../../components/ui/Digest";
import { Callout } from "../../components/ui/Feedback";
import { TabPanel, Tabs } from "../../components/ui/Tabs";
import { fmtBytes, fmtConfidence, fmtDateTime, fmtValue } from "../../lib/format";
import { channelMeta, humanize, isSignatureChannel, severityRank, type Tone } from "../../lib/labels";
import type { BBox, DocumentDetail, ExtractedField, VerificationAttempt } from "../../types";
import { ComparisonTable } from "../application/evidence/ComparisonTable";
import { RevisionDiffText } from "../application/evidence/EvidenceList";

type PanelTab = "fields" | "forensics" | "verification" | "rows" | "file";

const fieldStatusTone: Record<string, Tone> = {
  extracted: "verified",
  uncertain: "manual",
  unparseable: "expired",
  missing: "unchecked",
};

export type FocusFn = (page: number, bbox: BBox, label: string) => void;

function LocateButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show ${label} on the page`}
      title="Show on page"
      className="rounded p-1 text-subtle-fg hover:bg-primary-soft hover:text-primary-ink"
    >
      <Crosshair className="size-3.5" />
    </button>
  );
}

function FieldsPanel({ fields, onFocus }: { fields: ExtractedField[]; onFocus: FocusFn }) {
  if (!fields.length) return <p className="text-sm text-subtle-fg">No fields are defined for this document type, or it was not processed.</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {fields.map((f) => (
        <li key={f.id} className="px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">{humanize(f.name)}</p>
              <p className="mt-0.5 font-mono text-[13px] break-words text-fg">{f.value ?? <span className="font-sans text-subtle-fg">Not found</span>}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Pill tone={fieldStatusTone[f.status] ?? "unchecked"}>{humanize(f.status)}</Pill>
              {f.page && f.bbox && <LocateButton label={f.name} onClick={() => onFocus(f.page!, f.bbox!, humanize(f.name))} />}
            </div>
          </div>
          <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
            <div className="col-span-3 min-w-0">
              <dt className="sr-only">Raw text</dt>
              <dd className="truncate text-subtle-fg" title={f.raw ?? ""}>
                Raw: {f.raw ? `"${f.raw}"` : "none"}
              </dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Method</dt>
              <dd className="text-fg">{f.method}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Confidence</dt>
              <dd className="text-fg">{fmtConfidence(f.confidence)}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Page</dt>
              <dd className="text-fg">{f.page ?? "n/a"}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function ForensicsPanel({ doc, onFocus }: { doc: DocumentDetail; onFocus: FocusFn }) {
  const signals = [...(doc.forensic_signals ?? [])].sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  const facts = doc.forensic_facts ?? {};
  const info = facts.metadata?.info ?? {};
  const isImage = doc.mime.startsWith("image/");
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle className="mb-2">Signals ({signals.length})</SectionTitle>
        {signals.length === 0 ? (
          <p className="text-sm text-subtle-fg">No forensic signals for this file.</p>
        ) : (
          <ul className="space-y-2">
            {signals.map((s, i) => {
              const region = s.evidence?.find((e) => e.kind === "region" && e.bbox && e.page);
              return (
                <li key={`${s.code}-${i}`} className="rounded-md border border-line p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityChip severity={s.severity} />
                      <span className="font-mono text-[11px] text-subtle-fg">{s.code}</span>
                    </div>
                    {region && region.kind === "region" && (
                      <LocateButton label={s.title} onClick={() => onFocus(region.page!, region.bbox!, s.title)} />
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-fg">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.detail}</p>
                  {s.limitation && (
                    <Callout tone="caution" className="mt-2 py-1.5 text-xs">
                      {s.limitation}
                    </Callout>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isImage ? (
        <section>
          <SectionTitle className="mb-2">Photo metadata (EXIF)</SectionTitle>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {(["Make", "Model", "Software", "DateTimeOriginal", "DateTime", "format"] as const).map((k) => (
              <div key={k}>
                <dt className="text-subtle-fg">{humanize(k.replace(/([a-z])([A-Z])/g, "$1 $2"))}</dt>
                <dd className="text-fg">{fmtValue(facts[k])}</dd>
              </div>
            ))}
            <div>
              <dt className="text-subtle-fg">Size</dt>
              <dd className="text-fg">{facts.width && facts.height ? `${facts.width} x ${facts.height} px` : "Not available"}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">GPS</dt>
              <dd className="text-fg">{facts.gps ? facts.gps.join(", ") : "None in file"}</dd>
            </div>
            {facts.distance_km != null && (
              <div>
                <dt className="text-subtle-fg">Distance from campus</dt>
                <dd className="text-fg">{facts.distance_km} km</dd>
              </div>
            )}
          </dl>
        </section>
      ) : (
        <section>
          <SectionTitle className="mb-2">File structure</SectionTitle>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-subtle-fg">Revisions</dt>
              <dd className={clsx("font-medium", (facts.revisions ?? 1) > 1 ? "text-manual-fg" : "text-fg")}>{fmtValue(facts.revisions)}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Producer</dt>
              <dd className="break-words text-fg">{fmtValue(info.Producer)}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Creator</dt>
              <dd className="break-words text-fg">{fmtValue(info.Creator)}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Created</dt>
              <dd className="text-fg">{facts.created ? fmtDateTime(facts.created) : "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Modified</dt>
              <dd className="text-fg">{facts.modified ? fmtDateTime(facts.modified) : "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-subtle-fg">Fonts</dt>
              <dd className="break-words text-fg">{facts.metadata?.fonts?.length ? facts.metadata.fonts.join(", ") : "None listed"}</dd>
            </div>
          </dl>
          {(facts.revision_diffs?.length ?? 0) > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Changes between revisions</p>
              <ul className="space-y-2">
                {facts.revision_diffs!.map((d, i) => (
                  <li key={i} className="rounded-md border border-line p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-fg">
                        Revision {d.from_revision} to {d.to_revision}, page {d.page}
                      </span>
                      {d.bbox && <LocateButton label="changed region" onClick={() => onFocus(d.page, d.bbox!, "Changed in later revision")} />}
                    </div>
                    <RevisionDiffText diff={d} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AttemptCard({ a }: { a: VerificationAttempt }) {
  const demo = isSignatureChannel(a.channel) && (a.response?.demo_anchor === true || a.simulated);
  const signer = typeof a.response?.signer === "string" ? a.response.signer : null;
  return (
    <li className="rounded-md border border-line p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-fg">{channelMeta[a.channel]?.label ?? humanize(a.channel)}</span>
        <StatusPill status={a.status} />
        {a.simulated && <SimulatedBadge label={demo ? "DEMO" : "SIMULATED"} />}
      </div>
      <p className="mt-1 text-xs text-subtle-fg">
        {a.source_name}
        {signer && <> | signer {signer}</>}
      </p>
      {a.detail && <p className="mt-1.5 text-xs leading-relaxed text-muted">{a.detail}</p>}
      {a.comparison?.length > 0 && (
        <div className="mt-2">
          <ComparisonTable comparisons={a.comparison} />
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-subtle-fg">
        {a.actor ? `By ${a.actor}, ` : ""}
        {fmtDateTime(a.completed_at ?? a.started_at)}
      </p>
    </li>
  );
}

function VerificationPanel({ doc, runId }: { doc: DocumentDetail; runId?: string }) {
  const all = doc.verifications ?? [];
  const current = runId ? all.filter((a) => a.run_id === runId) : all;
  const older = runId ? all.filter((a) => a.run_id !== runId) : [];
  const [showOld, setShowOld] = useState(false);
  if (!all.length) return <p className="text-sm text-subtle-fg">No verification attempts recorded for this document.</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {current.map((a) => (
          <AttemptCard key={a.id} a={a} />
        ))}
      </ul>
      {older.length > 0 && (
        <div>
          <button type="button" className="text-xs font-medium text-primary-ink hover:underline" onClick={() => setShowOld((v) => !v)} aria-expanded={showOld}>
            {showOld ? "Hide" : "Show"} {older.length} attempts from earlier runs
          </button>
          {showOld && (
            <ul className="mt-2 space-y-2 opacity-80">
              {older.map((a) => (
                <AttemptCard key={a.id} a={a} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RowsPanel({ doc, onFocus }: { doc: DocumentDetail; onFocus: FocusFn }) {
  const rows = doc.rows ?? [];
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => !k.startsWith("_"));
  if (!rows.length) return <p className="text-sm text-subtle-fg">No table rows were extracted.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-subtle/70 text-left text-[10px] tracking-wider text-subtle-fg uppercase">
            {cols.map((c) => (
              <th key={c} scope="col" className="px-2 py-1.5 font-semibold">
                {humanize(c)}
              </th>
            ))}
            <th scope="col" className="w-8 px-1">
              <span className="sr-only">Locate</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {cols.map((c) => (
                <td key={c} className={clsx("px-2 py-1.5 text-fg", c.endsWith("_id") && "font-mono text-[11px]")}>
                  {fmtValue(r[c])}
                </td>
              ))}
              <td className="px-1">
                {r._page && r._bbox && <LocateButton label={`row ${i + 1}`} onClick={() => onFocus(r._page!, r._bbox!, `Row ${i + 1}`)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilePanel({ doc, docTypeLabel }: { doc: DocumentDetail; docTypeLabel: (c: string) => string }) {
  const cls = doc.classification;
  const fp = doc.fingerprints ?? {};
  return (
    <div className="space-y-4 text-xs">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="col-span-2">
          <dt className="text-subtle-fg">File name</dt>
          <dd className="break-all text-fg">{doc.original_filename}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Type</dt>
          <dd className="text-fg">{doc.mime}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Size</dt>
          <dd className="text-fg">{fmtBytes(doc.size_bytes)}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Pages</dt>
          <dd className="text-fg">{doc.page_count}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Text source</dt>
          <dd className="text-fg">{humanize(doc.text_source ?? "not processed")}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Uploaded</dt>
          <dd className="text-fg">{fmtDateTime(doc.uploaded_at)}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Round</dt>
          <dd className="text-fg">{doc.round}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-subtle-fg">SHA-256</dt>
          <dd>
            <Digest value={doc.sha256} length={24} label="SHA-256" />
          </dd>
        </div>
        {typeof fp.phash === "string" && (
          <div className="col-span-2">
            <dt className="text-subtle-fg">Perceptual hash</dt>
            <dd>
              <Digest value={fp.phash} length={24} label="perceptual hash" />
            </dd>
          </div>
        )}
      </dl>
      {cls && (
        <div>
          <p className="mb-1 font-medium text-muted">Classification ({cls.method ?? "keyword rules"})</p>
          <p className="text-fg">
            Declared {docTypeLabel(doc.declared_type)}, detected{" "}
            <span className={clsx("font-medium", cls.type && cls.type !== doc.declared_type && "text-manual-fg")}>
              {cls.type ? docTypeLabel(cls.type) : cls.ambiguous ? "ambiguous" : "unknown"}
            </span>
          </p>
          {(cls.candidates?.length ?? 0) > 0 && (
            <ul className="mt-1.5 space-y-1">
              {cls.candidates!.map((c) => (
                <li key={c.type} className="flex flex-wrap items-center gap-1.5">
                  <Tag>{docTypeLabel(c.type)}</Tag>
                  <span className="text-subtle-fg">score {c.score}</span>
                  <span className="truncate text-muted">{c.matched.slice(0, 4).join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {doc.processing_error && <Callout tone="caution" title="Processing error">{doc.processing_error}</Callout>}
      <a
        href={api.fileUrl(doc.id)}
        className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 font-medium text-fg hover:bg-subtle"
      >
        <Download aria-hidden className="size-3.5" /> Download original (logged in audit)
      </a>
    </div>
  );
}

export function DocumentSidePanel({
  doc,
  runId,
  onFocus,
  docTypeLabel,
}: {
  doc: DocumentDetail;
  runId?: string;
  onFocus: FocusFn;
  docTypeLabel: (c: string) => string;
}) {
  const [tab, setTab] = useState<PanelTab>("fields");
  const items: { id: PanelTab; label: string; count?: number }[] = [
    { id: "fields", label: "Fields", count: doc.fields.length },
    { id: "forensics", label: "Forensics", count: doc.forensic_signals?.length },
    { id: "verification", label: "Verification", count: runId ? doc.verifications?.filter((v) => v.run_id === runId).length : doc.verifications?.length },
    ...(doc.rows?.length ? [{ id: "rows" as const, label: "Rows", count: doc.rows.length }] : []),
    { id: "file", label: "File" },
  ];
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
      <div className="border-b border-line px-2">
        <Tabs size="sm" label="Document details" idPrefix="docpanel" value={tab} onChange={(t) => setTab(t as PanelTab)} items={items} />
      </div>
      <TabPanel id={tab} idPrefix="docpanel" key={tab} className="max-h-[min(78vh,980px)] overflow-y-auto p-3">
        {tab === "fields" && <FieldsPanel fields={doc.fields} onFocus={onFocus} />}
        {tab === "forensics" && <ForensicsPanel doc={doc} onFocus={onFocus} />}
        {tab === "verification" && <VerificationPanel doc={doc} runId={runId} />}
        {tab === "rows" && <RowsPanel doc={doc} onFocus={onFocus} />}
        {tab === "file" && <FilePanel doc={doc} docTypeLabel={docTypeLabel} />}
      </TabPanel>
    </div>
  );
}
