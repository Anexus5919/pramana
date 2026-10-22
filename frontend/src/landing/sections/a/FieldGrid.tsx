import { Check, X } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { ease } from "../../kit";

const COLS = 41;
const TOTAL = 328;

type Miss = { field: string; outcome: "recovered" | "rejected"; detail: string };

const MISSES: Miss[] = [
  { field: "Certificate number", outcome: "recovered", detail: "Model proposed SMC/FIRE/2025/11873. Found on the printed page, kept." },
  { field: "Institution name", outcome: "recovered", detail: "Model proposed the institution name. Matched the page text and the issuer record." },
  { field: "Issue date", outcome: "recovered", detail: "Model proposed 14-03-2025. Grounded to its page region, kept." },
  { field: "Issuing office", outcome: "recovered", detail: "Model proposed the fire office name. Grounded on the page, kept." },
  {
    field: "Valid until",
    outcome: "rejected",
    detail: "Model proposed 31-12-2099, copied from a hidden line telling automated readers what to report. Not on the printed page, so grounding rejected it and flagged the line.",
  },
];

// 328 printed fields: 323 read by deterministic patterns, 5 misses in one unfamiliar layout that the local model then tried
export function FieldGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduced = useReducedMotion();
  const [sel, setSel] = useState<number>(4);
  const missStart = TOTAL - MISSES.length;
  const sweep = reduced ? 0 : 1.1;

  return (
    <div ref={ref} className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
      <div>
        <div
          className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] sm:grid-cols-[repeat(41,minmax(0,1fr))]"
          role="img"
          aria-label="328 printed fields: 323 read by deterministic patterns, 4 recovered by the local model, 1 model proposal rejected by grounding"
        >
          {Array.from({ length: missStart }, (_, i) => {
            const col = i % COLS;
            return (
              <span
                key={i}
                className={`aspect-square rounded-[2px] bg-(--lp-voxel-top) transition-[opacity,transform] duration-300 ${
                  inView || reduced ? "scale-100 opacity-100" : "scale-[0.6] opacity-20"
                }`}
                style={{ transitionDelay: `${(col / COLS) * sweep}s` }}
              />
            );
          })}
          {MISSES.map((m, j) => {
            const active = sel === j;
            const resolved = inView;
            const color = m.outcome === "recovered" ? "bg-(--lp-verified-dot)" : "bg-(--lp-mismatch-dot)";
            return (
              <button
                key={m.field}
                type="button"
                onPointerEnter={() => setSel(j)}
                onFocus={() => setSel(j)}
                onClick={() => setSel(j)}
                aria-pressed={active}
                aria-label={`${m.field}: ${m.outcome === "recovered" ? "recovered by the local model" : "model proposal rejected by grounding"}`}
                className="relative aspect-square rounded-[2px] outline-offset-1"
              >
                <span className="absolute inset-0 rounded-[2px] border border-dashed border-(--lp-ink-4)" />
                <motion.span
                  className={`absolute inset-0 rounded-[2px] ${color}`}
                  initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.3 }}
                  animate={resolved ? { opacity: 1, scale: 1 } : {}}
                  transition={{ duration: 0.35, delay: reduced ? 0 : sweep + 0.4 + j * 0.18, ease: ease.out }}
                />
                {active && (
                  <motion.span
                    layoutId="miss-ring"
                    className="absolute -inset-[3px] rounded-[4px] ring-2 ring-(--lp-ink)"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-(--lp-ink-2)">
          <li className="flex items-center gap-2">
            <span className="size-2.5 rounded-[2px] bg-(--lp-voxel-top)" /> 323 read by deterministic patterns
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2.5 rounded-[2px] bg-(--lp-verified-dot)" /> 4 recovered by the local model, grounded
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2.5 rounded-[2px] bg-(--lp-mismatch-dot)" /> 1 proposal rejected by grounding
          </li>
        </ul>
      </div>

      <div className="rounded-[20px] border border-(--lp-line) bg-white p-5 lp-shadow-md">
        <p className="lp-eyebrow">The 5 misses, one unfamiliar issuer layout</p>
        <ol className="mt-3 space-y-1">
          {MISSES.map((m, j) => (
            <li key={m.field}>
              <button
                type="button"
                onPointerEnter={() => setSel(j)}
                onFocus={() => setSel(j)}
                onClick={() => setSel(j)}
                aria-pressed={sel === j}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[13.5px] transition-colors ${
                  sel === j ? "bg-(--lp-surface-2) text-(--lp-ink)" : "text-(--lp-ink-2) hover:bg-(--lp-surface-2)/60"
                }`}
              >
                <span
                  className={`grid size-[18px] shrink-0 place-items-center rounded-full text-white ${
                    m.outcome === "recovered" ? "bg-(--lp-verified-dot)" : "bg-(--lp-mismatch-dot)"
                  }`}
                >
                  {m.outcome === "recovered" ? (
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                  ) : (
                    <X aria-hidden className="size-3" strokeWidth={3} />
                  )}
                </span>
                <span className="font-medium">{m.field}</span>
                <span className="ml-auto text-[11.5px] text-(--lp-ink-3)">{m.outcome === "recovered" ? "recovered" : "rejected"}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-3 min-h-[84px] border-t border-(--lp-line) pt-3" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={sel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: ease.out }}
              className="text-[13.5px] leading-relaxed text-(--lp-ink-2)"
            >
              {MISSES[sel].detail}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
