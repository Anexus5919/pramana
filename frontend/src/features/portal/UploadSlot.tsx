import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { CircleCheck, CircleDot, FileText, LoaderCircle, Upload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { api } from "../../api";
import { Pill } from "../../components/ui/Badge";
import { ErrorBanner } from "../../components/ui/Feedback";
import { fmtBytes, fmtDateTime } from "../../lib/format";
import type { ChecklistSlot, DocumentSummary } from "../../types";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function UploadSlot({
  appId,
  slot,
  docs,
  editable,
  onUploaded,
}: {
  appId: string;
  slot: ChecklistSlot;
  docs: DocumentSummary[];
  editable: boolean;
  onUploaded: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const mut = useMutation({
    mutationFn: (file: File) => api.uploadDocument(appId, slot.doc_type, file),
    onSuccess: () => onUploaded(),
  });
  const current = docs.filter((d) => !d.superseded);
  const uploaded = slot.uploaded || current.length > 0;

  function handle(files: FileList | null) {
    const f = files?.[0];
    if (f) mut.mutate(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (editable && !mut.isPending) handle(e.dataTransfer.files);
  }

  return (
    <li className="rounded-lg border border-line bg-surface p-3.5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {uploaded ? (
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-verified-dot" />
          ) : (
            <CircleDot aria-hidden className={clsx("mt-0.5 size-4 shrink-0", slot.required ? "text-manual-dot" : "text-unchecked-dot")} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{slot.label}</p>
            {slot.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{slot.description}</p>}
          </div>
        </div>
        <span className="flex shrink-0 gap-1">
          {slot.required ? <Pill tone={uploaded ? "verified" : "manual"}>Required</Pill> : <Pill tone="unchecked">Optional</Pill>}
        </span>
      </div>

      {current.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {current.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-md bg-subtle/70 px-2.5 py-1.5 text-xs">
              <FileText aria-hidden className="size-3.5 shrink-0 text-subtle-fg" />
              <span className="min-w-0 flex-1 truncate font-medium text-fg" title={d.original_filename}>
                {d.original_filename}
              </span>
              <span className="text-subtle-fg">
                {fmtBytes(d.size_bytes)}, {d.page_count} p, {fmtDateTime(d.uploaded_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={clsx(
            "mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md border border-dashed px-3 py-3 text-center text-xs transition-colors",
            over ? "border-primary bg-primary-soft/60 text-primary-ink" : "border-line-strong text-muted",
          )}
        >
          {mut.isPending ? (
            <span className="inline-flex items-center gap-2" role="status">
              <LoaderCircle aria-hidden className="size-4 animate-spin" /> Uploading and checking the file
            </span>
          ) : (
            <>
              <Upload aria-hidden className="size-4" />
              <span>Drop a PDF, JPEG or PNG here, or</span>
              <label
                htmlFor={inputId}
                className="cursor-pointer rounded font-semibold text-primary-ink underline-offset-2 hover:underline focus-within:outline-2 focus-within:outline-ring"
              >
                {current.length ? "choose a replacement" : "choose a file"}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  handle(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      )}
      {!!mut.error && <ErrorBanner error={mut.error} title="The file was not accepted" className="mt-2" />}
      {mut.isSuccess && !mut.isPending && (
        <p role="status" className="mt-2 text-xs font-medium text-verified-fg">
          Uploaded {mut.data.original_filename}.
        </p>
      )}
    </li>
  );
}
