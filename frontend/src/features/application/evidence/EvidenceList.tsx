import clsx from "clsx";
import { ArrowUpRight, Database, FileText, GitCompareArrows, Link2, MapPin, PenLine, ShieldCheck, SquareDashed } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SimulatedBadge } from "../../../components/ui/Badge";
import { fmtValue } from "../../../lib/format";
import { channelMeta, humanize, isSignatureChannel, pathLabel } from "../../../lib/labels";
import type {
  BBox,
  DocumentSummary,
  Evidence,
  GeoEvidence,
  PeerDocumentEvidence,
  RegionEvidence,
  RevisionDiffEvidence,
  VerificationEvidence,
} from "../../../types";
import { docLink } from "../links";
import { ComparisonTable } from "./ComparisonTable";

export type DocHref = (docId: string, page?: number | null, bbox?: BBox | null, label?: string | null) => string | null;

export function officialDocHref(appId: string): DocHref {
  return (docId, page, bbox, label) => docLink(appId, docId, { page, bbox, label });
}

function Item({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <li className="rounded-md border border-line bg-surface p-2.5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 shrink-0 text-subtle-fg">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 text-sm font-medium text-fg">{title}</div>
            {action}
          </div>
          {children && <div className="mt-1 text-xs text-muted">{children}</div>}
        </div>
      </div>
    </li>
  );
}

function OpenLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-ink hover:brightness-95 dark:hover:brightness-125"
    >
      {children}
      <ArrowUpRight aria-hidden className="size-3" />
    </Link>
  );
}

function docName(docs: Record<string, DocumentSummary>, id: string | null | undefined, docTypeLabel: (c: string) => string) {
  if (!id) return "Document";
  const d = docs[id];
  return d ? `${docTypeLabel(d.declared_type)} (${d.original_filename})` : `Document ${id}`;
}

function Region({ e, docs, docHref, fallbackDocId, docTypeLabel }: {
  e: RegionEvidence;
  docs: Record<string, DocumentSummary>;
  docHref?: DocHref;
  fallbackDocId?: string | null;
  docTypeLabel: (c: string) => string;
}) {
  const docId = e.document_id ?? fallbackDocId ?? null;
  const href = docId && docHref ? docHref(docId, e.page, e.bbox, e.label ?? null) : null;
  return (
    <Item
      icon={<SquareDashed className="size-4" />}
      title={
        <>
          {pathLabel(e.label ?? "Region")}
          {e.value !== undefined && e.value !== null && (
            <span className="ml-1.5 font-normal text-muted">
              = <span className="font-mono text-[12px] text-fg">{fmtValue(e.value)}</span>
            </span>
          )}
        </>
      }
      action={href ? <OpenLink to={href}>{e.page ? `Open page ${e.page}` : "Open document"}</OpenLink> : undefined}
    >
      {docName(docs, docId, docTypeLabel)}
      {e.page ? `, page ${e.page}` : ""}
      {e.raw && e.raw !== e.value && <span className="block">Read as: "{e.raw}"</span>}
    </Item>
  );
}

function Peer({ e }: { e: PeerDocumentEvidence }) {
  return (
    <Item
      icon={<Link2 className="size-4" />}
      title={<>Matching document in application {e.application_id}</>}
      action={
        <OpenLink to={docLink(e.application_id, e.document_id, { page: e.page, bbox: e.bbox, label: "matched region" })}>
          Open other application
        </OpenLink>
      }
    >
      Document {e.document_id}
      {e.page ? `, page ${e.page}` : ""}. Opens the other application's workspace.
    </Item>
  );
}

function Verification({ e }: { e: VerificationEvidence }) {
  return (
    <Item
      icon={<ShieldCheck className="size-4" />}
      title={
        <span className="flex flex-wrap items-center gap-1.5">
          {channelMeta[e.channel]?.label ?? humanize(e.channel)}
          {e.simulated && <SimulatedBadge label={isSignatureChannel(e.channel) ? "DEMO" : "SIMULATED"} />}
        </span>
      }
    >
      <span className="block">Source: {e.source}</span>
      {e.comparisons?.length > 0 && (
        <div className="mt-2">
          <ComparisonTable comparisons={e.comparisons} />
        </div>
      )}
    </Item>
  );
}

function RevisionDiff({ e, docHref, fallbackDocId }: { e: RevisionDiffEvidence; docHref?: DocHref; fallbackDocId?: string | null }) {
  const docId = e.document_id ?? fallbackDocId;
  const href = docId && docHref ? docHref(docId, e.page, e.bbox, "changed in later revision") : null;
  return (
    <Item
      icon={<GitCompareArrows className="size-4" />}
      title={`Revision ${e.from_revision} to ${e.to_revision}, page ${e.page}`}
      action={href ? <OpenLink to={href}>Show region</OpenLink> : undefined}
    >
      <RevisionDiffText diff={e} />
    </Item>
  );
}

export function RevisionDiffText({ diff }: { diff: { added_text: string; removed_text: string; text_underneath: string } }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {diff.added_text && (
        <>
          <dt className="text-subtle-fg">Added</dt>
          <dd>
            <mark className="rounded bg-verified-bg px-1 font-mono text-[12px] text-verified-fg">{diff.added_text}</mark>
          </dd>
        </>
      )}
      {diff.text_underneath && (
        <>
          <dt className="text-subtle-fg">Text underneath</dt>
          <dd>
            <span className="rounded bg-mismatch-bg px-1 font-mono text-[12px] text-mismatch-fg line-through decoration-2">
              {diff.text_underneath}
            </span>
          </dd>
        </>
      )}
      {diff.removed_text && (
        <>
          <dt className="text-subtle-fg">Removed</dt>
          <dd className="font-mono text-[12px] text-fg">{diff.removed_text}</dd>
        </>
      )}
    </dl>
  );
}

export function GeoFigure({ e }: { e: GeoEvidence }) {
  // Equirectangular sketch of the two points; enough to show direction and separation
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
    <svg viewBox="0 0 120 120" className="size-28 shrink-0 rounded-md border border-line bg-subtle" role="img" aria-label={`Photo geotag ${e.distance_km} km from campus`}>
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="currentColor" strokeDasharray="3 3" className="text-subtle-fg" />
      <circle cx={cx} cy={cy} r="5" className="fill-verified-dot" />
      <circle cx={px} cy={py} r="5" className="fill-mismatch-dot" />
      <text x={cx + (dx >= 0 ? -8 : 8)} y={cy + 3} textAnchor={dx >= 0 ? "end" : "start"} className="fill-muted text-[9px]">
        campus
      </text>
      <text x={px + (dx >= 0 ? 8 : -8)} y={py + 3} textAnchor={dx >= 0 ? "start" : "end"} className="fill-muted text-[9px]">
        photo
      </text>
    </svg>
  );
}

function Geo({ e }: { e: GeoEvidence }) {
  return (
    <Item icon={<MapPin className="size-4" />} title={`Photo geotag ${fmtValue(e.distance_km)} km from campus on record`}>
      <div className="mt-1 flex items-center gap-3">
        <GeoFigure e={e} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-subtle-fg">Photo</dt>
          <dd className="font-mono">{e.photo.join(", ")}</dd>
          <dt className="text-subtle-fg">Campus</dt>
          <dd className="font-mono">{e.campus.join(", ")}</dd>
          <dt className="text-subtle-fg">Distance</dt>
          <dd>{fmtValue(e.distance_km)} km</dd>
        </dl>
      </div>
    </Item>
  );
}

export function EvidenceList({
  evidence,
  docs,
  docHref,
  fallbackDocId,
  docTypeLabel,
  className,
}: {
  evidence: Evidence[];
  docs: Record<string, DocumentSummary>;
  docHref?: DocHref;
  fallbackDocId?: string | null;
  docTypeLabel: (c: string) => string;
  className?: string;
}) {
  if (!evidence.length) return <p className="text-sm text-subtle-fg">No evidence items recorded.</p>;
  return (
    <ul className={clsx("space-y-2", className)}>
      {evidence.map((raw, i) => {
        const e = raw as Evidence;
        switch (e.kind) {
          case "region":
            return <Region key={i} e={e} docs={docs} docHref={docHref} fallbackDocId={fallbackDocId} docTypeLabel={docTypeLabel} />;
          case "document": {
            const href = docHref ? docHref(e.document_id) : null;
            return (
              <Item
                key={i}
                icon={<FileText className="size-4" />}
                title={docName(docs, e.document_id, docTypeLabel)}
                action={href ? <OpenLink to={href}>Open document</OpenLink> : undefined}
              />
            );
          }
          case "peer_document":
            return <Peer key={i} e={e} />;
          case "reference_record":
            return (
              <Item
                key={i}
                icon={<Database className="size-4" />}
                title={
                  <>
                    {pathLabel(e.label ?? "Reference record")}
                    {e.value !== undefined && (
                      <span className="ml-1.5 font-normal text-muted">
                        = <span className="font-mono text-[12px] text-fg">{fmtValue(e.value)}</span>
                      </span>
                    )}
                  </>
                }
              >
                {e.source ?? "Reference record"}
                {e.record_id && <span className="ml-1 font-mono text-[11px]">({e.record_id})</span>}
              </Item>
            );
          case "declared":
            return (
              <Item
                key={i}
                icon={<PenLine className="size-4" />}
                title={
                  <>
                    {pathLabel(e.label ?? e.field ?? "Declared value")}
                    {e.value !== undefined && (
                      <span className="ml-1.5 font-normal text-muted">
                        = <span className="font-mono text-[12px] text-fg">{fmtValue(e.value)}</span>
                      </span>
                    )}
                  </>
                }
              >
                Declared by the institution{e.field ? ` in form field ${e.field}` : ""}
              </Item>
            );
          case "verification":
            return <Verification key={i} e={e} />;
          case "revision_diff":
            return <RevisionDiff key={i} e={e} docHref={docHref} fallbackDocId={fallbackDocId} />;
          case "geo":
            return <Geo key={i} e={e} />;
          default:
            return (
              <Item key={i} icon={<FileText className="size-4" />} title={humanize((raw as { kind: string }).kind)}>
                <pre className="overflow-x-auto font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify(raw, null, 2)}</pre>
              </Item>
            );
        }
      })}
    </ul>
  );
}
