import { useMutation } from "@tanstack/react-query";
import { FileSearch, FileUp, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api";
import { fmtBytes, fmtDateTime, pluralize } from "../../lib/format";
import type { ExtractedField } from "../../types";
import {
  Button,
  Callout,
  Code,
  DescriptionList,
  Digest,
  EmptyState,
  MetaList,
  Page,
  PageHeader,
  Panel,
  PanelDivider,
  cn,
} from "../../ui2";
import { DocViewer, type Focus } from "../application/viewer/DocViewer";
import { DropZone } from "../verify/DropZone";
import { sha256Hex } from "../verify/pdf";
import { ACCEPT, analyseApi, type Analysis } from "./analyseApi";
import { FieldsSection, IndicatorsSection, InstructionsSection, IntakeSection, QrSection, RegistrySection, TextSection, TypeSection } from "./DocumentSections";
import { CannotKnowSection, FileStructureSection, SignaturesSection, TimeMachineSection } from "./FileSections";
import { anchorId, ReportPanel, StepLine } from "./parts";
import { CaptureSection, CredentialsSection, PhotoStage, RoomSection } from "./PhotoSections";
import { isPdf, PENDING_STEPS, reportIndex, STEP_LABEL, type IndexEntry } from "./summary";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

interface Entry {
  a: Analysis;
  clientHash: string;
  at: string;
}

// Results of this browser session; the bytes behind them live on the server for 15 minutes only
let SESSION: Entry[] = [];

const SAMPLES = [
  { f: "fixtures/real/egazette_2025_260000.pdf", d: "A real e-Gazette notification. The signature chains to CCA India 2022; Hindi lines are read by OCR." },
  { f: "fixtures/out/A7/fire_noc.pdf", d: "Three revisions. The time machine shows a date changed after the file was signed." },
  { f: "fixtures/out/A1/lab_photo.jpg", d: "A lab photo with capture time, geotag, Content Credentials and room detection." },
];

function Intro() {
  return (
    <EmptyState
      icon={<FileSearch />}
      title="No file analysed yet"
      description="Choose a PDF or photo to run every check Pramana runs on an application document. These sample files are in the repository:"
      action={
        <div className="space-y-4">
          <ul className="space-y-3 text-left">
            {SAMPLES.map((s) => (
              <li key={s.f}>
                <Code className="break-all">{s.f}</Code>
                <p className="text-xs text-ink-3 text-pretty">{s.d}</p>
              </li>
            ))}
          </ul>
          <Link to="/scan" className="inline-block rounded text-sm text-ink underline-offset-2 hover:underline">
            Holding a printed certificate? Scan its QR from a phone photo
          </Link>
        </div>
      }
    />
  );
}

function Pending({ name, size, clientHash }: { name: string; size: number; clientHash: string | null }) {
  return (
    <Callout tone="info" role="status" icon={<Loader2 className="animate-spin" />} title={`Analysing ${name}`}>
      {fmtBytes(size)}.{" "}
      {clientHash === null
        ? "Computing the SHA-256 in your browser while the server reads the file."
        : `The server is running ${PENDING_STEPS.map((s) => STEP_LABEL[s].charAt(0).toLowerCase() + STEP_LABEL[s].slice(1)).join(", ")}. Scanned and Hindi pages take a few seconds each for OCR.`}
    </Callout>
  );
}

function SessionList({ items, current, busy, onSelect }: { items: Entry[]; current: string | null; busy: boolean; onSelect: (t: string) => void }) {
  return (
    <ul className="divide-y divide-line" aria-label="Files analysed in this session">
      {items.map((e) => {
        const on = e.a.token === current;
        return (
          <li key={e.a.token} aria-current={on || undefined} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink" title={e.a.filename}>
                {e.a.filename}
              </div>
              <div className="text-xs text-ink-3">
                <MetaList items={[fmtBytes(e.a.size_bytes), pluralize(e.a.page_count, "page"), `Analysed at ${timeFmt.format(new Date(e.at))}`]} />
              </div>
            </div>
            {on ? (
              <span className="shrink-0 text-xs text-ink-3">Shown below</span>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => onSelect(e.a.token)} aria-label={`Open the report for ${e.a.filename}`}>
                Open
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ReportHeader({ e, onForget, forgetting }: { e: Entry; onForget: () => void; forgetting: boolean }) {
  const a = e.a;
  const matches = !!e.clientHash && e.clientHash === a.sha256;
  const expired = Date.now() > Date.parse(a.expires_at);
  return (
    <ReportPanel
      id="report"
      title="Report"
      actions={
        <Button size="sm" leadingIcon={<Trash2 />} onClick={onForget} loading={forgetting}>
          Forget this file now
        </Button>
      }
    >
      <DescriptionList
        layout="stacked"
        columns={4}
        items={[
          { label: "File", value: <span className="break-all">{a.filename}</span> },
          { label: "Size", value: fmtBytes(a.size_bytes) },
          { label: "Pages", value: a.page_count },
          { label: "Ruleset", value: <Code>{`${a.ruleset.id}@${a.ruleset.version}`}</Code> },
          { label: "SHA-256", value: <Digest value={a.sha256} head={10} tail={8} /> },
          {
            label: "Hash matches your browser",
            value: !e.clientHash ? "Not computed in this browser" : matches ? "Yes" : <span className="font-medium text-mismatch-fg">No, the hashes differ</span>,
          },
          {
            label: "Kept until",
            value: expired ? "Released from memory" : timeFmt.format(new Date(a.expires_at)),
            hint: expired
              ? `Released at ${fmtDateTime(a.expires_at)}. Drop the file again to see its pages and revisions.`
              : "Then the page images are released",
          },
        ]}
      />
      <PanelDivider label="Server time by stage" />
      <StepLine steps={a.steps} />
    </ReportPanel>
  );
}

/** Which index entry is in view, for aria-current in the in-page index. */
function useActiveSection(entries: IndexEntry[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = entries.map((e) => e.id).join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = key
      .split("|")
      .map((id) => document.getElementById(anchorId(id)))
      .filter((el): el is HTMLElement => !!el);
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (list) => {
        for (const en of list) seen.set(en.target.id, en.isIntersecting);
        const first = els.find((el) => seen.get(el.id));
        if (first) setActive(first.id.replace(/^an-/, ""));
      },
      { rootMargin: "-80px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return active;
}

function ReportIndex({ entries }: { entries: IndexEntry[] }) {
  const active = useActiveSection(entries);
  return (
    <nav aria-label="On this page" className="sticky top-20 hidden self-start 2xl:block">
      <div className="mb-2 text-xs font-medium text-ink-3">On this page</div>
      <ul className="border-l border-line">
        {entries.map((e) => {
          const on = active === e.id;
          return (
            <li key={e.id}>
              <a
                href={`#${anchorId(e.id)}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1 pr-2 pl-3 text-sm transition-colors duration-150",
                  on ? "border-brand-solid font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink",
                )}
              >
                {e.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Report({ e, onForget, forgetting }: { e: Entry; onForget: () => void; forgetting: boolean }) {
  const a = e.a;
  const pdf = isPdf(a);
  const [page, setPage] = useState(1);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const index = useMemo(() => reportIndex(a), [a]);

  const show = useCallback((f: Focus) => {
    setPage(f.page);
    setFocus({ ...f });
    // The viewer is sticky only beside the right-hand panels; from anywhere else, bring it into view
    const r = viewer.current?.getBoundingClientRect();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (r && (r.top < 0 || r.top > window.innerHeight * 0.5)) viewer.current!.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);
  const locate = useCallback((f: ExtractedField) => f.page && f.bbox && show({ page: f.page, bbox: f.bbox, label: f.name.replace(/_/g, " ") }), [show]);

  return (
    <div className="grid min-w-0 items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0 space-y-6">
        <ReportHeader e={e} onForget={onForget} forgetting={forgetting} />
        {a.incomplete && (
          <Callout tone="warning" title="Reading stopped">
            {a.incomplete.reason} Text, fields, QR codes and structure forensics are missing below. Intake, digital signatures and revisions do not depend on the text
            and still ran.
          </Callout>
        )}

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div ref={viewer} className="min-w-0 scroll-mt-20 xl:sticky xl:top-20">
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
          <div className="min-w-0 space-y-6">
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
      </div>
      <ReportIndex entries={index} />
    </div>
  );
}

export default function AnalysePage() {
  const [items, setItems] = useState<Entry[]>(() => SESSION);
  const [current, setCurrent] = useState<string | null>(() => SESSION[0]?.a.token ?? null);
  const [pending, setPending] = useState<{ name: string; size: number; clientHash: string | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);
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
    onError: () => setPending(null),
  });

  const forget = useMutation({
    mutationFn: (token: string) => analyseApi.forget(token),
    onSettled: (_d, _e, token) => {
      const next = SESSION.filter((x) => x.a.token !== token);
      save(next);
      setCurrent(next[0]?.a.token ?? null);
    },
  });

  const forgetAll = useMutation({
    mutationFn: () => Promise.allSettled(SESSION.map((x) => analyseApi.forget(x.a.token))),
    onSettled: () => {
      save([]);
      setCurrent(null);
    },
  });

  function start(file: File) {
    setPending({ name: file.name, size: file.size, clientHash: null });
    const job = sha256Hex(file).catch(() => "");
    hashJob.current = job;
    void job.then((h) => setPending((p) => (p && p.name === file.name ? { ...p, clientHash: h } : p)));
    mut.mutate(file);
  }

  const entry = items.find((x) => x.a.token === current) ?? null;
  const busy = mut.isPending || forgetAll.isPending;
  const choose = () => input.current?.click();

  return (
    <Page>
      <PageHeader
        title="Analyse a document"
        context="Check one PDF or photo without filing it. Nothing is stored after you forget it."
        menu={
          items.length > 0
            ? [{ id: "forget-all", label: "Forget all files", description: `Release ${pluralize(items.length, "file")} from server memory now`, icon: <Trash2 />, danger: true, onSelect: () => forgetAll.mutate() }]
            : undefined
        }
        primary={
          <Button variant="primary" leadingIcon={<FileUp />} onClick={choose} disabled={busy}>
            Choose a file
          </Button>
        }
      />

      <Panel title="File">
        <DropZone ref={input} onFile={start} busy={busy} accept={ACCEPT} hint="Up to 15 MB. Held in server memory for 15 minutes; the check is audited by its SHA-256." />
        {items.length > 0 && (
          <>
            <PanelDivider label="This session" />
            <SessionList items={items} current={current} busy={busy} onSelect={setCurrent} />
          </>
        )}
      </Panel>

      {mut.isPending && pending && <Pending {...pending} />}
      {mut.isError && (
        <Callout
          tone="danger"
          role="alert"
          title={entry ? "The last file could not be analysed" : "The file could not be analysed"}
          action={
            <Button size="sm" onClick={choose}>
              Try another file
            </Button>
          }
        >
          {errorMessage(mut.error)}
        </Callout>
      )}
      {!mut.isPending && entry && <Report key={entry.a.token} e={entry} onForget={() => forget.mutate(entry.a.token)} forgetting={forget.isPending} />}
      {!mut.isPending && !entry && !mut.isError && <Intro />}
    </Page>
  );
}
