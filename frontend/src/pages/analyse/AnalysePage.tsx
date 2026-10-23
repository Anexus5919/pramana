import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Clock, FileImage, FileText, Fingerprint, QrCode, ScanText, ShieldCheck, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmtBytes, fmtDateTime, pluralize, shortHash } from "../../lib/format";
import { verificationMeta } from "../../lib/labels";
import type { ExtractedField } from "../../types";
import { Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { BlockLoader, Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Digest } from "../../ui/Digest";
import { PageHeader } from "../../ui/Layout";
import { dur, ease, fadeUp, spring, stagger } from "../../ui/motion";
import { ErrorState } from "../../ui/States";
import { CautionNote } from "../application/parts";
import { DocViewer, type Focus } from "../application/viewer/DocViewer";
import { DropZone, type DropZoneCopy } from "../verify/DropZone";
import { sha256Hex } from "../verify/pdf";
import { ACCEPT, analyseApi, type Analysis } from "./analyseApi";
import { FieldsSection, IndicatorsSection, InstructionsSection, IntakeSection, QrSection, RegistrySection, TextSection, TypeSection } from "./DocumentSections";
import { CannotKnowSection, FileStructureSection, SignaturesSection, TimeMachineSection } from "./FileSections";
import { Overview } from "./Overview";
import { FlashContext, StepTimeline } from "./parts";
import { CaptureSection, CredentialsSection, PhotoStage, RoomSection } from "./PhotoSections";
import { isPdf, STEP_LABEL, tiles } from "./summary";

const COPY: DropZoneCopy = {
  accept: ACCEPT,
  kind: "FILE",
  title: "Drop a PDF or photo to analyse it",
  dragging: "Release to analyse this file",
  hint: "Or click anywhere here to choose one. PDF, JPG or PNG, up to 15 MB. Nothing is filed: the bytes stay in server memory for 15 minutes for the page viewer, and the check is recorded in the audit log by its SHA-256.",
  compactTitle: "Analyse another file",
  compactHint: "Drop a PDF, JPG or PNG here or click to choose. Earlier results stay listed for this session.",
  preview: "Drop to run every per-document check",
  ariaLabel: "Choose a PDF, JPG or PNG to analyse, or drop one here",
  checks: [
    { icon: Fingerprint, label: "Fingerprint", hint: "SHA-256 in your browser" },
    { icon: ScanText, label: "Read", hint: "Text layer or OCR, Hindi too" },
    { icon: ShieldCheck, label: "Verify", hint: "Signatures, QR, structure" },
  ],
};

const PENDING_STEPS = ["read", "extract", "forensics", "qr", "signatures", "signed_qr", "registry", "revisions"];
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

interface Entry {
  a: Analysis;
  clientHash: string;
  at: string;
}

// Results of this browser session; the bytes behind them live on the server for 15 minutes only
let SESSION: Entry[] = [];

function Intro() {
  const points = [
    { t: "The same pipeline", d: "Text, OCR, fields, signatures, signed QR, revisions and forensics run through the functions an application document goes through." },
    { t: "Nothing is filed", d: "The file belongs to no application. Only an audit event with its SHA-256 is kept; page images expire from memory." },
    { t: "Honest about limits", d: "Rules, declared values and links to other applications need an application, and the page says so." },
  ];
  const samples = [
    { f: "fixtures/real/egazette_2025_260000.pdf", d: "A real Government of India e-Gazette notification. The signature chains to CCA India 2022, offline; 28 Hindi lines are read by OCR." },
    { f: "fixtures/out/A7/fire_noc.pdf", d: "A7's fire NOC. Three revisions: the time machine shows a date drawn over the signed one, with overlay, white box and font indicators." },
    { f: "fixtures/out/A2/occupancy_certificate.pdf", d: "A bilingual occupancy certificate with a broken Hindi text layer, read by the Devanagari recogniser." },
    { f: "fixtures/out/A1/lab_photo.jpg", d: "A lab photo: EXIF capture time and geotag, Content Credentials against the DEMO list, and room detection with boxes." },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {points.map((p) => (
          <div key={p.t} className="rounded-card border border-line bg-surface/70 p-4">
            <div className="text-sm font-semibold text-ink">{p.t}</div>
            <p className="mt-1 text-sm text-ink-3 text-pretty">{p.d}</p>
          </div>
        ))}
      </div>
      <div className="rounded-card border border-line bg-surface/70 p-4">
        <div className="eyebrow mb-2">Files worth trying</div>
        <ul className="space-y-2.5">
          {samples.map((s) => (
            <li key={s.f} className="text-sm">
              <span className="font-mono text-[12.5px] break-all text-ink">{s.f}</span>
              <p className="text-ink-3 text-pretty">{s.d}</p>
            </li>
          ))}
        </ul>
        <Link
          to="/scan"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <QrCode aria-hidden className="size-4" /> Holding a printed certificate? Scan its QR from a phone photo <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Pending({ name, size, clientHash }: { name: string; size: number; clientHash: string | null }) {
  return (
    <motion.section
      aria-label={`Analysing ${name}`}
      aria-busy
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className="rounded-card border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
          <BlockLoader />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink">{name}</div>
          <div className="mt-0.5 text-xs text-ink-3">{fmtBytes(size)}. Reading and checking on the server; scanned and Hindi pages take a few seconds each for OCR.</div>
          <div className="mt-2 text-xs text-ink-3">
            {clientHash === null ? (
              "Computing SHA-256 in your browser"
            ) : clientHash ? (
              <span className="font-mono text-ink-2">SHA-256 {shortHash(clientHash, 24)}</span>
            ) : (
              "This browser could not compute the hash"
            )}
          </div>
        </div>
      </div>
      <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Stages that run">
        {PENDING_STEPS.map((s) => (
          <li key={s} className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-xs text-ink-3">
            {STEP_LABEL[s]}
          </li>
        ))}
      </ol>
    </motion.section>
  );
}

function ReadingHeader({ e, onForget, forgetting }: { e: Entry; onForget: () => void; forgetting: boolean }) {
  const a = e.a;
  const matches = !!e.clientHash && e.clientHash === a.sha256;
  const expired = Date.now() > Date.parse(a.expires_at);
  const Icon = isPdf(a) ? FileText : FileImage;
  return (
    <section aria-label={`Analysis of ${a.filename}`} className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        <span className="relative flex h-14 w-11 shrink-0 items-end justify-center rounded-[8px] border border-line-2 bg-surface-2 pb-1.5">
          <Icon className="absolute top-2 size-4 text-ink-3" aria-hidden />
          <span className={cn("rounded-[4px] px-1 font-mono text-[9px] font-semibold text-white", isPdf(a) ? "bg-mismatch-dot" : "bg-ev-3")}>{isPdf(a) ? "PDF" : a.mime === "image/png" ? "PNG" : "JPG"}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold tracking-title text-ink" title={a.filename}>
            {a.filename}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {fmtBytes(a.size_bytes)}, {pluralize(a.page_count, "page")}, ruleset {a.ruleset.id} v{a.ruleset.version}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Digest value={a.sha256} label="SHA-256" head={10} tail={8} />
            {e.clientHash ? (
              <span className={cn("inline-flex items-center gap-1 font-medium", matches ? "text-verified-fg" : "text-mismatch-fg")}>
                <StatusCube tone={matches ? "verified" : "mismatch"} size={11} />
                {matches ? "Matches the hash your browser computed" : "Differs from your browser's hash"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={cn("inline-flex items-center gap-1 text-xs", expired ? "text-manual-fg" : "text-ink-3")}>
            <Clock aria-hidden className="size-3.5" />
            {expired ? "Page images released" : `Held in memory until ${timeFmt.format(new Date(a.expires_at))}`}
          </span>
          <Button size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={onForget} loading={forgetting}>
            Forget this file now
          </Button>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <div className="eyebrow mb-2">Where the server's time went</div>
        <StepTimeline steps={a.steps} />
      </div>
      {expired && (
        <CautionNote className="mt-3" title="Expired">
          The file was released from memory at {fmtDateTime(a.expires_at)}. The findings below stay readable; drop the file again to see its pages and revisions.
        </CautionNote>
      )}
    </section>
  );
}

function SessionList({ items, current, onSelect }: { items: Entry[]; current: string | null; onSelect: (t: string) => void }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="Analysed in this session" className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="eyebrow mr-1">This session</span>
      {items.map((e) => {
        const on = e.a.token === current;
        const status = e.a.signatures.find((s) => s.response?.signer)?.status ?? null;
        return (
          <button
            key={e.a.token}
            type="button"
            onClick={() => onSelect(e.a.token)}
            aria-current={on || undefined}
            className={cn(
              "relative inline-flex h-8 max-w-[260px] items-center gap-2 rounded-full border px-3 text-xs transition-colors duration-200",
              on ? "border-brand-300 text-ink" : "border-line bg-surface text-ink-2 hover:border-brand-200",
            )}
          >
            {on && <motion.span layoutId="analyse-session-active" transition={spring.snappy} aria-hidden className="absolute inset-0 rounded-full bg-brand-soft" />}
            <StatusCube status={status ?? "not_checked"} size={12} className="relative" />
            <span className="relative truncate font-medium">{e.a.filename}</span>
            <span className="relative shrink-0 text-ink-4">{timeFmt.format(new Date(e.at))}</span>
            <span className="sr-only">{status ? verificationMeta[status]?.label : "no signature"}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Report({ e, onForget, forgetting }: { e: Entry; onForget: () => void; forgetting: boolean }) {
  const a = e.a;
  const pdf = isPdf(a);
  const reduce = useReducedMotion();
  const [page, setPage] = useState(1);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const items = useMemo(() => tiles(a), [a]);

  const show = useCallback(
    (f: Focus) => {
      setPage(f.page);
      setFocus({ ...f });
      // Below the two-column layout the viewer sits above the sections; bring it into view
      if (viewer.current && window.innerWidth < 1280) viewer.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    },
    [reduce],
  );
  const locate = useCallback((f: ExtractedField) => f.page && f.bbox && show({ page: f.page, bbox: f.bbox, label: f.name.replace(/_/g, " ") }), [show]);
  const jump = useCallback(
    (id: string) => {
      const target = document.getElementById(`an-${id}`) ?? document.getElementById(id === "revisions" ? "an-file" : "an-structure");
      target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      setFlash((f) => ({ id: target?.id.replace(/^an-/, "") ?? id, n: (f?.n ?? 0) + 1 }));
    },
    [reduce],
  );

  return (
    <FlashContext.Provider value={flash}>
      <motion.div key={a.token} variants={stagger(0.06)} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUp}>
          <ReadingHeader e={e} onForget={onForget} forgetting={forgetting} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <Overview items={items} onJump={jump} />
        </motion.div>

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div ref={viewer} className="min-w-0 scroll-mt-24 xl:sticky xl:top-20">
            {pdf ? (
              <DocViewer
                doc={a.document}
                findings={[]}
                page={page}
                onPage={setPage}
                focus={focus}
                peek={peek}
                pageUrl={(p) => analyseApi.pageUrl(a.token, p)}
                className="h-[min(860px,calc(100dvh-7rem))]"
              />
            ) : (
              <PhotoStage a={a} />
            )}
          </div>
          <div className="min-w-0 space-y-5">
            <IntakeSection a={a} />
            {!pdf && (
              <>
                <CaptureSection a={a} />
                <CredentialsSection a={a} />
                <RoomSection a={a} />
              </>
            )}
            <TextSection a={a} />
            <TypeSection a={a} />
            {(pdf || a.document.fields.length > 0) && <FieldsSection a={a} onLocate={locate} onPeek={setPeek} />}
            <QrSection a={a} onFocus={show} />
            <RegistrySection a={a} />
            <IndicatorsSection a={a} onFocus={show} />
            <InstructionsSection a={a} onFocus={show} />
          </div>
        </div>

        {pdf && <SignaturesSection a={a} />}
        {pdf && <TimeMachineSection a={a} />}
        {pdf && <FileStructureSection a={a} onFocus={show} />}
        <CannotKnowSection a={a} />
      </motion.div>
    </FlashContext.Provider>
  );
}

export default function AnalysePage() {
  const [items, setItems] = useState<Entry[]>(() => SESSION);
  const [current, setCurrent] = useState<string | null>(() => SESSION[0]?.a.token ?? null);
  const [pending, setPending] = useState<{ name: string; size: number; clientHash: string | null } | null>(null);
  const lastFile = useRef<File | null>(null);
  const hashJob = useRef<Promise<string> | null>(null);

  const save = (next: Entry[]) => {
    SESSION = next;
    setItems(next);
  };

  const mut = useMutation({
    mutationFn: (f: File) => analyseApi.analyse(f),
    onSuccess: async (a) => {
      const clientHash = await (hashJob.current ?? Promise.resolve("")).catch(() => "");
      save([{ a, clientHash, at: new Date().toISOString() }, ...SESSION.filter((x) => x.a.token !== a.token)].slice(0, 6));
      setCurrent(a.token);
      setPending(null);
    },
  });

  const forget = useMutation({
    mutationFn: (token: string) => analyseApi.forget(token),
    onSettled: (_d, _e, token) => {
      const next = SESSION.filter((x) => x.a.token !== token);
      save(next);
      setCurrent(next[0]?.a.token ?? null);
    },
  });

  function start(file: File) {
    lastFile.current = file;
    setPending({ name: file.name, size: file.size, clientHash: null });
    const job = sha256Hex(file).catch(() => "");
    hashJob.current = job;
    void job.then((h) => setPending((p) => (p && p.name === file.name ? { ...p, clientHash: h } : p)));
    mut.mutate(file);
  }

  const entry = items.find((x) => x.a.token === current) ?? null;
  const busy = mut.isPending;

  return (
    <div>
      <PageHeader
        eyebrow="Review tool"
        title="Analyse a document"
        description="Drop any PDF, JPG or PNG. Pramana runs every check it would run on an application document, with the same code, and shows what it found and what it cannot know without an application."
        meta={
          <>
            <Tag variant="brand">Not filed</Tag>
            <Tag>Audited by SHA-256</Tag>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
              <ShieldCheck className="size-3.5 text-verified-dot" aria-hidden /> Signatures checked against India PKI (CCA) roots and a DEMO root for synthetic documents
            </span>
          </>
        }
      />
      <div className="min-w-0 space-y-6">
        <DropZone onFile={start} busy={busy} compact={!!entry || busy} copy={COPY} />
        <SessionList items={items} current={current} onSelect={(t) => !busy && setCurrent(t)} />
        <AnimatePresence mode="wait" initial={false}>
          {busy && pending ? (
            <Pending key="pending" {...pending} />
          ) : mut.isError && !entry ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ErrorState error={mut.error} title="The file could not be analysed" onRetry={lastFile.current ? () => start(lastFile.current as File) : undefined} />
            </motion.div>
          ) : entry ? (
            <motion.div key={entry.a.token} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: dur.micro } }} transition={{ duration: dur.ui }}>
              {mut.isError && <ErrorState className="mb-6" error={mut.error} title="The last file could not be analysed" onRetry={lastFile.current ? () => start(lastFile.current as File) : undefined} />}
              <Report e={entry} onForget={() => forget.mutate(entry.a.token)} forgetting={forget.isPending} />
            </motion.div>
          ) : (
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Intro />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
