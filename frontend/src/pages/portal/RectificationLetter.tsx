import { Download, FileText } from "lucide-react";
import { motion } from "motion/react";
import { fmtDate, pluralize } from "../../lib/format";
import { buttonClasses } from "../../ui/Button";
import { Digest } from "../../ui/Digest";
import { dur, ease } from "../../ui/motion";
import { officerApi, useLetters } from "../application/officer/officerApi";

/** The finalised deficiency notice attached to a rectification request, for the institution to download. */
export function RectificationLetter({ appId, rectificationId }: { appId: string; rectificationId: string }) {
  const q = useLetters(appId);
  const letter = q.data?.find((l) => l.rectification_id === rectificationId && l.status === "final");
  if (!letter) return null;
  const due = letter.items.map((i) => i.respond_by).sort()[0];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className="mt-3 flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft text-brand-ink">
        <FileText aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">Deficiency notice</span>
        <span className="block text-xs text-ink-3">
          {pluralize(letter.items.length, "item")}, issued {fmtDate(letter.finalised_at)}
          {due ? `, respond by ${fmtDate(due)}` : ""}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-4">
          SHA-256 <Digest value={letter.final_sha256} label="Notice SHA-256" head={10} tail={6} />
        </span>
      </span>
      <a href={officerApi.letterPdfUrl(letter.id)} download className={buttonClasses("secondary", "sm")}>
        <Download aria-hidden /> Download PDF
      </a>
    </motion.div>
  );
}
