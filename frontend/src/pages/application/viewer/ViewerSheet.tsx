import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { workspacePath } from "../../../shell/nav";
import { Drawer, ErrorState, MetaList, Skeleton } from "../../../ui2";
import { useDocTypeLabel, useWorkspace, type DocTarget } from "../context";
import { bboxParam, useDocument, validBox } from "../data";
import { DocViewer } from "./DocViewer";

/** A document page opened from a finding or rule, at the region the evidence points to. */
export function ViewerSheet({ target, onClose, onFinding }: { target: DocTarget | null; onClose: () => void; onFinding?: (id: string) => void }) {
  const { app, findings } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const q = useDocument(target?.docId);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (target) setPage(target.page ?? 1);
  }, [target]);

  const doc = q.data && q.data.id === target?.docId ? q.data : undefined;
  const focus = target && target.page && validBox(target.bbox) ? { page: target.page, bbox: target.bbox, label: target.label } : null;

  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      title={doc ? docLabel(doc.declared_type) : "Document"}
      description={doc ? doc.original_filename : undefined}
      width={880}
      footer={
        target ? (
          <Link
            to={workspacePath(app.id, "documents", {
              doc: target.docId,
              page: target.page ? String(target.page) : undefined,
              hl: bboxParam(target.bbox) ?? undefined,
              hlabel: target.label ?? undefined,
            })}
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded text-sm font-medium text-ink hover:underline"
          >
            Open in Documents <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        ) : null
      }
    >
      <div className="flex h-full min-h-[480px] flex-col p-4">
        {q.isPending ? (
          <div role="status" className="h-full min-h-[480px]">
            <span className="sr-only">Loading the document</span>
            <Skeleton className="h-full min-h-[480px] w-full" />
          </div>
        ) : q.error || !doc ? (
          <ErrorState error={q.error} title="Could not load the document" onRetry={() => void q.refetch()} />
        ) : (
          <DocViewer
            doc={doc}
            meta={<MetaList items={[`${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}`, focus?.label ? `Showing: ${focus.label}` : null]} />}
            findings={(findings ?? []).filter((f) => f.document_id === doc.id || f.evidence.some((e) => "document_id" in e && e.document_id === doc.id))}
            page={page}
            onPage={setPage}
            focus={focus}
            onBoxClick={onFinding ? (b) => b.findingId && onFinding(b.findingId) : undefined}
            className="min-h-0 flex-1"
          />
        )}
      </div>
    </Drawer>
  );
}
