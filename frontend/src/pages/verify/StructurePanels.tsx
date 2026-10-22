import { CircleCheck, Info, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { pluralize } from "../../lib/format";
import { severityRank } from "../../lib/labels";
import type { PdfVerifyResult } from "../../types";
import { SeverityMeter } from "../../ui/Blocks";
import { Tag } from "../../ui/Badge";
import { SectionCard } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { fadeUp, stagger } from "../../ui/motion";
import { gap, pdfDate, pdfDateIso } from "./pdf";

const DATE_KEYS = new Set(["CreationDate", "ModDate"]);
const KEY_LABEL: Record<string, string> = {
  CreationDate: "Created",
  ModDate: "Last modified",
  Producer: "Producer",
  Creator: "Creator application",
  Author: "Author",
  Title: "Title",
  Subject: "Subject",
  Keywords: "Keywords",
};

function Signals({ data }: { data: PdfVerifyResult }) {
  const signals = [...data.forensic_signals].sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  const sealed = data.signatures.some((s) => s.response?.intact && s.response?.coverage === "ENTIRE_FILE");
  return (
    <SectionCard
      title={signals.length ? `Structural signals (${signals.length})` : "Structural signals"}
      description="Observable features of the file. They are indicators to look at, not conclusions."
      flush
    >
      {signals.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-ink-2">
          <CircleCheck className="size-5 text-verified-dot" aria-hidden /> No structural signals in this file.
        </div>
      ) : (
        <>
          {sealed && (
            <p className="flex items-start gap-2 border-b border-line bg-surface-2/50 px-5 py-2.5 text-xs text-ink-2">
              <Info className="mt-px size-3.5 shrink-0 text-brand-500" aria-hidden />
              The signature covers the entire file, so these features were already present when it was signed.
            </p>
          )}
          <motion.ul variants={stagger(0.06)} initial="hidden" animate="show" className="divide-y divide-line">
            {signals.map((s, i) => {
              const region = s.evidence.find((e) => e.kind === "region") as { page?: number | null } | undefined;
              return (
                <motion.li key={`${s.code}-${i}`} variants={fadeUp} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityMeter severity={s.severity} label />
                    <Tag variant="mono">{s.code}</Tag>
                    {region?.page && <span className="text-xs text-ink-3">Page {region.page}</span>}
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-sm break-words text-ink-2">{s.detail}</p>
                  {s.limitation && (
                    <p className="mt-2 rounded-control bg-manual-bg px-2.5 py-1.5 text-xs text-manual-fg">
                      <span className="font-semibold">Limitation: </span>
                      {s.limitation}
                    </p>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        </>
      )}
    </SectionCard>
  );
}

function Revisions({ count }: { count: number | null }) {
  const n = Math.max(1, count ?? 1);
  const shown = Math.min(n, 8);
  return (
    <SectionCard title="Revisions" description="Each incremental save appends a new revision to the file.">
      <div className="flex items-end gap-1.5" role="img" aria-label={pluralize(n, "revision")}>
        {Array.from({ length: shown }, (_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
            className={cn("relative block h-7 w-9 overflow-hidden rounded-[5px]", i === 0 ? "bg-brand-500" : "bg-manual-dot")}
          >
            <span className="absolute inset-x-0 top-0 h-[3px] bg-white/35" />
          </motion.span>
        ))}
        {n > shown && <span className="ml-1 text-xs text-ink-3">+{n - shown}</span>}
      </div>
      <p className="mt-3 text-sm text-ink-2">
        {n === 1 ? (
          <>
            <span className="font-semibold text-ink">One revision.</span> No content was appended after the file was first written.
          </>
        ) : (
          <>
            <span className="font-semibold text-manual-fg">{pluralize(n, "revision")}.</span> Content was appended after the first
            save. That is normal for signing workflows; compare what changed if it matters.
          </>
        )}
      </p>
    </SectionCard>
  );
}

function Metadata({ meta }: { meta: Record<string, string> }) {
  const rows = Object.entries(meta).filter(([, v]) => v !== "" && v != null);
  const created = meta.CreationDate ? pdfDateIso(meta.CreationDate) : null;
  const modified = meta.ModDate ? pdfDateIso(meta.ModDate) : null;
  const between = created && modified ? gap(created, modified) : null;
  return (
    <SectionCard title="Document information" description="Metadata is easy to edit. Treat it as context only.">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">The file has no document information dictionary.</p>
      ) : (
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => {
            const date = DATE_KEYS.has(k) ? pdfDate(v) : null;
            return (
              <div key={k} className="grid min-w-0 gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                <dt className="text-xs text-ink-3">{KEY_LABEL[k] ?? k}</dt>
                <dd className="min-w-0 text-sm break-words text-ink">
                  {date ?? v}
                  {date && <span className="block font-mono text-[11px] text-ink-4">{v}</span>}
                  {k === "ModDate" && between && <span className="block text-xs text-ink-3">{between} after creation</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </SectionCard>
  );
}

function ActiveContent({ items }: { items: PdfVerifyResult["active_content"] }) {
  return (
    <SectionCard title="Active content" description="Scripts, launch actions and embedded files that run or open from a PDF.">
      {items.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-ink-2">
          <CircleCheck className="size-5 text-verified-dot" aria-hidden /> None found. The file contains no scripts or embedded files.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.key} className="flex items-start gap-2.5 rounded-control bg-manual-bg px-3 py-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-manual-dot" aria-hidden />
              <div className="min-w-0 text-sm">
                <span className="font-mono text-xs font-semibold text-ink">{a.key}</span>
                <span className="ml-1.5 text-xs text-ink-3">x{a.count}</span>
                <p className="text-ink-2">{a.meaning}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function StructurePanels({ data }: { data: PdfVerifyResult }) {
  return (
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Signals data={data} />
      <div className="grid min-w-0 gap-5">
        <Revisions count={data.revisions} />
        <Metadata meta={data.metadata ?? {}} />
        <ActiveContent items={data.active_content} />
      </div>
    </div>
  );
}
