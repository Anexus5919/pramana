import { FileUp, Fingerprint, Layers, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useId, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";

const CHECKS = [
  { icon: Fingerprint, label: "Fingerprint", hint: "SHA-256 in your browser" },
  { icon: ShieldCheck, label: "Signatures", hint: "Chain to a trust anchor" },
  { icon: Layers, label: "Structure", hint: "Revisions and overlays" },
];

/** The page sketch: a PDF sheet whose lines are blocks; it lifts while a file hovers over the zone. */
function Sheet({ lifted }: { lifted: boolean }) {
  return (
    <motion.div
      aria-hidden
      animate={{ y: lifted ? -8 : 0, rotate: lifted ? -2 : 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className="relative h-[128px] w-[100px] shrink-0 rounded-[10px] border border-line-2 bg-surface p-3 shadow-md"
    >
      <span className="absolute top-0 right-0 size-5 rounded-bl-[8px] border-b border-l border-line-2 bg-surface-2" />
      <span className="block h-2 w-10 rounded-[3px] bg-brand-300" />
      {[78, 62, 70, 54, 66].map((w, i) => (
        <span key={i} className="mt-2 block h-1.5 rounded-[2px] bg-surface-3" style={{ width: `${w}%` }} />
      ))}
      <span className="absolute right-3 bottom-3 flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("size-2 rounded-[2px] transition-colors duration-300", lifted ? "bg-brand-500" : "bg-brand-200")} />
        ))}
      </span>
      <span className="absolute -bottom-2 left-3 rounded-[5px] bg-mismatch-dot px-1.5 py-px font-mono text-[10px] font-semibold text-white">
        PDF
      </span>
    </motion.div>
  );
}

export interface DropZoneProps {
  onFile: (file: File) => void;
  busy?: boolean;
  compact?: boolean;
}

export function DropZone({ onFile, busy = false, compact = false }: DropZoneProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const reduce = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 520, damping: 40, mass: 0.4 });
  const sy = useSpring(my, { stiffness: 520, damping: 40, mass: 0.4 });

  const track = (el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    // Keep the label inside the zone so it never causes overflow
    mx.set(Math.min(Math.max(x - r.left + 14, 8), r.width - 260));
    my.set(Math.min(Math.max(y - r.top + 16, 8), r.height - 40));
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
      input.current?.click();
    }
  };

  const active = dragging || hover;
  const preview = (dragging || hover) && !busy;

  return (
    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy || undefined}
      aria-describedby={`${inputId}-hint`}
      aria-label="Choose a PDF to check, or drop one here"
      onClick={() => !busy && input.current?.click()}
      onKeyDown={onKey}
      onPointerEnter={(e: PointerEvent<HTMLDivElement>) => {
        setHover(true);
        track(e.currentTarget, e.clientX, e.clientY);
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => track(e.currentTarget, e.clientX, e.clientY)}
      onPointerLeave={() => setHover(false)}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = busy ? "none" : "copy";
        track(e.currentTarget, e.clientX, e.clientY);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
      className={cn(
        "group relative isolate overflow-hidden border-2 border-dashed transition-[border-color,background-color,box-shadow] duration-200 outline-none focus-visible:border-solid focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20",
        compact ? "rounded-card px-5 py-4" : "rounded-panel px-6 py-10 sm:px-10 sm:py-12",
        busy ? "cursor-progress border-line-2 bg-surface/70" : "cursor-pointer",
        !busy && (dragging ? "border-brand-400 bg-brand-soft shadow-glow" : active ? "border-brand-300 bg-surface" : "border-line-2 bg-surface/80"),
      )}
    >
      {!compact && <div aria-hidden className="absolute inset-0 -z-10 bg-sky-soft opacity-60" />}
      <input
        ref={input}
        id={inputId}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      {compact ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
            <FileUp className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">Check another PDF</div>
            <div id={`${inputId}-hint`} className="text-xs text-ink-3">
              Drop a file here or click to choose. Each check is added to this session's history.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-8 md:flex-row md:justify-center md:gap-12">
          <Sheet lifted={dragging} />
          <div className="min-w-0 max-w-md text-center md:text-left">
            <h2 className="font-display text-xl font-semibold tracking-title text-ink sm:text-2xl">
              {dragging ? "Release to check this file" : "Drop a PDF to check it"}
            </h2>
            <p id={`${inputId}-hint`} className="mt-2 text-sm text-ink-3 text-pretty">
              Or click anywhere here to choose one. Up to 15 MB. Nothing is stored; the check itself is recorded in the audit
              log.
            </p>
            <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="What happens to the file">
              {CHECKS.map((c, i) => (
                <motion.li
                  key={c.label}
                  animate={dragging ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={{ delay: dragging ? i * 0.08 : 0, duration: dur.panel, ease: ease.out }}
                  className={cn(
                    "flex items-start gap-2 rounded-control border px-2.5 py-2 text-left transition-colors duration-300",
                    dragging ? "border-brand-300 bg-surface" : "border-line bg-surface/70",
                  )}
                >
                  <c.icon className={cn("mt-0.5 size-4 shrink-0", dragging ? "text-brand-500" : "text-ink-3")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-ink">
                      {i + 1}. {c.label}
                    </span>
                    <span className="block text-[11px] leading-snug text-ink-3">{c.hint}</span>
                  </span>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <AnimatePresence>
        {preview && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: dur.micro } }}
            transition={{ duration: dur.ui, ease: ease.out }}
            style={reduce ? { x: mx, y: my } : { x: sx, y: sy }}
            className="pointer-events-none absolute top-0 left-0 z-10 hidden items-center gap-1.5 rounded-full bg-pupil-2 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg sm:inline-flex dark:bg-surface-3 dark:text-ink"
          >
            <span className="size-1.5 rounded-full bg-brand-300" />
            Drop to check signatures and structure
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
