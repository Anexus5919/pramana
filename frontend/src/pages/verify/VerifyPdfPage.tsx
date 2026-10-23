import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, History, QrCode, ShieldCheck, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { shortHash } from "../../lib/format";
import { verificationMeta } from "../../lib/labels";
import type { PdfVerifyResult } from "../../types";
import { StatusCube } from "../../ui/Blocks";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { PageHeader } from "../../ui/Layout";
import { dur, ease, spring } from "../../ui/motion";
import { ErrorState } from "../../ui/States";
import { DropZone } from "./DropZone";
import { loadHistory, overallStatus, saveHistory, sha256Hex, type HistoryEntry } from "./pdf";
import { ReadingCard, type Reading } from "./ReadingCard";
import { NoSignature, SignatureChain } from "./SignatureChain";
import { StructurePanels } from "./StructurePanels";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

function Results({ data }: { data: PdfVerifyResult }) {
  const signed = data.signatures.filter((s) => s.response?.signer);
  return (
    <div className="space-y-6">
      <section aria-labelledby="sig-title" className="space-y-4">
        <h2 id="sig-title" className="font-display text-lg font-semibold tracking-title text-ink">
          {signed.length > 1 ? `${signed.length} digital signatures` : "Digital signature"}
        </h2>
        {signed.length === 0 ? (
          <NoSignature detail={data.signatures[0]?.detail} filename={data.filename} pages={data.pages} />
        ) : (
          signed.map((s, i) => <SignatureChain key={`${s.response.field ?? i}`} s={s} filename={data.filename} pages={data.pages} />)
        )}
      </section>
      <section aria-labelledby="structure-title" className="space-y-4">
        <h2 id="structure-title" className="font-display text-lg font-semibold tracking-title text-ink">
          File structure
        </h2>
        <StructurePanels data={data} />
      </section>
    </div>
  );
}

function HistoryList({
  items,
  selected,
  onSelect,
  onClear,
}: {
  items: HistoryEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <aside aria-labelledby="history-title" className="rounded-card border border-line bg-surface shadow-sm xl:sticky xl:top-24">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 id="history-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <History className="size-4 text-ink-3" aria-hidden /> Checked this session
        </h2>
        <Button size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={onClear}>
          Clear
        </Button>
      </header>
      <ul className="space-y-0.5 px-2 pb-2">
        <AnimatePresence initial={false}>
          {items.map((h) => {
            const status = overallStatus(h.result);
            const on = h.id === selected;
            return (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.ui, ease: ease.out }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(h.id)}
                  aria-current={on || undefined}
                  className={cn(
                    "relative flex w-full items-start gap-3 rounded-control px-2.5 py-2 text-left transition-colors duration-200",
                    on ? "text-ink" : "text-ink-2 hover:bg-surface-2",
                  )}
                >
                  {on && (
                    <motion.span layoutId="verify-history-active" transition={spring.snappy} className="absolute inset-0 rounded-control bg-brand-soft" aria-hidden />
                  )}
                  <StatusCube status={status} size={14} className="relative mt-0.5" />
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" title={h.result.filename}>
                      {h.result.filename}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {verificationMeta[status]?.label ?? "Checked"}, {timeFmt.format(new Date(h.at))}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-4">{shortHash(h.result.sha256, 16)}</span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </aside>
  );
}

function Intro() {
  const points = [
    { t: "Intact", d: "The signed bytes have not changed since signing." },
    { t: "Trusted", d: "The signer's certificate chains to a configured root such as India PKI (CCA)." },
    { t: "Not proven", d: "Whether the signer was entitled to issue the document. That stays a human judgement." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {points.map((p) => (
        <div key={p.t} className="rounded-card border border-line bg-surface/70 p-4">
          <div className="text-sm font-semibold text-ink">{p.t}</div>
          <p className="mt-1 text-sm text-ink-3 text-pretty">{p.d}</p>
        </div>
      ))}
    </div>
  );
}

export default function VerifyPdfPage() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [selected, setSelected] = useState<string | null>(null);
  const [reading, setReading] = useState<(Reading & { id: string; token: string }) | null>(null);
  const lastFile = useRef<File | null>(null);
  const hashJob = useRef<Promise<string> | null>(null);

  const mut = useMutation({
    mutationFn: (f: File) => api.verifyPdf(f),
    onSuccess: async (result, file) => {
      const clientHash = await (hashJob.current ?? Promise.resolve("")).catch(() => "");
      const entry: HistoryEntry = { id: `${Date.now().toString(36)}`, at: new Date().toISOString(), size: file.size, clientHash, result };
      setReading((r) => (r ? { ...r, id: entry.id, result } : r));
      setSelected(entry.id);
      setHistory((h) => {
        const next = [entry, ...h].slice(0, 12);
        saveHistory(next);
        return next;
      });
    },
    onError: () => setReading((r) => (r ? { ...r, failed: true } : r)),
  });

  function start(file: File) {
    lastFile.current = file;
    setSelected(null);
    setReading({ id: "pending", token: `t${Date.now().toString(36)}`, name: file.name, size: file.size, clientHash: null, result: null, failed: false });
    const job = sha256Hex(file).catch(() => "");
    hashJob.current = job;
    void job.then((h) => setReading((r) => (r && r.name === file.name && r.clientHash === null ? { ...r, clientHash: h } : r)));
    mut.mutate(file);
  }

  const fromHistory = selected ? history.find((h) => h.id === selected) : undefined;
  const view: (Reading & { id: string; token: string }) | null =
    fromHistory && (!reading || reading.id !== fromHistory.id)
      ? { id: fromHistory.id, token: fromHistory.id, name: fromHistory.result.filename, size: fromHistory.size, clientHash: fromHistory.clientHash, result: fromHistory.result, failed: false }
      : reading;

  return (
    <div>
      <PageHeader
        eyebrow="Review tool"
        title="Verify a PDF"
        description="Check a PDF's embedded signatures against the configured trust anchors and read its structure, without attaching it to an application."
        meta={
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <ShieldCheck className="size-3.5 text-verified-dot" aria-hidden /> Trust anchors: India PKI (CCA) roots and the demo root
            for synthetic documents
          </span>
        }
      />
      <div className={cn("grid min-w-0 items-start gap-6", history.length > 0 && "xl:grid-cols-[minmax(0,1fr)_288px]")}>
        <div className="min-w-0 space-y-6">
          <DropZone onFile={start} busy={mut.isPending} compact={!!view} />
          {!view && <Intro />}
          {!view && (
            <Link
              to="/scan"
              className="group flex items-center gap-3 rounded-card border border-dashed border-line-2 px-4 py-3 text-sm transition-colors duration-200 hover:border-brand-300 hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <QrCode className="size-4 shrink-0 text-brand-ink" aria-hidden />
              <span className="min-w-0 flex-1 text-ink-2">
                <b className="font-semibold text-ink">Checking a printed certificate?</b> The public QR scanner reads an issuer-signed QR from a phone photo.
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-ink-4 group-hover:text-brand-ink" aria-hidden />
            </Link>
          )}
          {view && (
            <motion.div key={view.token} className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: dur.ui }}>
              <ReadingCard
                reading={view}
                onDismiss={() => {
                  setReading(null);
                  setSelected(null);
                  mut.reset();
                }}
              />
              {view.failed && mut.error && (
                <ErrorState
                  error={mut.error}
                  title="The PDF could not be checked"
                  onRetry={lastFile.current ? () => start(lastFile.current as File) : undefined}
                />
              )}
              {view.result && <Results data={view.result} />}
            </motion.div>
          )}
        </div>
        {history.length > 0 && (
          <HistoryList
            items={history}
            selected={selected}
            onSelect={(id) => {
              if (!mut.isPending) setSelected(id);
            }}
            onClear={() => {
              setHistory([]);
              saveHistory([]);
            }}
          />
        )}
      </div>
    </div>
  );
}
