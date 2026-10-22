import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { FileText, ImageIcon, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, qk } from "../../../api";
import { Pill, StatusPill } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { EmptyState, ErrorBanner, Skeleton } from "../../../components/ui/Feedback";
import { fmtBytes } from "../../../lib/format";
import { humanize } from "../../../lib/labels";
import type { ApplicationDetail, BBox, DocumentSummary, Finding, RunFull } from "../../../types";
import { DocumentSidePanel } from "../../documents/DocumentSidePanel";
import { DocumentViewer, type Focus } from "../../documents/DocumentViewer";
import { buildOverlays, LAYERS, type LayerId, type OverlayBox } from "../../documents/overlays";
import { useLabels } from "../../shared/useRuleset";
import { findingLink, parseBBox } from "../links";

function DocList({
  docs,
  selected,
  onSelect,
  status,
  docTypeLabel,
}: {
  docs: DocumentSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
  status: Record<string, string>;
  docTypeLabel: (c: string) => string;
}) {
  return (
    <ul className="space-y-1.5" aria-label="Documents">
      {docs.map((d) => {
        const active = d.id === selected;
        const mismatch = d.detected_type && d.detected_type !== d.declared_type;
        const Icon = d.mime.startsWith("image/") ? ImageIcon : FileText;
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              aria-current={active ? "true" : undefined}
              className={clsx(
                "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                active ? "border-primary/50 bg-primary-soft/70" : "border-line bg-surface hover:bg-subtle/60",
                d.superseded && "opacity-60",
              )}
            >
              <span className="flex items-start gap-2">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle-fg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug font-medium text-fg">{docTypeLabel(d.declared_type)}</span>
                  <span className="block truncate text-[11px] text-subtle-fg" title={d.original_filename}>
                    {d.original_filename}
                  </span>
                </span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1">
                {d.superseded ? (
                  <Pill tone="unchecked" dot={false}>Superseded</Pill>
                ) : status[d.id] ? (
                  <StatusPill status={status[d.id]} />
                ) : (
                  <Pill tone="unchecked" dot={false}>{humanize(d.processing_status)}</Pill>
                )}
              </span>
              <span className="mt-1 block text-[11px] text-subtle-fg">
                {d.page_count} p, {fmtBytes(d.size_bytes)}, text {humanize(d.text_source ?? "pending").toLowerCase()}
              </span>
              {mismatch && (
                <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-manual-fg">
                  <TriangleAlert aria-hidden className="size-3" /> Detected as {docTypeLabel(d.detected_type!)}
                </span>
              )}
              {d.processing_status === "failed" && (
                <span className="mt-1 block text-[11px] font-medium text-mismatch-fg">Processing failed</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DocumentsTab({ app, run, findings }: { app: ApplicationDetail; run: RunFull | undefined; findings: Finding[] }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { docType } = useLabels();
  const [visible, setVisible] = useState<Record<LayerId, boolean>>({ fields: true, findings: true, qr: true, rows: false });
  const [showSuperseded, setShowSuperseded] = useState(false);

  const docs = useMemo(
    () => [...app.documents].sort((a, b) => Number(a.superseded) - Number(b.superseded) || a.declared_type.localeCompare(b.declared_type)),
    [app.documents],
  );
  const listed = showSuperseded ? docs : docs.filter((d) => !d.superseded);
  const docId = params.get("doc") ?? listed[0]?.id ?? null;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const hl = parseBBox(params.get("hl"));
  const focus: Focus | null = hl ? { page, bbox: hl, label: params.get("hlabel") } : null;

  const docQ = useQuery({ queryKey: qk.document(docId ?? "none"), queryFn: () => api.document(docId!), enabled: !!docId });
  const doc = docQ.data;
  const docFindings = useMemo(
    () => findings.filter((f) => f.document_id === docId || f.evidence.some((e) => "document_id" in e && e.document_id === docId)),
    [findings, docId],
  );
  const overlays = useMemo(() => (doc ? buildOverlays(doc, docFindings) : []), [doc, docFindings]);
  const layerCounts = useMemo(() => {
    const c: Record<LayerId, number> = { fields: 0, findings: 0, qr: 0, rows: 0 };
    for (const o of overlays) c[o.layer] += 1;
    return c;
  }, [overlays]);

  function update(next: { doc?: string; page?: number; hl?: BBox | null; hlabel?: string | null }) {
    const p = new URLSearchParams(params);
    if (next.doc !== undefined) p.set("doc", next.doc);
    if (next.page !== undefined) p.set("page", String(next.page));
    if (next.hl !== undefined) {
      if (next.hl) p.set("hl", next.hl.join(","));
      else p.delete("hl");
    }
    if (next.hlabel !== undefined) {
      if (next.hlabel) p.set("hlabel", next.hlabel);
      else p.delete("hlabel");
    }
    setParams(p, { replace: true });
  }

  function onBoxClick(b: OverlayBox) {
    if (b.findingId) navigate(findingLink(app.id, b.findingId));
    else update({ hl: b.bbox, hlabel: b.label, page: b.page });
  }

  if (!docs.length) {
    return (
      <Card>
        <EmptyState icon={<FileText className="size-6" />} title="No documents uploaded">
          The institution has not uploaded any documents for this application.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <DocList docs={listed} selected={docId} onSelect={(id) => update({ doc: id, page: 1, hl: null, hlabel: null })} status={run?.document_status ?? {}} docTypeLabel={docType} />
        {docs.some((d) => d.superseded) && (
          <label className="mt-2 flex items-center gap-2 px-1 text-xs text-muted">
            <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
            Show superseded uploads
          </label>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
          <legend className="sr-only">Overlay layers</legend>
          <span className="font-medium text-subtle-fg">Layers</span>
          {LAYERS.map((l) => (
            <label key={l.id} className={clsx("inline-flex items-center gap-1.5", !layerCounts[l.id] && "opacity-55")}>
              <input
                type="checkbox"
                checked={visible[l.id]}
                onChange={(e) => setVisible((v) => ({ ...v, [l.id]: e.target.checked }))}
                className="size-3.5 accent-[var(--primary)]"
              />
              <span aria-hidden className={clsx("size-2.5 rounded-sm", l.swatch)} />
              <span className="text-fg">{l.label}</span>
              <span className="text-subtle-fg tabular-nums">{layerCounts[l.id]}</span>
            </label>
          ))}
          {focus && (
            <button type="button" onClick={() => update({ hl: null, hlabel: null })} className="ml-auto inline-flex items-center gap-1.5 font-medium text-primary-ink hover:underline">
              <span aria-hidden className="size-2.5 rounded-sm bg-ov-focus" /> Clear highlight
            </button>
          )}
        </fieldset>
        {docQ.isPending ? (
          <Skeleton className="h-[70vh]" />
        ) : docQ.error ? (
          <ErrorBanner error={docQ.error} title="Could not load the document" />
        ) : doc ? (
          <DocumentViewer
            doc={doc}
            page={Math.min(page, Math.max(doc.page_count, doc.pages.length, 1))}
            onPage={(p) => update({ page: p })}
            overlays={overlays}
            visible={visible}
            focus={focus}
            onBoxClick={onBoxClick}
          />
        ) : null}
      </div>

      <div className="min-w-0">
        {doc ? (
          <DocumentSidePanel
            key={doc.id}
            doc={doc}
            runId={run?.id}
            docTypeLabel={docType}
            onFocus={(p, bbox, label) => update({ page: p, hl: bbox, hlabel: label })}
          />
        ) : (
          <Skeleton className="h-96" />
        )}
      </div>
    </div>
  );
}
