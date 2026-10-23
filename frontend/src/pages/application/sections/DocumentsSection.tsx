import type { UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { fmtDateTime, fmtRelative } from "../../../lib/format";
import { workspacePath } from "../../../shell/nav";
import type { DocumentSummary, VerificationAttempt } from "../../../types";
import { DataTable, EmptyState, Panel, SegmentedControl, Toolbar, VerificationBadge, type Column } from "../../../ui2";
import { useDocTypeLabel, useWorkspace } from "../context";
import { isOpenFinding, useSetParams } from "../data";
import { DocumentDetail } from "./documents/DocumentDetail";
import { DOC_PARAMS, docFindings, textSourceLabel } from "./documents/shared";
import { VerificationView } from "./documents/VerificationView";

type View = "documents" | "verification";

function DocumentsTable({ rows, label }: { rows: DocumentSummary[]; label: string }) {
  const { app, run, findings } = useWorkspace();
  const typeLabel = useDocTypeLabel();
  const status = run?.document_status ?? app.latest_run?.document_status ?? {};
  const open = (id: string) => docFindings(findings, id).filter(isOpenFinding).length;

  const columns: Column<DocumentSummary>[] = [
    {
      id: "doc",
      header: "Document",
      cell: (d) => (
        <span className="block min-w-0">
          <span className="block truncate">{typeLabel(d.declared_type)}</span>
          <span className="block truncate font-mono text-xs font-normal text-ink-3">{d.original_filename}</span>
        </span>
      ),
      sortValue: (d) => typeLabel(d.declared_type),
    },
    {
      id: "read",
      header: "Read",
      cell: (d) =>
        d.processing_status === "failed" ? (
          <span className="font-medium text-mismatch-fg">Failed</span>
        ) : d.processing_status === "processed" ? (
          <span>
            Read <span className="text-ink-3">from {textSourceLabel(d.text_source).toLowerCase()}</span>
          </span>
        ) : (
          <span className="text-ink-3">Not read yet</span>
        ),
      hideBelow: "md",
    },
    {
      id: "verification",
      header: "Verification",
      cell: (d) => <VerificationBadge status={status[d.id] ?? "not_checked"} />,
      sortValue: (d) => status[d.id] ?? "not_checked",
    },
    {
      id: "open",
      header: "Open findings",
      align: "right",
      cell: (d) => {
        const n = open(d.id);
        return <span className={n ? "font-medium text-ink" : "text-ink-3"}>{n}</span>;
      },
      sortValue: (d) => open(d.id),
    },
    {
      id: "uploaded",
      header: "Uploaded",
      cell: (d) => (d.uploaded_at ? <span title={fmtDateTime(d.uploaded_at)}>{fmtRelative(d.uploaded_at)}</span> : <span className="text-ink-4">Not given</span>),
      sortValue: (d) => d.uploaded_at ?? "",
      hideBelow: "lg",
    },
  ];

  return <DataTable label={label} rows={rows} rowKey={(d) => d.id} columns={columns} rowHref={(d) => workspacePath(app.id, "documents", { doc: d.id })} />;
}

function DocumentsList() {
  const { app } = useWorkspace();
  const current = useMemo(() => app.documents.filter((d) => !d.superseded), [app.documents]);
  const earlier = useMemo(() => app.documents.filter((d) => d.superseded), [app.documents]);

  if (!app.documents.length)
    return (
      <Panel>
        <EmptyState title="No documents uploaded" description="The institution has not uploaded any documents for this application yet. They appear here once uploaded." />
      </Panel>
    );

  return (
    <Panel padding="none">
      <DocumentsTable rows={current} label="Documents submitted with this application" />
      {earlier.length > 0 && (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-2">
            Earlier versions ({earlier.length})
          </summary>
          <div className="border-t border-line">
            <DocumentsTable rows={earlier} label="Earlier versions replaced by a later upload" />
          </div>
        </details>
      )}
    </Panel>
  );
}

/** Documents section: what was submitted, what was read and what was verified. */
export function DocumentsSection({ query }: { query: UseQueryResult<VerificationAttempt[]> }) {
  const { app } = useWorkspace();
  const [sp] = useSearchParams();
  const setParams = useSetParams();
  const view: View = sp.get("view") === "verification" ? "verification" : "documents";
  const docParam = sp.get("doc");
  const docId = docParam && app.documents.some((d) => d.id === docParam) ? docParam : null;

  return (
    <div className="space-y-4">
      <Toolbar>
        <SegmentedControl
          label="View"
          value={view}
          onChange={(v) => setParams({ ...DOC_PARAMS, attempt: null, view: v === "documents" ? null : v }, { push: true })}
          options={[
            { value: "documents", label: "Documents" },
            { value: "verification", label: "Verification" },
          ]}
        />
      </Toolbar>
      {view === "verification" ? <VerificationView query={query} /> : docId ? <DocumentDetail key={docId} docId={docId} /> : <DocumentsList />}
    </div>
  );
}
