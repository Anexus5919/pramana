import { FileUp } from "lucide-react";
import { forwardRef, useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { cn } from "../../ui2";

export interface DropZoneProps {
  onFile: (file: File) => void;
  /** Native accept string; also shown to the reader as the list of types */
  accept: string;
  busy?: boolean;
  /** One short line under the title: limits and what happens to the file */
  hint?: string;
  className?: string;
}

/** Extensions from an accept string, for display: ".pdf,.jpg,image/png" becomes "PDF, JPG". */
export function acceptedTypes(accept: string): string {
  const ext = accept
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("."))
    .map((s) => s.slice(1).toUpperCase())
    .filter((s) => s !== "JPEG");
  return ext.join(", ");
}

/**
 * A calm dashed drop area. The forwarded ref is the hidden file input, so a page
 * header button can open the same picker.
 */
export const DropZone = forwardRef<HTMLInputElement, DropZoneProps>(function DropZone({ onFile, accept, busy = false, hint, className }, ref) {
  const hintId = useId();
  const local = useRef<HTMLInputElement | null>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const setInput = (el: HTMLInputElement | null) => {
    local.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const pick = (files: FileList | null | undefined) => {
    const f = files?.[0];
    if (f && !busy) onFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    pick(e.dataTransfer.files);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!busy) local.current?.click();
    }
  };

  return (
    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy || undefined}
      aria-label="Choose a file to analyse, or drop one here"
      aria-describedby={hintId}
      onClick={() => !busy && local.current?.click()}
      onKeyDown={onKey}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
      className={cn(
        "flex h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed px-6 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
        busy ? "cursor-progress border-line-2 opacity-60" : "cursor-pointer",
        !busy && (dragging ? "border-brand-solid bg-brand-soft" : "border-line-2 hover:bg-surface-2"),
        className,
      )}
    >
      <input
        ref={setInput}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <FileUp aria-hidden className={cn("size-6", dragging ? "text-brand-ink" : "text-ink-4")} />
      <span className="text-sm font-medium text-ink">{dragging ? "Release to analyse this file" : "Drop a PDF, JPG or PNG, or choose a file"}</span>
      <span id={hintId} className="text-xs text-ink-3">
        Accepted: {acceptedTypes(accept)}
        {hint ? `. ${hint}` : ""}
      </span>
    </div>
  );
});
