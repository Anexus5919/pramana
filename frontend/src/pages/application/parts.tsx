import { ArrowUpRight, Database, FileClock, FileText, GitCompareArrows, Link2, MapPin, PenLine, ShieldCheck, ScanSearch, ScanText } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtValue } from "../../lib/format";
import { channelMeta, factSourceMeta, humanize, isSignatureChannel, pathLabel } from "../../lib/labels";
import { workspacePath } from "../../shell/nav";
import type { Citation, Comparison, Evidence, FactInput, GeoEvidence, Provenance, RevisionDiff } from "../../types";
import { Button, buttonStyles, Callout, cn, Code, SimulatedTag, StatusBadge } from "../../ui2";
import { useDocTypeLabel, useWorkspace } from "./context";
import { bboxParam, evidenceDocId, methodLabel, validBox } from "./data";
import { SealCompare } from "./SealCompare";

/** A caution inside a section: what a check cannot know, or why a reading is incomplete. */
export function CautionNote({ children, title = "Limitation", className }: { children: ReactNode; title?: ReactNode; className?: string }) {
  return (
    <Callout tone="warning" title={title} className={className}>
      {children}
    </Callout>
  );
}

/** SIMULATED for issuer-simulator answers; "Demo key" for signatures made with the prototype's demo trust anchor. */
export function SimTag({ channel, simulated, demo }: { channel?: string; simulated: boolean; demo?: boolean }) {
  if (!simulated && !demo) return null;
  if (demo || (channel && isSignatureChannel(channel))) {
    return (
      <span
        title="Signed with a demo trust anchor, not a production certificate authority"
        className="inline-flex h-5 shrink-0 items-center rounded-[4px] border border-dashed border-line-2 px-1.5 text-xs leading-none font-medium text-ink-3"
      >
        Demo key
      </span>
    );
  }
  return <SimulatedTag />;
}

/** Rule citation as a quiet quote: source line, then the verbatim clause text. */
export function CitationCard({ citation, ruleId, className }: { citation: Citation | null | undefined; ruleId?: string; className?: string }) {
  if (!citation) return null;
  const where = [citation.section, citation.clause, citation.page ? `page ${citation.page}` : null].filter(Boolean).join(", ");
  return (
    <figure className={cn("min-w-0", className)}>
      {citation.quote ? (
        <blockquote className="border-l-2 border-line-2 pl-3 text-sm text-ink text-pretty">{citation.quote}</blockquote>
      ) : (
        <p className="border-l-2 border-line-2 pl-3 text-sm text-ink-3">No verbatim quote is recorded for this clause.</p>
      )}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-3 text-xs text-ink-3">
        <span className="font-medium text-ink-2">{citation.doc_title ?? citation.doc ?? "Regulation"}</span>
        {where && <span>{where}</span>}
        {ruleId && <Code className="text-xs">{ruleId}</Code>}
        {citation.doc_url && (
          <a href={citation.doc_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            Open the source{citation.page ? ` at page ${citation.page}` : ""}
            <ArrowUpRight aria-hidden className="size-3" />
          </a>
        )}
      </figcaption>
    </figure>
  );
}

/** Submitted value against the authoritative one, field by field. */
export function ComparisonTable({ comparisons, className }: { comparisons: Comparison[]; className?: string }) {
  if (!comparisons?.length) return null;
  return (
    <div
      role="region"
      aria-label="Submitted and authoritative values"
      tabIndex={0}
      className={cn("min-w-0 overflow-x-auto rounded-control border border-line", className)}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">Submitted and authoritative values</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs text-ink-3">
            <th scope="col" className="h-8 px-3 font-medium">
              Field
            </th>
            <th scope="col" className="h-8 px-3 font-medium">
              Submitted
            </th>
            <th scope="col" className="h-8 px-3 font-medium">
              Authoritative
            </th>
            <th scope="col" className="h-8 px-3 font-medium">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => (
            <tr key={`${c.field}-${i}`} className="border-b border-line align-top last:border-b-0">
              <th scope="row" className="px-3 py-2 text-left font-medium text-ink-2">
                {pathLabel(c.field)}
                {c.note && <span className="block text-xs font-normal text-ink-3">{c.note}</span>}
              </th>
              <td className="px-3 py-2 font-mono text-sm break-words text-ink">{fmtValue(c.submitted)}</td>
              <td className="px-3 py-2 font-mono text-sm break-words text-ink">{fmtValue(c.authoritative)}</td>
              <td className="px-3 py-2">
                {c.match === true ? (
                  <StatusBadge tone="verified">Match</StatusBadge>
                ) : c.match === false ? (
                  <StatusBadge tone="mismatch">Differs</StatusBadge>
                ) : (
                  <StatusBadge tone="unchecked">Not compared</StatusBadge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where a fact came from: declared, document, reference record, verified or derived. */
export function SourceChip({ source }: { source: string }) {
  const m = factSourceMeta[source];
  return <StatusBadge tone={m?.tone ?? "unchecked"}>{m?.label ?? humanize(source)}</StatusBadge>;
}

function provenanceText(p: Provenance, docName: (id: string) => string): string {
  const bits: string[] = [];
  if (p.form_field) bits.push(`form field ${p.form_field}`);
  if (p.document_id) bits.push(docName(p.document_id));
  else if (p.filename) bits.push(p.filename);
  if (p.page) bits.push(`page ${p.page}`);
  if (p.method) bits.push(methodLabel(p.method));
  if (p.record) bits.push(`record ${p.record}${p.record_id ? ` ${p.record_id}` : ""}`);
  if (typeof p.records === "number") bits.push(`${p.records} records`);
  return bits.join(", ");
}

/** Facts a rule used, each with where it came from. */
export function TraceInputs({ inputs, missing }: { inputs: FactInput[]; missing?: string[] }) {
  const { openDoc, docs } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const docName = (id: string) => (docs[id] ? docLabel(docs[id].declared_type) : "a document");
  if (!inputs.length && !missing?.length) return <p className="text-sm text-ink-3">No inputs recorded.</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {inputs.map((inp, i) => {
        const p = inp.provenance ?? {};
        const canOpen = !!p.document_id && validBox(p.bbox) && !!p.page;
        return (
          <li key={`${inp.path}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SourceChip source={inp.source} />
                <Code className="text-xs text-ink-3">{inp.path}</Code>
              </div>
              <div className="mt-1 font-mono text-sm break-words text-ink">{fmtValue(inp.value)}</div>
              <div className="mt-0.5 text-xs text-ink-3">
                {provenanceText(p, docName)}
                {p.raw && String(p.raw) !== String(inp.value) && <>, read as "{p.raw}"</>}
              </div>
            </div>
            {canOpen && (
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<ScanSearch />}
                onClick={() => openDoc({ docId: p.document_id!, page: p.page, bbox: p.bbox, label: pathLabel(inp.path) })}
              >
                Show on page
              </Button>
            )}
          </li>
        );
      })}
      {missing?.map((m) => (
        <li key={m} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
          <StatusBadge tone="mismatch">Missing</StatusBadge>
          <Code className="text-xs">{m}</Code>
        </li>
      ))}
    </ul>
  );
}

/** What a later revision added, and what it was drawn over. */
export function RevisionDiffView({ diff }: { diff: Pick<RevisionDiff, "added_text" | "removed_text" | "text_underneath" | "from_revision" | "to_revision"> }) {
  const before = diff.text_underneath || diff.removed_text;
  return (
    <dl className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-xs text-ink-3">Revision {diff.from_revision}</dt>
        <dd className="mt-0.5 font-mono text-sm break-words text-ink">{before || <span className="font-sans text-ink-4">Empty</span>}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-ink-3">Revision {diff.to_revision} added</dt>
        <dd className="mt-0.5 font-mono text-sm break-words text-ink">{diff.added_text || <span className="font-sans text-ink-4">Empty</span>}</dd>
      </div>
    </dl>
  );
}

/** Photo geotag against the campus on record, drawn to scale. */
export function GeoFigure({ e }: { e: GeoEvidence }) {
  const [plat, plon] = e.photo;
  const [clat, clon] = e.campus;
  const dx = (plon - clon) * Math.cos(((plat + clat) / 2) * (Math.PI / 180));
  const dy = plat - clat;
  const span = Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
  const s = 46 / span;
  const cx = 60 - (dx * s) / 2;
  const cy = 60 + (dy * s) / 2;
  const px = cx + dx * s;
  const py = cy - dy * s;
  return (
    <svg
      viewBox="0 0 120 120"
      className="size-28 shrink-0 rounded-control border border-line bg-surface-2"
      role="img"
      aria-label={`Photo geotag ${e.distance_km} km from campus`}
    >
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="var(--ink-4)" strokeDasharray="3 3" />
      <circle cx={cx} cy={cy} r="5" fill="var(--verified-dot)" />
      <circle cx={px} cy={py} r="5" fill="var(--mismatch-dot)" />
      <text x={cx} y={cy + 16} textAnchor="middle" fill="var(--ink-3)" fontSize="10">
        campus
      </text>
      <text x={px} y={py - 9} textAnchor="middle" fill="var(--ink-3)" fontSize="10">
        photo
      </text>
    </svg>
  );
}

function Item({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-3 py-3">
      <span aria-hidden className="mt-0.5 shrink-0 text-ink-4 [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 text-sm font-medium text-ink">{title}</div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-1">{action}</div>}
        </div>
        {children && <div className="mt-1 min-w-0 text-xs text-ink-3">{children}</div>}
      </div>
    </li>
  );
}

function Value({ v }: { v: unknown }) {
  if (v === undefined || v === null) return null;
  return (
    <span className="ml-1.5 font-normal text-ink-3">
      = <span className="font-mono text-sm text-ink">{fmtValue(v)}</span>
    </span>
  );
}

const linkAction = buttonStyles("ghost", "sm");

/** Every evidence kind the pipeline emits, each with a way to reach its source. */
export function EvidenceList({ evidence, fallbackDocId }: { evidence: Evidence[]; fallbackDocId: string | null }) {
  const { app, openDoc, docs } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const docName = (id: string | null) => (id && docs[id] ? docLabel(docs[id].declared_type) : "Document");
  const fileName = (id: string | null) => (id && docs[id] ? docs[id].original_filename : null);
  if (!evidence.length) return <p className="text-sm text-ink-3">No evidence items recorded.</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {evidence.map((raw, i) => {
        const e = raw as Evidence;
        switch (e.kind) {
          case "region": {
            const docId = evidenceDocId(e, fallbackDocId);
            const located = !!docId && !!e.page && validBox(e.bbox);
            return (
              <Item
                key={i}
                icon={<ScanText />}
                title={
                  <>
                    {pathLabel(e.label ?? "Region")}
                    <Value v={e.value} />
                  </>
                }
                action={
                  docId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      leadingIcon={<ScanSearch />}
                      onClick={() => openDoc({ docId, page: e.page, bbox: e.bbox, label: pathLabel(e.label ?? "Region") })}
                    >
                      {located ? "Show on page" : "Open document"}
                    </Button>
                  ) : undefined
                }
              >
                {docName(docId)}
                {e.page ? `, page ${e.page}` : ""}
                {fileName(docId) && <span className="ml-1 font-mono">{fileName(docId)}</span>}
                {e.raw && String(e.raw) !== String(e.value) && <span className="block">Read as "{e.raw}"</span>}
              </Item>
            );
          }
          case "document":
            return (
              <Item
                key={i}
                icon={<FileText />}
                title={docName(e.document_id)}
                action={
                  <Button size="sm" variant="ghost" leadingIcon={<FileText />} onClick={() => openDoc({ docId: e.document_id })}>
                    Open document
                  </Button>
                }
              >
                {fileName(e.document_id) && <span className="font-mono">{fileName(e.document_id)}</span>}
              </Item>
            );
          case "peer_document":
            return (
              <Item
                key={i}
                icon={<Link2 />}
                title={
                  <>
                    Matching document in <Code>{e.application_id}</Code>
                  </>
                }
                action={
                  <Link
                    className={linkAction}
                    to={workspacePath(e.application_id, "documents", {
                      doc: e.document_id,
                      page: e.page ? String(e.page) : undefined,
                      hl: bboxParam(e.bbox) ?? undefined,
                      hlabel: "matched region",
                    })}
                  >
                    Open other application <ArrowUpRight aria-hidden />
                  </Link>
                }
              >
                Opens the other application's document{e.page ? ` at page ${e.page}` : ""} with the matched region highlighted.
              </Item>
            );
          case "reference_record":
            return (
              <Item
                key={i}
                icon={<Database />}
                title={
                  <>
                    {pathLabel(e.label ?? "Reference record")}
                    <Value v={e.value} />
                  </>
                }
              >
                {e.source ?? "AICTE reference record"}
                {e.record_id && <span className="ml-1 font-mono">{e.record_id}</span>}
              </Item>
            );
          case "declared":
            return (
              <Item
                key={i}
                icon={<PenLine />}
                title={
                  <>
                    {pathLabel(e.label ?? e.field ?? "Declared value")}
                    <Value v={e.value} />
                  </>
                }
              >
                Declared by the institution{e.field ? ` in form field ${e.field}` : ""}
              </Item>
            );
          case "verification":
            return (
              <Item
                key={i}
                icon={<ShieldCheck />}
                title={
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {channelMeta[e.channel]?.label ?? humanize(e.channel)}
                    <SimTag channel={e.channel} simulated={e.simulated} />
                  </span>
                }
              >
                <span className="block">Source: {e.source}</span>
                {e.comparisons?.length > 0 && <ComparisonTable comparisons={e.comparisons} className="mt-2" />}
              </Item>
            );
          case "revision_diff": {
            const docId = evidenceDocId(e, fallbackDocId);
            return (
              <Item
                key={i}
                icon={<GitCompareArrows />}
                title={`Revision ${e.from_revision} to ${e.to_revision}, page ${e.page}`}
                action={
                  docId ? (
                    <>
                      {validBox(e.bbox) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          leadingIcon={<ScanSearch />}
                          onClick={() => openDoc({ docId, page: e.page, bbox: e.bbox, label: "Changed in a later revision" })}
                        >
                          Show on page
                        </Button>
                      )}
                      <Link
                        className={linkAction}
                        to={workspacePath(app.id, "documents", { doc: docId, panel: "revisions", rev: String(e.to_revision) })}
                      >
                        <FileClock aria-hidden />
                        View revisions
                      </Link>
                    </>
                  ) : undefined
                }
              >
                <div className="mt-1">
                  <RevisionDiffView diff={e} />
                </div>
              </Item>
            );
          }
          case "image_match":
            return <SealCompare key={i} e={e} />;
          case "geo":
            return (
              <Item key={i} icon={<MapPin />} title={`Photo geotag ${fmtValue(e.distance_km)} km from the campus on record`}>
                <div className="mt-1 flex flex-wrap items-center gap-4">
                  <GeoFigure e={e} />
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt>Photo</dt>
                    <dd className="font-mono text-ink">{e.photo.join(", ")}</dd>
                    <dt>Campus</dt>
                    <dd className="font-mono text-ink">{e.campus.join(", ")}</dd>
                  </dl>
                </div>
              </Item>
            );
          default:
            return (
              <Item key={i} icon={<FileText />} title={humanize((raw as { kind: string }).kind)}>
                <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap">{JSON.stringify(raw, null, 2)}</pre>
              </Item>
            );
        }
      })}
    </ul>
  );
}

/** Small heading above a group inside a panel. */
export function PaneLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink">{children}</h3>
      {aside}
    </div>
  );
}
