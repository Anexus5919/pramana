import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtBytes, fmtMs, pluralize } from "../../../lib/format";
import { Button, buttonStyles, Callout, Checkbox, Code, DescriptionList, Dialog, Digest, ErrorState, useToast } from "../../../ui2";
import { useInvalidateApp } from "../data";
import { officerApi, type PackFile, type PackResult } from "./officerApi";

const CONTENTS: { name: string; what: string }[] = [
  { name: "report.pdf", what: "Summary, every finding with severity, evidence class, decisions and reasons, page crops with the region outlined, verification results and cited rules." },
  { name: "manifest.json", what: "SHA-256 of every file and of each submitted document, run IDs, ruleset hash, input and report digests." },
  { name: "audit/", what: "This application's audit events with chain hashes and the signed checkpoint over the last of them." },
  { name: "signature.json", what: "Ed25519 signature over the manifest with the audit signing key." },
  { name: "VERIFY.txt, verify_pack.py", what: "An offline checker that needs only Python and the cryptography package." },
];

function fileRole(f: PackFile): string {
  if (f.name.startsWith("documents/")) return "Original document";
  if (f.name.startsWith("audit/")) return "Audit extract";
  if (f.name.startsWith("data/")) return "Data";
  return { "manifest.json": "Manifest", "signature.json": "Signature", "report.pdf": "Report", "VERIFY.txt": "Instructions", "verify_pack.py": "Checker" }[f.name] ?? "File";
}

function Result({ r }: { r: PackResult }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-medium text-ink">{r.filename}</div>
          <p className="mt-0.5 text-sm text-ink-3">
            {fmtBytes(r.size)}, {pluralize(r.files.length, "file")}, built in {fmtMs(r.total_ms)}.{" "}
            {r.include_originals ? "Original files included." : "Original files not included."}
          </p>
        </div>
        <a href={r.download_url} download className={buttonStyles("primary", "md")}>
          <Download aria-hidden /> Download ZIP
        </a>
      </div>
      <DescriptionList
        labelWidth={148}
        items={[
          { label: "Manifest SHA-256", value: <Digest value={r.manifest_sha256} label="Manifest SHA-256" head={16} tail={10} /> },
          { label: "ZIP SHA-256", value: <Digest value={r.zip_sha256} label="ZIP SHA-256" head={16} tail={10} /> },
          { label: "Audit public key", value: <Digest value={r.public_key} label="Audit public key" head={16} tail={8} /> },
          { label: "Contents", value: `${pluralize(r.findings, "finding")}, ${pluralize(r.audit_events, "audit event")}` },
          { label: "Checkpoint", value: `Signs audit event ${r.checkpoint_seq}, the export itself` },
        ]}
      />
      <details className="group rounded-card border border-line">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink select-none hover:bg-surface-2">Files ({r.files.length})</summary>
        <ul className="max-h-64 divide-y divide-line overflow-y-auto border-t border-line">
          {r.files.map((f) => (
            <li key={f.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_128px_80px]">
              <Code className="min-w-0 truncate text-xs">{f.name}</Code>
              <span className="hidden text-xs text-ink-3 sm:block">{fileRole(f)}</span>
              <span className="text-right text-xs text-ink-3 tabular-nums">{fmtBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-ink-3">
        Check it offline: unzip, then run <Code className="text-xs">python verify_pack.py .</Code> in the pack folder. Changing any file makes it fail.
      </p>
    </div>
  );
}

/** Builds one signed ZIP of the application for an auditor; every export is written to the audit chain. */
export function EvidencePackDialog({ appId, open, onClose }: { appId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateApp(appId);
  const [originals, setOriginals] = useState(false);
  const build = useMutation({
    mutationFn: () => officerApi.exportPack(appId, originals),
    onSuccess: (r) => {
      invalidate();
      toast.success("Evidence pack ready", `Manifest signed and the export recorded in the audit trail (${pluralize(r.files.length, "file")}).`);
    },
  });

  useEffect(() => {
    if (open) {
      build.reset();
      setOriginals(false);
    }
    // reset only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Export evidence pack"
      description="One signed ZIP for this application that an auditor can check offline. Every export is written to the audit trail."
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
            <Button variant="primary" onClick={() => build.mutate()} loading={build.isPending}>
              {build.isPending ? "Building" : "Build evidence pack"}
            </Button>
          </>
        )
      }
    >
      {build.data ? (
        <Result r={build.data} />
      ) : (
        <div className="space-y-5">
          {build.error ? <ErrorState error={build.error} title="The pack was not built" onRetry={() => build.mutate()} /> : null}
          <ul className="divide-y divide-line">
            {CONTENTS.map((c) => (
              <li key={c.name} className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]">
                <Code className="text-sm">{c.name}</Code>
                <span className="text-sm text-ink-3 text-pretty">{c.what}</span>
              </li>
            ))}
          </ul>
          <Checkbox
            checked={originals}
            onChange={setOriginals}
            disabled={build.isPending}
            label="Include original files"
            description="Contains personal data. Share only with authorised officials."
          />
          {build.isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-ink-2">
              <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-ink-3 motion-reduce:animate-none" />
              Rendering the report with page crops, extracting the audit trail and signing the manifest.
            </p>
          )}
          <Callout tone="neutral">
            A pack that verifies shows nothing was changed after export. It does not make any finding more certain; findings stay preliminary indicators.
          </Callout>
        </div>
      )}
    </Dialog>
  );
}
