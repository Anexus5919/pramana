import {
  ArrowUpRight,
  BookOpen,
  Database,
  FileText,
  GitCompareArrows,
  Link2,
  MapPin,
  PenLine,
  ShieldCheck,
  SquareDashed,
  TriangleAlert,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtValue } from "../../lib/format";
import { channelMeta, factSourceMeta, humanize, isSignatureChannel, pathLabel } from "../../lib/labels";
import type { Citation, Comparison, Evidence, FactInput, GeoEvidence, Provenance, RevisionDiff } from "../../types";
import { Tag } from "../../ui/Badge";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";
import { toneClass } from "../../ui/tone";
import { Tooltip } from "../../ui/Tooltip";
import { useDocTypeLabel, useWorkspace } from "./context";
import { appPath, bboxParam, evidenceDocId, methodLabel, validBox } from "./data";

export function CautionNote({ children, title = "Limitation", className }: { children: ReactNode; title?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-2.5 rounded-[10px] border border-manual-dot/30 bg-manual-bg px-3 py-2.5", className)}>
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-manual-dot" />
      <div className="min-w-0 text-sm text-ink-2">
        <span className="font-semibold text-manual-fg">{title}. </span>
        {children}
      </div>
    </div>
  );
}

export function SimTag({ channel, simulated, demo }: { channel?: string; simulated: boolean; demo?: boolean }) {
  if (!simulated && !demo) return null;
  const label = demo || (channel && isSignatureChannel(channel)) ? "DEMO" : "SIMULATED";
  return (
    <Tooltip content={label === "DEMO" ? "Signed with a demo trust anchor, not a production certificate authority." : "Answered by a simulated issuer service for this prototype."}>
      <Tag variant="demo" tabIndex={0}>
        {label}
      </Tag>
    </Tooltip>
  );
}

/** Rule citation as a quote card: document, clause, page and the verbatim text. */
export function CitationCard({ citation, ruleId, className }: { citation: Citation | null | undefined; ruleId?: string; className?: string }) {
  if (!citation) return null;
  const where = [citation.section, citation.clause, citation.page ? `page ${citation.page}` : null].filter(Boolean).join(", ");
  return (
    <figure className={cn("relative overflow-hidden rounded-[12px] border border-line bg-surface-2/60 p-4 pl-5", className)}>
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-ev-4" />
      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <BookOpen aria-hidden className="size-3.5 text-ev-4" />
        <span className="font-semibold text-ink-2">{citation.doc_title ?? citation.doc ?? "Regulation"}</span>
        {where && <span>{where}</span>}
        {ruleId && <Tag variant="mono">{ruleId}</Tag>}
      </figcaption>
      {citation.quote ? (
        <blockquote className="mt-2 font-display text-[15px] leading-relaxed text-ink text-pretty">
          <span aria-hidden className="mr-0.5 text-ink-4">"</span>
          {citation.quote}
          <span aria-hidden className="ml-0.5 text-ink-4">"</span>
        </blockquote>
      ) : (
        <p className="mt-2 text-sm text-ink-3">No verbatim quote is recorded for this clause.</p>
      )}
      {citation.doc_url && (
        <a
          href={citation.doc_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
        >
          Open the source document{citation.page ? ` at page ${citation.page}` : ""}
          <ArrowUpRight aria-hidden className="size-3" />
        </a>
      )}
    </figure>
  );
}

export function ComparisonTable({ comparisons, className }: { comparisons: Comparison[]; className?: string }) {
  if (!comparisons?.length) return null;
  return (
    <div className={cn("overflow-x-auto rounded-[10px] border border-line", className)}>
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            <th scope="col" className="px-3 py-2 font-semibold">Field</th>
            <th scope="col" className="px-3 py-2 font-semibold">Submitted</th>
            <th scope="col" className="px-3 py-2 font-semibold">Authoritative</th>
            <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Result</span></th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => {
            const bad = c.match === false;
            return (
              <motion.tr
                key={`${c.field}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05, duration: dur.ui }}
                className="border-t border-line align-top"
              >
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink-2">
                  {pathLabel(c.field)}
                  {c.note && <span className="block text-[11px] font-normal text-ink-3">{c.note}</span>}
                </th>
                <td className={cn("px-3 py-2 font-mono text-[12.5px] break-words", bad ? "bg-mismatch-bg text-mismatch-fg" : "text-ink")}>
                  {fmtValue(c.submitted)}
                </td>
                <td className={cn("px-3 py-2 font-mono text-[12.5px] break-words", bad ? "bg-mismatch-bg/60 text-ink" : "text-ink")}>
                  {fmtValue(c.authoritative)}
                </td>
                <td className="px-2 py-2 text-center">
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                      c.match === true && "bg-verified-bg text-verified-fg",
                      c.match === false && "bg-mismatch-bg text-mismatch-fg",
                      c.match === null && "bg-surface-2 text-ink-3",
                    )}
                  >
                    {c.match === true ? "Match" : c.match === false ? "Differs" : "n/a"}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SourceChip({ source }: { source: string }) {
  const m = factSourceMeta[source];
  const t = toneClass[m?.tone ?? "unchecked"];
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11px] font-semibold", t.bg, t.fg)}>
      <span aria-hidden className={cn("size-1.5 rounded-[2px]", t.dot)} />
      {m?.label ?? humanize(source)}
    </span>
  );
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
    <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
      {inputs.map((inp, i) => {
        const p = inp.provenance ?? {};
        const canOpen = !!p.document_id && validBox(p.bbox) && !!p.page;
        return (
          <li key={`${inp.path}-${i}`} className="grid gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SourceChip source={inp.source} />
                <span className="font-mono text-[12px] text-ink-3">{inp.path}</span>
              </div>
              <div className="mt-1 font-mono text-[13px] break-words text-ink">{fmtValue(inp.value)}</div>
              <div className="mt-0.5 text-xs text-ink-3">
                {provenanceText(p, docName)}
                {p.raw && String(p.raw) !== String(inp.value) && <> , read as "{p.raw}"</>}
              </div>
            </div>
            {canOpen && (
              <button
                type="button"
                onClick={() => openDoc({ docId: p.document_id!, page: p.page, bbox: p.bbox, label: pathLabel(inp.path) })}
                className="inline-flex h-7 items-center gap-1 self-start rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100"
              >
                <SquareDashed aria-hidden className="size-3.5" /> Show on page
              </button>
            )}
          </li>
        );
      })}
      {missing?.map((m) => (
        <li key={m} className="flex items-center gap-2 px-3 py-2.5 text-sm">
          <span className="inline-flex h-5 items-center rounded-[5px] bg-mismatch-bg px-1.5 text-[11px] font-semibold text-mismatch-fg">Missing</span>
          <span className="font-mono text-[12px] text-ink-2">{m}</span>
        </li>
      ))}
    </ul>
  );
}

export function RevisionDiffView({ diff }: { diff: Pick<RevisionDiff, "added_text" | "removed_text" | "text_underneath" | "from_revision" | "to_revision"> }) {
  const before = diff.text_underneath || diff.removed_text;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-2">
        Revision {diff.to_revision} added{" "}
        <mark className="rounded-[4px] bg-verified-bg px-1 font-mono text-[12.5px] text-verified-fg">{diff.added_text || "content"}</mark>
        {before ? (
          <>
            {" "}over{" "}
            <span className="rounded-[4px] bg-mismatch-bg px-1 font-mono text-[12.5px] text-mismatch-fg line-through decoration-2">{before}</span>
          </>
        ) : null}
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-[8px] border border-line bg-surface-2/60 p-2">
          <div className="eyebrow mb-1">Revision {diff.from_revision}</div>
          <div className="font-mono text-[12.5px] break-words text-ink">{before || <span className="text-ink-4">empty</span>}</div>
        </div>
        <div className="rounded-[8px] border border-verified-dot/30 bg-verified-bg/50 p-2">
          <div className="eyebrow mb-1">Revision {diff.to_revision}</div>
          <div className="font-mono text-[12.5px] break-words text-ink">{diff.added_text || <span className="text-ink-4">empty</span>}</div>
        </div>
      </div>
    </div>
  );
}

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
    <svg viewBox="0 0 120 120" className="size-28 shrink-0 rounded-[10px] border border-line bg-surface-2" role="img" aria-label={`Photo geotag ${e.distance_km} km from campus`}>
      <motion.line x1={cx} y1={cy} x2={px} y2={py} stroke="var(--ink-4)" strokeDasharray="3 3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: dur.story, ease: ease.out }} />
      <circle cx={cx} cy={cy} r="5" fill="var(--verified-dot)" />
      <circle cx={px} cy={py} r="5" fill="var(--mismatch-dot)" />
      <text x={cx} y={cy + 16} textAnchor="middle" fill="var(--ink-3)" fontSize="9">campus</text>
      <text x={px} y={py - 9} textAnchor="middle" fill="var(--ink-3)" fontSize="9">photo</text>
    </svg>
  );
}

function Item({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <li className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 shrink-0 text-ink-3 [&_svg]:size-4">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 text-sm font-medium text-ink">{title}</div>
            {action}
          </div>
          {children && <div className="mt-1 text-xs text-ink-3">{children}</div>}
        </div>
      </div>
    </li>
  );
}

const actionCls =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100";

function Value({ v }: { v: unknown }) {
  if (v === undefined || v === null) return null;
  return (
    <span className="ml-1.5 font-normal text-ink-3">
      = <span className="font-mono text-[12.5px] text-ink">{fmtValue(v)}</span>
    </span>
  );
}

/** Every evidence kind the pipeline emits, with a way to reach the source. */
export function EvidenceList({ evidence, fallbackDocId }: { evidence: Evidence[]; fallbackDocId: string | null }) {
  const { openDoc, docs } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const docName = (id: string | null) => (id && docs[id] ? `${docLabel(docs[id].declared_type)} (${docs[id].original_filename})` : "Document");
  if (!evidence.length) return <p className="text-sm text-ink-3">No evidence items recorded.</p>;
  return (
    <ul className="space-y-2">
      {evidence.map((raw, i) => {
        const e = raw as Evidence;
        switch (e.kind) {
          case "region": {
            const docId = evidenceDocId(e, fallbackDocId);
            const located = !!docId && !!e.page && validBox(e.bbox);
            return (
              <Item
                key={i}
                icon={<SquareDashed />}
                title={
                  <>
                    {pathLabel(e.label ?? "Region")}
                    <Value v={e.value} />
                  </>
                }
                action={
                  docId ? (
                    <button type="button" className={actionCls} onClick={() => openDoc({ docId, page: e.page, bbox: e.bbox, label: pathLabel(e.label ?? "Region") })}>
                      <SquareDashed aria-hidden className="size-3.5" />
                      {located ? `Show on page ${e.page}` : "Open document"}
                    </button>
                  ) : undefined
                }
              >
                {docName(docId)}
                {e.page ? `, page ${e.page}` : ""}
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
                  <button type="button" className={actionCls} onClick={() => openDoc({ docId: e.document_id })}>
                    <FileText aria-hidden className="size-3.5" /> Open document
                  </button>
                }
              />
            );
          case "peer_document":
            return (
              <Item
                key={i}
                icon={<Link2 />}
                title={<>Matching document in application {e.application_id}</>}
                action={
                  <Link
                    className={actionCls}
                    to={appPath(e.application_id, "documents", { doc: e.document_id, page: e.page, hl: bboxParam(e.bbox), hlabel: "matched region" })}
                  >
                    Open other application <ArrowUpRight aria-hidden className="size-3" />
                  </Link>
                }
              >
                Opens the other application's document {e.page ? `at page ${e.page}` : ""} with the matched region highlighted.
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
                {e.record_id && <span className="ml-1 font-mono text-[11px]">({e.record_id})</span>}
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
                  <span className="flex flex-wrap items-center gap-1.5">
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
                  docId && validBox(e.bbox) ? (
                    <button type="button" className={actionCls} onClick={() => openDoc({ docId, page: e.page, bbox: e.bbox, label: "Changed in a later revision" })}>
                      <SquareDashed aria-hidden className="size-3.5" /> Show region
                    </button>
                  ) : undefined
                }
              >
                <div className="mt-1">
                  <RevisionDiffView diff={e} />
                </div>
              </Item>
            );
          }
          case "geo":
            return (
              <Item key={i} icon={<MapPin />} title={`Photo geotag ${fmtValue(e.distance_km)} km from the campus on record`}>
                <div className="mt-1 flex flex-wrap items-center gap-3">
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
                <pre className="overflow-x-auto font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify(raw, null, 2)}</pre>
              </Item>
            );
        }
      })}
    </ul>
  );
}

/** Small uppercase label above a group inside a pane. */
export function PaneLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h4 className="eyebrow">{children}</h4>
      {aside}
    </div>
  );
}
