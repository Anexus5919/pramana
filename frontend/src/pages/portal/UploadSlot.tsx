import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, FileText, RefreshCw, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtBytes, fmtRelative } from "../../lib/format";
import type { ChecklistSlot, DocumentSummary } from "../../types";
import { Tag } from "../../ui/Badge";
import { BlockLoader, Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Digest } from "../../ui/Digest";
import { dur, ease, spring } from "../../ui/motion";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const SEGMENTS = 24;

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number; name: string; size: number }
  | { kind: "processing"; name: string; size: number }
  | { kind: "rejected"; name: string; detail: string }
  | { kind: "done" };

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
    const fd = new FormData();
    fd.append("declared_type", docType);
    fd.append("file", file, file.name);
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}

function Segments({ pct, processing }: { pct: number; processing: boolean }) {
  const filled = Math.round((pct / 100) * SEGMENTS);
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${SEGMENTS}, minmax(0, 1fr))` }} aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "relative h-2 overflow-hidden rounded-[2px] transition-colors duration-150",
            i < filled ? "bg-brand-500" : "bg-surface-3",
          )}
        >
          {processing && <span className="absolute inset-0 shimmer-bg animate-shimmer" style={{ animationDelay: `${(i % 6) * 0.08}s` }} />}
        </span>
      ))}
    </div>
  );
}

export function UploadSlot({
  appId,
  slot,
  doc,
  editable,
  index,
}: {
  appId: string;
  slot: ChecklistSlot;
  doc: DocumentSummary | undefined;
  editable: boolean;
  index: number;
}) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const busy = phase.kind === "uploading" || phase.kind === "processing";
  const has = !!doc;

  useEffect(() => () => abortRef.current?.(), []);

  // A mutation so the global eye shows activity while the upload runs
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
    onSuccess: async () => {
      abortRef.current = null;
      await qc.invalidateQueries({ queryKey: qk.application(appId) });
      setPhase({ kind: "done" });
    },
    onError: (e: unknown, file) => {
      abortRef.current = null;
      setPhase({ kind: "rejected", name: file.name, detail: e instanceof Error ? e.message : String(e) });
    },
  });

  function start(file: File) {
    if (!editable || busy) return;
    setPhase({ kind: "uploading", pct: 0, name: file.name, size: file.size });
    mut.mutate(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) start(f);
  }

  const status = busy ? "busy" : phase.kind === "rejected" ? "rejected" : has ? "received" : "empty";

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.04, duration: dur.panel, ease: ease.out }}
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
      id={`slot-${slot.doc_type}`}
      className={cn(
        "relative scroll-mt-24 overflow-hidden rounded-card border bg-surface transition-[border-color,box-shadow,background-color] duration-200",
        over ? "border-brand-400 shadow-glow" : status === "rejected" ? "border-mismatch-dot/40" : "border-line shadow-xs",
      )}
    >
      <AnimatePresence>
        {over && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.micro }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-brand-soft/90 text-sm font-semibold text-brand-ink backdrop-blur-[2px]"
          >
            <Upload className="size-4" aria-hidden /> Drop to upload as {slot.label}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "relative mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-300",
              status === "received" ? "bg-verified-bg text-verified-fg" : status === "rejected" ? "bg-mismatch-bg text-mismatch-fg" : "bg-surface-2 text-ink-3",
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={status}
                initial={{ scale: 0.4, opacity: 0, rotate: status === "received" ? -30 : 0 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={spring.snappy}
                className="inline-flex"
              >
                {status === "received" ? (
                  <Check className="size-[18px]" strokeWidth={2.6} />
                ) : status === "rejected" ? (
                  <CircleAlert className="size-[18px]" />
                ) : (
                  <FileText className="size-[18px]" />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-ink">{slot.label}</h3>
              {slot.required ? <Tag variant={has ? "neutral" : "brand"}>Required</Tag> : <Tag>Optional</Tag>}
            </div>
            {slot.description && <p className="mt-0.5 text-xs leading-relaxed text-ink-3 text-pretty">{slot.description}</p>}

            <AnimatePresence mode="wait" initial={false}>
              {busy && (
                <motion.div
                  key="busy"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: dur.ui, ease: ease.out }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 rounded-control bg-surface-2 px-3 py-2.5" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-medium text-ink-2">{"name" in phase ? phase.name : ""}</span>
                      <span className="shrink-0 font-mono text-ink-3 tabular">
                        {phase.kind === "uploading" ? (
                          `${phase.pct}% of ${fmtBytes(phase.size)}`
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <BlockLoader className="text-brand-500" /> Checking file type and hashing
                          </span>
                        )}
                      </span>
                    </div>
                    <Segments pct={phase.kind === "uploading" ? phase.pct : 100} processing={phase.kind === "processing"} />
                  </div>
                </motion.div>
              )}
              {!busy && phase.kind === "rejected" && (
                <motion.div
                  key="rejected"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: dur.ui }}
                  role="alert"
                  className="mt-3 rounded-control border border-mismatch-dot/25 bg-mismatch-bg px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-mismatch-fg">Not accepted: </span>
                  <span className="text-ink-2">{phase.detail}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-ink-3">{phase.name}</span>
                </motion.div>
              )}
              {!busy && phase.kind !== "rejected" && doc && (
                <motion.div
                  key={doc.id}
                  initial={phase.kind === "done" ? { opacity: 0, y: -4 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: dur.ui, ease: ease.out }}
                  className="mt-3 rounded-control border border-line bg-canvas px-3 py-2"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-xs font-medium text-ink" title={doc.original_filename}>
                      {doc.original_filename}
                    </span>
                    <Digest value={doc.sha256} label="SHA-256" head={6} tail={4} className="shrink-0" />
                  </div>
                  <div className="mt-0.5 text-xs text-ink-3 tabular">
                    {fmtBytes(doc.size_bytes)}, {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
                    {doc.uploaded_at ? `, uploaded ${fmtRelative(doc.uploaded_at)}` : ""}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label={`Choose a file for ${slot.label}`}
              data-upload={slot.doc_type}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) start(f);
              }}
            />
            <Button
              size="sm"
              variant={has ? "ghost" : "secondary"}
              leadingIcon={has ? <RefreshCw /> : <Upload />}
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {has ? "Replace" : phase.kind === "rejected" ? "Try another file" : "Choose file"}
            </Button>
          </div>
        )}
        {!editable && !has && <span className="shrink-0 text-xs text-ink-4">Not uploaded</span>}
      </div>
    </motion.li>
  );
}
