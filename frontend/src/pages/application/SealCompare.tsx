import { ArrowUpRight, Equal, SquareDashed } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import type { BBox, ImageMatchEvidence } from "../../types";
import { Skeleton } from "../../ui/Skeleton";
import { dur, ease } from "../../ui/motion";
import { useWorkspace } from "./context";
import { appPath, bboxParam, useDocument } from "./data";

const SIZE = 128;
const PAD = 4;

/** A region of a rendered page, cut out with CSS from the page image the viewer already uses. */
export function RegionCrop({ docId, page, bbox, label }: { docId: string; page: number; bbox: BBox; label: string }) {
  const q = useDocument(docId);
  const pg = q.data?.pages.find((p) => p.page_no === page);
  if (!pg) return <Skeleton className="size-[128px] rounded-[10px]" />;
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0 + 2 * PAD;
  const h = y1 - y0 + 2 * PAD;
  const s = SIZE / Math.max(w, h);
  return (
    <div className="relative shrink-0 overflow-hidden rounded-[10px] border border-line bg-white" style={{ width: SIZE, height: SIZE }}>
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
    <li className="rounded-[10px] border border-line bg-surface px-3 py-3">
      <div className="text-sm font-medium text-ink">Seal image on two certificates from different issuers</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <motion.figure className="min-w-0" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: dur.panel, ease: ease.out }}>
          <RegionCrop docId={e.document_id} page={e.page} bbox={e.bbox} label={`Seal on this document, page ${e.page}`} />
          <figcaption className="mt-1.5 max-w-[128px] text-[11.5px] leading-snug text-ink-3">
            <span className="block font-medium text-ink-2">This document</span>
            Issuer: {e.issuer}
          </figcaption>
        </motion.figure>
        <motion.span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-mismatch-bg text-mismatch-fg"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: dur.panel, duration: dur.ui, ease: ease.out }}
        >
          <Equal className="size-4" />
        </motion.span>
        <motion.figure className="min-w-0" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: dur.panel, ease: ease.out }}>
          <RegionCrop docId={e.peer_document_id} page={e.peer_page} bbox={e.peer_bbox} label={`Seal on the document in application ${e.peer_application_id}`} />
          <figcaption className="mt-1.5 max-w-[128px] text-[11.5px] leading-snug text-ink-3">
            <span className="block font-medium text-ink-2">{e.peer_application_id}</span>
            Issuer: {e.peer_issuer}
          </figcaption>
        </motion.figure>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {e.exact ? "The embedded images are pixel-identical." : `Perceptual hash distance ${e.distance} of ${e.bits ?? 256} bits.`} {e.peer_institution} submitted the other document.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100"
          onClick={() => openDoc({ docId: e.document_id, page: e.page, bbox: e.bbox, label: "Seal image" })}
        >
          <SquareDashed aria-hidden className="size-3.5" /> Show on page {e.page}
        </button>
        <Link
          className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100"
          to={appPath(e.peer_application_id, "documents", { doc: e.peer_document_id, page: e.peer_page, hl: bboxParam(e.peer_bbox), hlabel: "matched seal" })}
        >
          Open other application <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      </div>
    </li>
  );
}
