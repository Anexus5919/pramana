import { Check, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState } from "react";
import { SimTag, ease, spring } from "../../kit";

type Decision = "accept" | "dismiss";

// Finding card where an official must give a reason before accepting or dismissing
export function ReviewCard() {
  const [mode, setMode] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<{ d: Decision; reason: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  function open(d: Decision) {
    setMode(d);
    setTimeout(() => inputRef.current?.focus(), 60);
  }
  function confirm() {
    if (!mode || !reason.trim()) return;
    setDone({ d: mode, reason: reason.trim() });
    setMode(null);
    setReason("");
  }

  return (
    <motion.article
      layout
      transition={spring.soft}
      className="w-[300px] overflow-hidden rounded-[18px] border border-(--lp-line) bg-white shadow-[0_30px_60px_-24px_rgb(60_20_110/0.45),0_8px_18px_-8px_rgb(28_22_34/0.12)]"
      aria-label="Finding review"
    >
      <motion.div layout="position" className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-(--lp-mismatch-bg) px-2 py-0.5 text-[10px] font-semibold text-(--lp-mismatch-fg)">High</span>
          <span className="rounded-full bg-[#1f8a50]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1f8a50]">E2 issuer</span>
          <SimTag className="ml-auto">SYNTHETIC</SimTag>
        </div>
        <h3 className="lp-display mt-2.5 text-[16px] leading-snug font-semibold tracking-[-0.02em] text-(--lp-ink)">
          Fire NOC validity differs from the issuer record
        </h3>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-(--lp-ink-2)">
          Printed Valid Up To <span className="lp-mono">30-06-2027</span>. The signed QR and the issuer registry both say{" "}
          <span className="lp-mono">30-06-2025</span>.
        </p>
        <p className="lp-mono mt-2 text-[9.5px] text-(--lp-ink-3)">Cites APH Annexure 2.1 (v), page 97</p>
      </motion.div>
      <div className="border-t border-(--lp-line) bg-(--lp-surface-2)/60 p-3">
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: ease.out }}
              className="text-[11.5px]"
              role="status"
            >
              <p className="flex items-center gap-1.5 font-semibold text-(--lp-verified-fg)">
                <span className="grid size-4 place-items-center rounded-full bg-(--lp-verified-dot) text-white">
                  <Check aria-hidden className="size-2.5" strokeWidth={3.5} />
                </span>
                {done.d === "accept" ? "Accepted" : "Dismissed"} with a reason
              </p>
              <p className="mt-1.5 rounded-[8px] bg-white px-2 py-1.5 text-(--lp-ink-2) ring-1 ring-(--lp-line)">"{done.reason}"</p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-(--lp-ink-3)">
                <span>Added to the hash-chained audit log</span>
                <button
                  type="button"
                  onClick={() => setDone(null)}
                  className="inline-flex items-center gap-1 rounded px-1 font-medium text-(--lp-brand-600) hover:underline"
                >
                  <Undo2 aria-hidden className="size-3" /> Try again
                </button>
              </div>
            </motion.div>
          ) : mode ? (
            <motion.div
              key="reason"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: ease.out }}
            >
              <label htmlFor={id} className="text-[10.5px] font-semibold text-(--lp-ink-2)">
                Reason to {mode === "accept" ? "accept" : "dismiss"} (required)
              </label>
              <textarea
                id={id}
                ref={inputRef}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    confirm();
                  }
                  if (e.key === "Escape") setMode(null);
                }}
                placeholder={mode === "accept" ? "Issuer record confirms 2025 expiry" : "Renewal letter attached separately"}
                className="mt-1 w-full resize-none rounded-[8px] border border-(--lp-line-2) bg-white px-2 py-1.5 text-[11.5px] text-(--lp-ink) outline-none placeholder:text-(--lp-ink-4) focus:border-(--lp-brand-400) focus:ring-2 focus:ring-(--lp-brand-200)"
              />
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="h-7 rounded-full px-3 text-[11px] font-medium text-(--lp-ink-2) hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!reason.trim()}
                  onClick={confirm}
                  className="h-7 rounded-full bg-(--lp-brand-500) px-3 text-[11px] font-semibold text-white transition-[opacity,transform] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm {mode === "accept" ? "accept" : "dismiss"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => open("accept")}
                className="h-8 flex-1 rounded-full bg-(--lp-brand-500) text-[12px] font-semibold text-white shadow-[0_8px_18px_-8px_rgb(139_61_255/0.7)] transition-transform hover:bg-(--lp-brand-600) active:scale-[0.97]"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => open("dismiss")}
                className="h-8 flex-1 rounded-full border border-(--lp-line-2) bg-white text-[12px] font-semibold text-(--lp-ink) transition-transform hover:border-(--lp-ink-4) active:scale-[0.97]"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
