import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "./cn";
import { dur } from "./motion";
import { Tooltip } from "./Tooltip";

export function middleTruncate(s: string, head = 8, tail = 6): string {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export interface DigestProps {
  value: string | null | undefined;
  /** Characters kept at the start and end */
  head?: number;
  tail?: number;
  /** What the value is, for screen readers and the copy button */
  label?: string;
  copy?: boolean;
  className?: string;
}

/** Mono hash or ID, middle-truncated, with copy-to-clipboard and a check morph. */
export function Digest({ value, head = 8, tail = 6, label, copy = true, className }: DigestProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!value) return <span className={cn("font-mono text-xs text-ink-4", className)}>none</span>;

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 align-middle", className)}>
      <Tooltip content={<span className="font-mono break-all">{value}</span>}>
        <span
          tabIndex={0}
          className="truncate rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink-2"
          aria-label={`${label ?? "Value"} ${value}`}
        >
          {middleTruncate(value, head, tail)}
        </span>
      </Tooltip>
      {copy && (
        <button
          type="button"
          aria-label={copied ? "Copied" : `Copy ${label ?? "value"}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () => setCopied(true),
              () => undefined,
            );
          }}
          className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copied ? "done" : "copy"}
              initial={{ scale: 0.5, opacity: 0, rotate: copied ? -45 : 0 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: dur.ui }}
              className={cn("inline-flex", copied && "text-verified-dot")}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </motion.span>
          </AnimatePresence>
        </button>
      )}
    </span>
  );
}
