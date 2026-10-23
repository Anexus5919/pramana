import { useMutation } from "@tanstack/react-query";
import { Download, FileArchive, FileCheck2, FileJson, FileText, KeyRound, ScrollText, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { fmtBytes, fmtMs, pluralize } from "../../../lib/format";
import { Tag } from "../../../ui/Badge";
import { BlockProgress, type BlockStage } from "../../../ui/Blocks";
import { BlockLoader, Button, buttonClasses } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Digest } from "../../../ui/Digest";
import { Checkbox } from "../../../ui/Field";
import { dur, ease, fadeUp, stagger } from "../../../ui/motion";
import { ErrorState } from "../../../ui/States";
import { useToast } from "../../../ui/Toast";
import { useInvalidateApp } from "../data";
import { officerApi, type PackFile, type PackResult } from "./officerApi";

const STAGE_LABEL: Record<string, string> = {
  collect: "Collect",
  audit_extract: "Audit extract",
  report: "Report PDF",
  data_files: "Data files",
  manifest_and_signature: "Manifest and signature",
  zip: "ZIP",
};

const CONTENTS: { icon: ReactNode; name: string; what: string }[] = [
  { icon: <FileText />, name: "report.pdf", what: "Summary, every finding with severity, evidence class, decisions and reasons, page crops with the region outlined, verification results, cited rules." },
  { icon: <FileJson />, name: "manifest.json", what: "SHA-256 of every file and of each submitted document, run ids, ruleset hash, input and report digests." },
  { icon: <ScrollText />, name: "audit/", what: "This application's audit events with chain hashes and the Ed25519 checkpoint that signs the last of them." },
  { icon: <KeyRound />, name: "signature.json", what: "Ed25519 signature over the manifest with the audit signing key." },
  { icon: <FileCheck2 />, name: "VERIFY.txt, verify_pack.py", what: "Offline checker using the Python standard library and cryptography." },
];

function role(f: PackFile): string {
  if (f.name.startsWith("documents/")) return "Original document";
  if (f.name.startsWith("audit/")) return "Audit extract";
  if (f.name.startsWith("data/")) return "Data";
  return { "manifest.json": "Manifest", "signature.json": "Signature", "report.pdf": "Report", "VERIFY.txt": "Instructions", "verify_pack.py": "Checker" }[f.name] ?? "File";
}

function Elapsed() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(t);
  }, []);
  return <span className="font-mono text-xs text-ink-3 tabular">{s} s</span>;
}

function Result({ r }: { r: PackResult }) {
  const stages: BlockStage[] = r.stages.map((s) => ({ key: s.stage, label: STAGE_LABEL[s.stage] ?? s.stage, state: "done", ms: s.ms }));
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={fadeUp}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="eyebrow">Built in {fmtMs(r.total_ms)}</span>
          <span className="text-xs text-ink-3">real stage timings from the server</span>
        </div>
        <BlockProgress stages={stages} showLabels size="sm" />
      </motion.div>
      <motion.section variants={fadeUp} aria-label="Pack result" className="rounded-card border border-line bg-surface-2/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-md font-semibold tracking-title text-ink">
              <FileArchive aria-hidden className="size-4 text-brand-500" /> {r.filename}
            </h3>
            <p className="mt-0.5 text-sm text-ink-3">
              {fmtBytes(r.size)}, {pluralize(r.files.length, "file")}, {pluralize(r.findings, "finding")}, {pluralize(r.audit_events, "audit event")}
              {r.include_originals ? ", originals included" : ", originals not included"}
            </p>
          </div>
          <a href={r.download_url} download className={buttonClasses("primary", "md")}>
            <Download aria-hidden /> Download ZIP
          </a>
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[180px_minmax(0,1fr)]">
          <dt className="text-ink-3">Manifest SHA-256</dt>
          <dd className="min-w-0">
            <Digest value={r.manifest_sha256} label="Manifest SHA-256" head={16} tail={10} />
          </dd>
          <dt className="text-ink-3">ZIP SHA-256</dt>
          <dd className="min-w-0">
            <Digest value={r.zip_sha256} label="ZIP SHA-256" head={16} tail={10} />
          </dd>
          <dt className="text-ink-3">Audit public key</dt>
          <dd className="min-w-0">
            <Digest value={r.public_key} label="Audit public key" head={16} tail={8} />
          </dd>
          <dt className="text-ink-3">Checkpoint</dt>
          <dd className="text-ink-2">signs audit event {r.checkpoint_seq}, the export itself</dd>
        </dl>
      </motion.section>
      <motion.div variants={fadeUp}>
        <div className="mb-2 eyebrow">Contents</div>
        <ul className="max-h-[260px] divide-y divide-line overflow-y-auto rounded-[12px] border border-line">
          {r.files.map((f) => (
            <li key={f.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_120px_90px_auto]">
              <span className="min-w-0 truncate font-mono text-[12.5px] text-ink">{f.name}</span>
              <span className="hidden text-xs text-ink-3 sm:block">{role(f)}</span>
              <span className="hidden text-right font-mono text-xs text-ink-3 tabular sm:block">{fmtBytes(f.size)}</span>
              <Digest value={f.sha256} label={`${f.name} SHA-256`} head={6} tail={4} copy={false} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-3">
          Check it offline: unzip, then run <code className="rounded-[4px] bg-surface-2 px-1 font-mono">python verify_pack.py .</code> in the pack folder. Changing any file makes it fail.
        </p>
      </motion.div>
    </motion.div>
  );
}

export function EvidencePackDialog({ appId, open, onClose }: { appId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateApp(appId);
  const [originals, setOriginals] = useState(false);
  const build = useMutation({
    mutationFn: () => officerApi.exportPack(appId, originals),
    onSuccess: (r) => {
      invalidate();
      toast.success("Evidence pack ready", `Manifest signed and the export recorded in the audit chain (${pluralize(r.files.length, "file")}).`);
    },
  });

  useEffect(() => {
    if (open) {
      build.reset();
      setOriginals(false);
    }
    // reset only when the dialog opens
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Evidence pack"
      description="One signed ZIP for this application that an auditor can check offline. Officer only; every export is written to the audit chain."
      footer={
        build.data ? (
          <>
            <Button variant="ghost" onClick={() => build.reset()}>
              Build another
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={build.isPending}>
              Cancel
            </Button>
            <Button leadingIcon={<FileArchive />} onClick={() => build.mutate()} loading={build.isPending}>
              {build.isPending ? "Building" : "Build evidence pack"}
            </Button>
          </>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {build.data ? (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui }}>
            <Result r={build.data} />
          </motion.div>
        ) : (
          <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.ui, ease: ease.out }} className="space-y-4">
            {build.error && <ErrorState compact error={build.error} title="The pack was not built" />}
            <ul className="space-y-2.5">
              {CONTENTS.map((c) => (
                <li key={c.name} className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-brand-ink [&_svg]:size-4">{c.icon}</span>
                  <span className="min-w-0 text-sm">
                    <span className="font-mono text-[12.5px] font-medium text-ink">{c.name}</span>
                    <span className="block text-ink-3 text-pretty">{c.what}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="rounded-card border border-line p-3.5">
              <Checkbox
                checked={originals}
                onChange={setOriginals}
                disabled={build.isPending}
                label={
                  <span className="inline-flex items-center gap-2">
                    Include the original submitted documents <Tag variant="neutral">Sensitive</Tag>
                  </span>
                }
                description="Off by default. Their SHA-256 digests are in the manifest either way, so an auditor can match files obtained separately."
              />
            </div>
            <AnimatePresence initial={false}>
              {build.isPending && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-control bg-brand-soft px-3 py-2.5 text-sm text-ink-2"
                >
                  <BlockLoader className="text-brand-500" />
                  <span className="flex-1">Rendering the report with page crops, extracting the audit chain and signing the manifest.</span>
                  <Elapsed />
                </motion.div>
              )}
            </AnimatePresence>
            <p className="flex items-start gap-2 text-xs text-ink-3">
              <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              A pack that verifies shows nothing was changed after export. It does not make any finding more certain; findings stay preliminary indicators.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
