import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, RefreshCw, Upload } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { qk } from "../../api";
import { useAuth } from "../../auth/session";
import { useDateTimeFormat, useLang, useRelativeTime, type T } from "../../i18n";
import { fmtBytes } from "../../lib/format";
import type { ChecklistSlot, DocumentSummary } from "../../types";
import { Button, Callout, Digest, MetaList, cn } from "../../ui2";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number; name: string; size: number }
  | { kind: "processing"; name: string; size: number }
  | { kind: "rejected"; name: string; detail: string };

function describe(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg?: string }) => d.msg ?? String(d)).join("; ");
  } catch {
    // not JSON
  }
  if (xhr.status === 0) return "The upload did not reach the server. Check the connection and try again.";
  return `${xhr.status} ${xhr.statusText || "Upload failed"}`;
}

class Cancelled extends Error {}

/** The server's rejection reason in words a college office can act on. Other server text is shown as sent. */
function plainReason(detail: string, t: T): string {
  const d = detail.trim();
  const ext = /extension \.?(\w+)/i.exec(d)?.[1]?.toUpperCase();
  if (/does not match extension/i.test(d)) return t("the file is not really a {ext}. Save or scan it again as a PDF, JPG or PNG", { ext: ext ?? "PDF" });
  if (/not allowed/i.test(d)) return t("only PDF, JPG and PNG files are accepted");
  if (/^empty file$/i.test(d)) return t("the file is empty");
  const mb = /exceeds (\d+) ?MB/i.exec(d)?.[1];
  if (mb) return t("the file is larger than {mb} MB. Scan it at a lower resolution and try again", { mb });
  if (/malformed PDF|unreadable|could not be read/i.test(d)) return t("the file could not be opened. It may be damaged; export or scan it again");
  // The two messages this file writes itself are in the dictionary; anything else from the server stays as sent
  return t(d.replace(/\.$/, ""));
}

/** Real upload progress from XMLHttpRequest, so the bar reflects bytes sent rather than a guess. */
function sendFile(
  appId: string,
  docType: string,
  file: File,
  csrf: string | undefined,
  onProgress: (pct: number) => void,
  onSent: () => void,
): { promise: Promise<DocumentSummary>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<DocumentSummary>((resolve, reject) => {
    xhr.open("POST", `/api/applications/${encodeURIComponent(appId)}/documents`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    if (csrf) xhr.setRequestHeader("x-csrf-token", csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.upload.onload = onSent;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as DocumentSummary);
        } catch {
          reject(new Error("The server sent an unreadable response."));
        }
      } else reject(new Error(describe(xhr)));
    };
    xhr.onerror = () => reject(new Error(describe(xhr)));
    xhr.onabort = () => reject(new Cancelled("cancelled"));
    const fd = new FormData();
    fd.append("declared_type", docType);
    fd.append("file", file, file.name);
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}

type SlotState = "uploaded" | "unreadable" | "flagged" | "missing";

function SlotIcon({ state }: { state: SlotState }) {
  if (state === "uploaded") return <CheckCircle2 aria-hidden className="size-4 text-verified-fg" />;
  if (state === "unreadable" || state === "flagged") return <AlertTriangle aria-hidden className="size-4 text-manual-fg" />;
  return <Circle aria-hidden className="size-4 text-ink-4" />;
}

const STATE_TEXT: Record<SlotState, string> = {
  uploaded: "Uploaded",
  unreadable: "Uploaded, could not be read",
  flagged: "Uploaded, AICTE asked for a correction",
  missing: "Not uploaded",
};

/**
 * One checklist row: what the document is, what was uploaded, and one action.
 * Drop a file on the row or choose one; a new upload replaces the earlier file.
 */
export function UploadSlot({
  appId,
  slot,
  doc,
  editable,
  emphasis = false,
  flag,
}: {
  appId: string;
  slot: ChecklistSlot;
  doc: DocumentSummary | undefined;
  editable: boolean;
  /** The first missing required slot carries the screen's upload action */
  emphasis?: boolean;
  /** AICTE asked for a correction to this document: still to do, or a new copy is uploaded */
  flag?: "requested" | "replaced";
}) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const { t, tn } = useLang();
  const dateTime = useDateTimeFormat();
  const relative = useRelativeTime();
  const input = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [announce, setAnnounce] = useState("");
  const [over, setOver] = useState(false);
  const busy = phase.kind === "uploading" || phase.kind === "processing";
  const has = !!doc || slot.uploaded;
  const unreadable = doc?.processing_status === "failed";
  const state: SlotState = !has ? "missing" : unreadable ? "unreadable" : flag === "requested" ? "flagged" : "uploaded";

  useEffect(() => () => abortRef.current?.(), []);

  // A mutation so the global activity mark shows while the upload runs
  const mut = useMutation({
    mutationFn: (file: File) => {
      const job = sendFile(
        appId,
        slot.doc_type,
        file,
        session?.csrf_token,
        (pct) => setPhase((p) => (p.kind === "uploading" ? { ...p, pct } : p)),
        () => setPhase((p) => (p.kind === "uploading" ? { kind: "processing", name: p.name, size: p.size } : p)),
      );
      abortRef.current = job.abort;
      return job.promise;
    },
    onSuccess: async (saved) => {
      abortRef.current = null;
      await qc.invalidateQueries({ queryKey: qk.application(appId) });
      setPhase({ kind: "idle" });
      setAnnounce(t("Uploaded {file} as {label}", { file: saved.original_filename, label: slot.label }));
    },
    onError: (e: unknown, file) => {
      abortRef.current = null;
      if (e instanceof Cancelled) {
        setPhase({ kind: "idle" });
        setAnnounce(t("Upload of {file} cancelled", { file: file.name }));
        return;
      }
      setPhase({ kind: "rejected", name: file.name, detail: e instanceof Error ? e.message : String(e) });
    },
  });

  function start(file: File) {
    if (!editable || busy) return;
    setAnnounce("");
    setPhase({ kind: "uploading", pct: 0, name: file.name, size: file.size });
    mut.mutate(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) start(f);
  }

  const choose = () => input.current?.click();

  return (
    <li
      id={`slot-${slot.doc_type}`}
      onDragOver={(e) => {
        if (!editable || busy) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
      className={cn("relative scroll-mt-24 px-5 py-4 transition-colors duration-150", over && "bg-brand-soft")}
    >
      {over && (
        <div aria-hidden className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-control border border-dashed border-brand-ink bg-brand-soft text-sm font-medium text-brand-ink">
          {t("Drop to upload as {label}", { label: slot.label })}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="mt-0.5 shrink-0">
            <SlotIcon state={state} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-medium text-ink">{slot.label}</h3>
              <span className="text-xs text-ink-3">{slot.required ? t("Required") : t("Optional")}</span>
              {flag === "requested" && <span className="text-xs font-medium text-manual-fg">{t("Correction requested")}</span>}
              {flag === "replaced" && <span className="text-xs font-medium text-verified-fg">{t("New copy uploaded")}</span>}
              <span className="sr-only">, {t(STATE_TEXT[state])}</span>
            </div>
            {/* Once the documents are locked the row is a record, so the guidance is left out */}
            {editable && slot.description && <p className="mt-0.5 text-sm text-ink-3 text-pretty">{slot.description}</p>}

            {phase.kind === "uploading" && (
              <div className="mt-3 max-w-md">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-mono text-ink-2">{phase.name}</span>
                  <span className="shrink-0 text-ink-3">{t("Uploading, {pct} percent", { pct: phase.pct })}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t("Uploading {file}", { file: phase.name })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={phase.pct}
                  className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3"
                >
                  <div className="h-full rounded-full bg-brand-solid transition-[width] duration-150" style={{ width: `${phase.pct}%` }} />
                </div>
              </div>
            )}
            {phase.kind === "processing" && (
              <p className="mt-3 text-sm text-ink-2">
                <span className="font-mono text-xs">{phase.name}</span>: {t("checking file type")}
              </p>
            )}
            {phase.kind === "rejected" && (
              <Callout
                tone="danger"
                className="mt-3"
                title={t("Not accepted: {reason}.", { reason: plainReason(phase.detail, t) })}
                action={
                  <Button size="sm" onClick={choose}>
                    {t("Try another file")}
                  </Button>
                }
              >
                <span className="font-mono text-xs">{phase.name}</span>
              </Callout>
            )}
            {!busy && phase.kind !== "rejected" && doc && (
              <div className="mt-2 text-xs text-ink-3">
                <MetaList
                  items={[
                    <span key="f" className="font-mono text-ink-2">
                      {doc.original_filename}
                    </span>,
                    fmtBytes(doc.size_bytes),
                    doc.mime === "application/pdf" ? tn(doc.page_count, "{n} page", "{n} pages") : null,
                    doc.uploaded_at ? <span title={dateTime(doc.uploaded_at)}>{t("uploaded {when}", { when: relative(doc.uploaded_at) })}</span> : null,
                    <Digest key="d" value={doc.sha256} label="SHA-256" head={8} tail={6} />,
                  ]}
                />
              </div>
            )}
            {!busy && phase.kind !== "rejected" && unreadable && (
              <Callout tone="warning" className="mt-3">
                {doc?.processing_error
                  ? t("This file could not be read: {reason}. Upload a clearer copy.", { reason: doc.processing_error.replace(/\.$/, "") })
                  : t("This file could not be read. Upload a clearer copy.")}
              </Callout>
            )}
          </div>
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label={t("Choose a file for {label}", { label: slot.label })}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) start(f);
              }}
            />
            {busy ? (
              <Button size="md" variant="secondary" onClick={() => abortRef.current?.()} disabled={phase.kind !== "uploading"}>
                {t("Cancel")}
              </Button>
            ) : phase.kind === "rejected" ? null : (
              <Button
                data-upload={slot.doc_type}
                variant={!has && emphasis ? "primary" : "secondary"}
                leadingIcon={has ? <RefreshCw /> : <Upload />}
                onClick={choose}
                aria-label={has ? t("Replace {label}", { label: slot.label }) : t("Upload {label}", { label: slot.label })}
              >
                {has ? t("Replace") : t("Upload")}
              </Button>
            )}
          </div>
        )}
        {!editable && !has && <span className="shrink-0 pl-7 text-xs text-ink-3 sm:pt-0.5 sm:pl-0">{t("Not uploaded")}</span>}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </li>
  );
}
