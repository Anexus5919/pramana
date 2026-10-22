import { Check, FileText, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { fmtBytes, pluralize } from "../../lib/format";
import type { PdfVerifyResult } from "../../types";
import { BlockProgress, type BlockState } from "../../ui/Blocks";
import { BlockLoader } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Digest } from "../../ui/Digest";
import { dur, ease, spring } from "../../ui/motion";

export interface Reading {
  name: string;
  size: number;
  /** null while hashing, "" if the browser could not hash */
  clientHash: string | null;
  result: PdfVerifyResult | null;
  failed: boolean;
}

function Mark({ state }: { state: BlockState }) {
  return (
    <span
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-300",
        state === "done" && "bg-verified-bg text-verified-fg",
        state === "failed" && "bg-mismatch-bg text-mismatch-fg",
        state === "current" && "bg-brand-soft text-brand-ink",
        state === "pending" && "bg-surface-2 text-ink-4",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={state}
          initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={spring.snappy}
          className="inline-flex"
        >
          {state === "done" ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : state === "failed" ? (
            <X className="size-3.5" strokeWidth={3} />
          ) : state === "current" ? (
            <BlockLoader />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Step({ state, title, children }: { state: BlockState; title: string; children?: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-3 py-2.5">
      <Mark state={state} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium", state === "pending" ? "text-ink-3" : "text-ink")}>{title}</div>
        <div className="mt-0.5 min-w-0 text-xs text-ink-3">{children}</div>
      </div>
    </li>
  );
}

/** A hash that appears left to right as it arrives, so the reader sees it was just computed. */
function HashReveal({ value }: { value: string }) {
  return (
    <motion.span
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration: 0.5, ease: ease.out }}
      className="block truncate font-mono text-[12px] text-ink-2"
      title={value}
    >
      {value}
    </motion.span>
  );
}

export function ReadingCard({ reading, onDismiss }: { reading: Reading; onDismiss?: () => void }) {
  const { clientHash, result, failed } = reading;
  const hashState: BlockState = clientHash === null ? "current" : clientHash === "" ? "failed" : "done";
  const serverState: BlockState = result ? "done" : failed ? "failed" : "current";
  const matches = !!result && !!clientHash && result.sha256 === clientHash;
  const compareState: BlockState =
    result && clientHash !== null ? (clientHash === "" ? "pending" : matches ? "done" : "failed") : "pending";
  const signed = result?.signatures.filter((s) => s.response?.signer).length ?? 0;

  return (
    <motion.section
      layout="position"
      aria-label={`Checking ${reading.name}`}
      aria-busy={!result && !failed}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className="rounded-card border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex items-start gap-4">
        <span className="relative flex h-14 w-11 shrink-0 items-end justify-center rounded-[8px] border border-line-2 bg-surface-2 pb-1.5">
          <FileText className="absolute top-2 size-4 text-ink-3" aria-hidden />
          <span className="rounded-[4px] bg-mismatch-dot px-1 font-mono text-[9px] font-semibold text-white">PDF</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink" title={reading.name}>
            {reading.name}
          </div>
          <div className="mt-0.5 text-xs text-ink-3">
            {fmtBytes(reading.size)}
            {result && `, ${pluralize(result.pages, "page")}`}
          </div>
          <BlockProgress
            className="mt-3"
            size="sm"
            stages={[
              { key: "hash", label: "Fingerprint", state: hashState === "failed" ? "done" : hashState },
              { key: "server", label: "Server check", state: serverState },
              { key: "compare", label: "Compare", state: compareState === "pending" && result ? "done" : compareState },
            ]}
          />
        </div>
        {onDismiss && (result || failed) && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Hide this check"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <ol className="mt-3 divide-y divide-line border-t border-line" aria-live="polite">
        <Step state={hashState} title="Fingerprint computed in your browser">
          {clientHash === null ? (
            "Reading the bytes and computing SHA-256"
          ) : clientHash === "" ? (
            "This browser could not compute the hash; the server value is shown below."
          ) : (
            <HashReveal value={clientHash} />
          )}
        </Step>
        <Step state={serverState} title="Signatures and structure checked on the server">
          {result
            ? `${signed ? pluralize(signed, "signature") : "No embedded signature"}, ${pluralize(result.revisions ?? 1, "revision")}, ${pluralize(result.forensic_signals.length, "structural signal")}`
            : failed
              ? "The server could not check this file."
              : "Validating the signature chain and reading the file structure"}
        </Step>
        <Step
          state={compareState}
          title={compareState === "failed" ? "Hash differs from the server" : compareState === "done" ? "Hash matches server" : "Compare fingerprints"}
        >
          {result ? (
            matches ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">The server read exactly the bytes you chose.</span>
                <Digest value={result.sha256} label="SHA-256" head={10} tail={8} />
              </span>
            ) : clientHash === "" ? (
              <Digest value={result.sha256} label="Server SHA-256" head={10} tail={8} />
            ) : (
              <span className="text-mismatch-fg">The server received different bytes. Check the upload and try again.</span>
            )
          ) : (
            "Waits for both fingerprints"
          )}
        </Step>
      </ol>
    </motion.section>
  );
}
