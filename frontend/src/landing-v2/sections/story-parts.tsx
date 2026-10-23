import { AlertTriangle, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export const CHECKS = [
  { title: "Issuer signature intact", detail: "Chain verified to the CCA India root.", field: "signature" as const },
  { title: "QR value matches the printed text", detail: "Number, holder and dates agree.", field: "qr" as const },
  {
    title: "Issuer registry record found",
    detail: "Registry lookups are simulated in this prototype.",
    field: "number" as const,
    tag: "SIMULATED",
  },
];

export function CheckList({ shown, compact = false }: { shown: number; compact?: boolean }) {
  return (
    <ol className={compact ? "grid gap-2" : "grid gap-3"} aria-label="Checks on the first certificate">
      {CHECKS.map((c, i) => {
        const on = shown > i;
        return (
          <motion.li
            key={c.title}
            initial={false}
            animate={{ opacity: on ? 1 : 0.6, x: on ? 0 : 8 }}
            transition={{ duration: 0.35, ease: [0.2, 0.9, 0.3, 1] }}
            className={`flex items-start gap-3 rounded-2xl bg-white/95 ${compact ? "px-3 py-2.5" : "px-4 py-3.5"} shadow-[0_2px_0_rgba(27,21,48,0.08)]`}
          >
            <span
              className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-300 ${on ? "bg-ok text-white" : "bg-ink/10 text-transparent"}`}
              aria-hidden
            >
              <Check className="size-4" strokeWidth={3} />
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold leading-snug text-ink ${compact ? "text-[0.9rem]" : "text-[1.02rem]"}`}>
                {c.title}
                {c.tag && (
                  <span className="ml-2 inline-block translate-y-[-1px] rounded-full bg-ink px-2 py-0.5 align-middle text-[0.62rem] font-bold tracking-wider text-white">
                    {c.tag}
                  </span>
                )}
                <span className="sr-only">{on ? ", passed" : ", pending"}</span>
              </span>
              {!compact && <span className="mt-0.5 block text-[0.9rem] leading-snug text-ink-2">{c.detail}</span>}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function ReviewNote({ show, compact = false }: { show: boolean; compact?: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="note"
          role="status"
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className={`rounded-2xl border-2 border-alert bg-white ${compact ? "p-3" : "p-4"} shadow-[0_4px_0_rgba(184,35,43,0.18)]`}
        >
          <div className="flex items-center gap-2 text-[0.78rem] font-bold tracking-wider text-alert uppercase">
            <AlertTriangle className="size-4" strokeWidth={2.6} aria-hidden />
            Needs human review
          </div>
          <p className={`mt-1.5 font-semibold leading-snug text-ink ${compact ? "text-[0.95rem]" : "text-[1.05rem]"}`}>
            Valid Up To was overwritten after signing: <span className="font-mono whitespace-nowrap text-alert">30-06-2027</span> drawn over{" "}
            <span className="font-mono whitespace-nowrap">30-06-2025</span>.
          </p>
          {!compact && (
            <p className="mt-2 text-[0.9rem] leading-snug text-ink-2">
              Revision 3 was saved after the fire officer signed Revision 1. The signature still verifies for Revision 1.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StepPills({ step }: { step: number }) {
  const items = ["Checks hold", "Needs review"];
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {items.map((t, i) => {
        const on = (i === 0 && step < 2) || (i === 1 && step >= 2);
        return (
          <span
            key={t}
            className={`chip transition-colors duration-300 ${on ? "bg-ink text-white" : "bg-ink/10 text-ink"}`}
          >
            <span className={`grid size-4 place-items-center rounded-full text-[0.62rem] ${on ? "bg-sun text-ink" : "bg-ink/15"}`}>
              {i + 1}
            </span>
            {t}
          </span>
        );
      })}
    </div>
  );
}

export const STORY_COPY = {
  check: {
    kicker: "Look, then confirm",
    title: "Every field, checked at its source.",
    body: "The hands hold the certificate still while Pramana checks the signature, the QR code and the issuer's own record.",
  },
  review: {
    kicker: "Look again",
    title: "Something changed after signing.",
    body: "The open hand means wait. An official compares the revisions and decides; Pramana only shows what changed.",
  },
};
