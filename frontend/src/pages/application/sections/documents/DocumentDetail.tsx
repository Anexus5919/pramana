import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { humanize } from "../../../../lib/labels";
import { workspacePath } from "../../../../shell/nav";
import type { ExtractedField } from "../../../../types";
import { Callout, ErrorState, MetaList, Panel, ReviewBadge, SeverityIndicator, Skeleton, Tabs, VerificationBadge, type TabItem } from "../../../../ui2";
import { useDocTypeLabel, useWorkspace } from "../../context";
import { bboxParam, llmReportOf, parseBBox, useDocument, useSetParams, validBox } from "../../data";
import { RevisionPanel, RevisionStage } from "../../history/TimeMachine";
import { DocumentStory } from "../../insights/DocumentStory";
import { DocViewer, type Focus } from "../../viewer/DocViewer";
import type { OverlayBox } from "../../viewer/overlays";
import { DocVerificationPanel, ExtractionPanel, FieldsPanel, ForensicsPanel } from "./panels";
import { DOC_PANELS, docFindings, instructionLinesFor, textSourceLabel, type DocPanel } from "./shared";

const FRAME_HEIGHT = "h-[min(78vh,880px)] min-h-[520px]";

export function DocumentDetail({ docId }: { docId: string }) {
  const { app, run, findings, role } = useWorkspace();
  const label = useDocTypeLabel();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const setParams = useSetParams();
  const q = useDocument(docId);
  const doc = q.data && q.data.id === docId ? q.data : undefined;
  const side = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const page = Number(sp.get("page")) || 1;
  const hl = parseBBox(sp.get("hl"));
  const focus: Focus | null = hl ? { page, bbox: hl, label: sp.get("hlabel") } : null;
  const status = (run?.document_status ?? app.latest_run?.document_status ?? {})[docId];

  const report = doc ? llmReportOf(doc) : null;
  const lines = useMemo(() => (doc ? instructionLinesFor(doc, findings) : []), [doc, findings]);
  const onDoc = useMemo(() => docFindings(findings, docId), [findings, docId]);
  const hasRevisions = !!doc && doc.mime === "application/pdf" && !!doc.forensic_facts;
  const officer = role === "officer";

  const tabs: TabItem[] = [
    { id: "fields", label: "Fields" },
    { id: "verification", label: "Verification" },
    ...(officer ? [{ id: "forensics", label: "Forensics" }] : []),
    ...(hasRevisions ? [{ id: "revisions", label: "Revisions" }] : []),
    { id: "extraction", label: "Extraction" },
  ];
  const rawPanel = sp.get("panel");
  const asked = (rawPanel === "model" ? "extraction" : rawPanel === "rows" ? "fields" : rawPanel) as DocPanel | null;
  const panel: DocPanel =
    asked && (DOC_PANELS as readonly string[]).includes(asked) && tabs.some((t) => t.id === asked)
      ? asked
      : doc && (report?.rejected.length || lines.length)
        ? "extraction"
        : "fields";

  const setFocus = useCallback((f: Focus) => setParams({ page: f.page, hl: bboxParam(f.bbox), hlabel: f.label ?? null }), [setParams]);
  const locate = (f: ExtractedField) => {
    if (f.page && validBox(f.bbox)) setFocus({ page: f.page, bbox: f.bbox, label: humanize(f.name) });
  };

  // Clicking a field box on the page selects that field in the side panel; a finding box opens the finding
  const onBoxClick = (b: OverlayBox) => {
    if (b.findingId) {
      navigate(workspacePath(app.id, "findings", { finding: b.findingId }));
      return;
    }
    if (b.layer === "fields") {
      setParams({ panel: "fields" });
      setFlash(b.key);
      window.setTimeout(() => side.current?.querySelector(`[data-field="${CSS.escape(b.key)}"]`)?.scrollIntoView({ block: "nearest" }), 60);
      window.setTimeout(() => setFlash((k) => (k === b.key ? null : k)), 1400);
    }
  };
  const onHover = useCallback((b: OverlayBox | null) => setFlash(b?.layer === "fields" ? b.key : null), []);

  useEffect(() => setFlash(null), [docId, panel]);

  const back = (
    <Link to={workspacePath(app.id, "documents")} className="inline-flex items-center gap-1.5 rounded text-sm text-ink-3 transition-colors duration-150 hover:text-ink">
      <ArrowLeft aria-hidden className="size-4" />
      All documents
    </Link>
  );

  if (q.isPending)
    return (
      <div className="space-y-4">
        {back}
        <div role="status" className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <span className="sr-only">Loading the document</span>
          <Skeleton className={FRAME_HEIGHT} />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  if (q.error || !doc)
    return (
      <div className="space-y-4">
        {back}
        <ErrorState error={q.error} title="Could not load the document" onRetry={() => void q.refetch()} />
      </div>
    );

  const typeDiffers = !!doc.detected_type && doc.detected_type !== doc.declared_type;
  const meta = (
    <MetaList
      items={[
        <span key="file" className="font-mono">
          {doc.original_filename}
        </span>,
        `${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}`,
        textSourceLabel(doc.text_source),
        doc.superseded ? "Earlier version" : null,
        <VerificationBadge key="ver" status={status ?? "not_checked"} />,
      ]}
    />
  );

  return (
    <div className="space-y-4">
      {back}
      {doc.processing_status === "failed" ? (
        <Callout tone="warning" title="This file could not be read">
          {doc.processing_error ?? "No reason was recorded."} Fields and checks that need its text could not run.
        </Callout>
      ) : (
        typeDiffers && (
          <Callout tone="warning" title="Declared type differs from the content">
            Declared as {label(doc.declared_type)}, but the content reads as {label(doc.detected_type)}.
          </Callout>
        )
      )}

      {officer && <DocumentStory doc={doc} onFocus={setFocus} />}

      <div className="grid items-start gap-6 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 xl:sticky xl:top-20">
          {panel === "revisions" ? (
            <RevisionStage doc={doc} className={FRAME_HEIGHT} />
          ) : (
            <DocViewer
              doc={doc}
              title={label(doc.declared_type)}
              meta={meta}
              findings={onDoc}
              page={page}
              onPage={(n) => setParams({ page: n, hl: null, hlabel: null })}
              focus={focus}
              onHover={onHover}
              onBoxClick={onBoxClick}
              isClickable={(b) => !!b.findingId || b.layer === "fields"}
              className={FRAME_HEIGHT}
            />
          )}
        </div>

        <div ref={side} className="min-w-0 space-y-6">
          <Panel padding="none">
            <Tabs
              idBase="doc"
              label="Document details"
              items={tabs}
              value={panel}
              onChange={(id) => setParams({ panel: id, rev: id === "revisions" ? sp.get("rev") : null })}
              className="px-5"
            />
            <div role="tabpanel" id={`doc-panel-${panel}`} aria-labelledby={`doc-tab-${panel}`} className="min-w-0">
              {panel === "fields" && <FieldsPanel doc={doc} onLocate={locate} onFocus={setFocus} flash={flash} />}
              {panel === "verification" && <DocVerificationPanel doc={doc} />}
              {panel === "forensics" && officer && <ForensicsPanel doc={doc} onFocus={setFocus} />}
              {panel === "revisions" && <RevisionPanel doc={doc} />}
              {panel === "extraction" && (
                <ExtractionPanel
                  doc={doc}
                  report={report}
                  lines={lines}
                  onFocus={(f) => {
                    setFocus(f);
                  }}
                  onLocateField={(name) => {
                    const f = doc.fields.find((x) => x.name === name);
                    if (f) locate(f);
                  }}
                />
              )}
            </div>
          </Panel>

          <Panel title="Findings on this document" padding="none">
            {onDoc.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-ink-3">No finding points at this document.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {onDoc.map((f) => (
                  <li key={f.id}>
                    <Link
                      to={workspacePath(app.id, "findings", { finding: f.id })}
                      className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors duration-150 hover:bg-surface-2"
                    >
                      <SeverityIndicator severity={f.severity} className="w-24 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-ink">{f.title}</span>
                      {f.review_status !== "open" && <ReviewBadge status={f.review_status} />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
