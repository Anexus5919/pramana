import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet } from "../../../ui/Dialog";
import { ErrorState } from "../../../ui/States";
import { Skeleton } from "../../../ui/Skeleton";
import { useDocTypeLabel, useWorkspace, type DocTarget } from "../context";
import { appPath, bboxParam, useDocument, validBox } from "../data";
import { DocViewer } from "./DocViewer";

/** Document opened from a finding or rule: the page slides in from the side of the evidence that opened it. */
export function ViewerSheet({ target, onClose, onFinding }: { target: DocTarget | null; onClose: () => void; onFinding?: (id: string) => void }) {
  const { app, findings } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const q = useDocument(target?.docId);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (target) setPage(target.page ?? 1);
  }, [target]);

  const doc = q.data;
  const focus = target && target.page && validBox(target.bbox) ? { page: target.page, bbox: target.bbox, label: target.label } : null;
  const title = doc ? docLabel(doc.declared_type) : "Document";

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title={title}
      description={doc ? doc.original_filename : undefined}
      width="min(1040px, 94vw)"
      footer={
        target ? (
          <Link
            to={appPath(app.id, "documents", { doc: target.docId, page: target.page, hl: bboxParam(target.bbox), hlabel: target.label })}
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline"
          >
            Open in the Documents tab with fields, forensics and verification <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        ) : null
      }
    >
      <div className="flex h-full min-h-[480px] flex-col p-4">
        {q.isPending ? (
          <Skeleton className="h-full min-h-[480px] w-full" rounded="lg" />
        ) : q.error || !doc ? (
          <ErrorState error={q.error} title="Could not load the document" onRetry={() => void q.refetch()} />
        ) : (
          <DocViewer
            doc={doc}
            findings={(findings ?? []).filter((f) => f.document_id === doc.id || f.evidence.some((e) => "document_id" in e && e.document_id === doc.id))}
            page={page}
            onPage={setPage}
            focus={focus}
            onBoxClick={onFinding ? (b) => b.findingId && onFinding(b.findingId) : undefined}
            className="min-h-0 flex-1"
          />
        )}
      </div>
    </Sheet>
  );
}
