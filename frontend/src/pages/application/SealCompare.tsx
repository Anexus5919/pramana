import { ArrowUpRight, Equal, ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { workspacePath } from "../../shell/nav";
import type { BBox, ImageMatchEvidence } from "../../types";
import { Button, buttonStyles, Code, Skeleton } from "../../ui2";
import { useWorkspace } from "./context";
import { bboxParam, useDocument } from "./data";

const SIZE = 128;
const PAD = 4;

/** A region of a rendered page, cut out with CSS from the page image the viewer already uses. */
export function RegionCrop({ docId, page, bbox, label }: { docId: string; page: number; bbox: BBox; label: string }) {
  const q = useDocument(docId);
  const pg = q.data?.pages.find((p) => p.page_no === page);
  if (!pg) return <Skeleton className="size-[128px]" />;
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0 + 2 * PAD;
  const h = y1 - y0 + 2 * PAD;
  const s = SIZE / Math.max(w, h);
  return (
    <div className="relative shrink-0 overflow-hidden rounded-control border border-line bg-white" style={{ width: SIZE, height: SIZE }}>
      <img
        src={api.pageImageUrl(docId, page)}
        alt={label}
        loading="lazy"
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ width: pg.width * s, left: -(x0 - PAD) * s + (SIZE - w * s) / 2, top: -(y0 - PAD) * s + (SIZE - h * s) / 2 }}
      />
    </div>
  );
}

/** Both seals side by side: the reviewer sees the copied image, not just a hash distance. */
export function SealCompare({ e }: { e: ImageMatchEvidence }) {
  const { openDoc } = useWorkspace();
  return (
    <li className="min-w-0 py-3">
      <div className="text-sm font-medium text-ink">Seal image on two certificates from different issuers</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <figure className="min-w-0">
          <RegionCrop docId={e.document_id} page={e.page} bbox={e.bbox} label={`Seal on this document, page ${e.page}`} />
          <figcaption className="mt-1.5 max-w-[128px] text-xs text-ink-3">
            <span className="block font-medium text-ink-2">This document</span>
            Issuer: {e.issuer}
          </figcaption>
        </figure>
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-3">
          <Equal className="size-4" />
        </span>
        <figure className="min-w-0">
          <RegionCrop docId={e.peer_document_id} page={e.peer_page} bbox={e.peer_bbox} label={`Seal on the document in application ${e.peer_application_id}`} />
          <figcaption className="mt-1.5 max-w-[128px] text-xs text-ink-3">
            <Code className="block text-xs font-medium">{e.peer_application_id}</Code>
            Issuer: {e.peer_issuer}
          </figcaption>
        </figure>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {e.exact ? "The embedded images are pixel-identical." : `Perceptual hash distance ${e.distance} of ${e.bits ?? 256} bits.`} {e.peer_institution} submitted the other document.
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" leadingIcon={<ScanSearch />} onClick={() => openDoc({ docId: e.document_id, page: e.page, bbox: e.bbox, label: "Seal image" })}>
          Show on page {e.page}
        </Button>
        <Link
          className={buttonStyles("ghost", "sm")}
          to={workspacePath(e.peer_application_id, "documents", {
            doc: e.peer_document_id,
            page: String(e.peer_page),
            hl: bboxParam(e.peer_bbox) ?? undefined,
            hlabel: "matched seal",
          })}
        >
          Open other application <ArrowUpRight aria-hidden />
        </Link>
      </div>
    </li>
  );
}
