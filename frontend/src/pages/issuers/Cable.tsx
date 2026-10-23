import { Landmark } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { EyeMark } from "../../brand/EyeMark";
import { cn } from "../../ui/cn";
import { spring } from "../../ui/motion";

const N = 14;
const HALF = N / 2;

/** One block of the link; `k` is its distance from the break point in the middle (0 innermost). */
function CableBlock({ i, online, busy }: { i: number; online: boolean; busy: boolean }) {
  const reduce = useReducedMotion();
  const left = i < HALF;
  const k = left ? HALF - 1 - i : i - HALF;
  const sign = left ? -1 : 1;
  const loose = HALF - 1 - k;
  // While a request is in flight it travels left to right; offline, it stops at the break
  const carries = busy && (online || left);
  const falls = loose >= HALF - 2;
  return (
    <motion.span
      initial={false}
      animate={
        online
          ? { x: 0, y: 0, rotate: 0, opacity: 1 }
          : falls
            ? { x: sign * (6 + loose * 1.5), y: 4 + (loose - (HALF - 2)) * 4, rotate: sign * (8 + (loose - (HALF - 2)) * 10), opacity: 0.35 }
            : { x: sign * (2 + loose * 1.5), y: 0, rotate: 0, opacity: 0.75 }
      }
      transition={reduce ? { duration: 0 } : { ...spring.soft, delay: online ? (HALF - 1 - k) * 0.02 : k * 0.015 }}
      className={cn(
        "relative block h-2.5 min-w-[6px] flex-1 overflow-hidden rounded-[3px] transition-colors duration-300",
        online ? (i % 2 ? "bg-brand-400" : "bg-brand-500") : "bg-unavail-dot",
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-white/35" />
      {carries && (
        <motion.span
          aria-hidden
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0] }}
          transition={{ duration: 0.45, delay: i * 0.05, repeat: Infinity, repeatDelay: Math.max(0.1, (left && !online ? HALF : N) * 0.05 - 0.2) }}
        />
      )}
    </motion.span>
  );
}

/** Pramana on the left, the issuer on the right, joined by a cable of blocks that separates when the source stops responding. */
export function Cable({ online, busy = false, code }: { online: boolean; busy?: boolean; code: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3" role="img" aria-label={online ? `Pramana is connected to ${code}` : `${code} is not responding`}>
      <span className="flex shrink-0 flex-col items-center">
        <span className="grid size-10 place-items-center rounded-[10px] border border-line bg-surface shadow-xs">
          <EyeMark size={24} className="text-ink" />
        </span>
      </span>
      <span className="relative flex h-6 min-w-0 flex-1 items-center justify-center">
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: online ? 0 : 1, scaleX: online ? 0.3 : 1 }}
          transition={{ duration: 0.3 }}
          className="absolute top-1/2 left-1/2 h-0 w-16 -translate-x-1/2 border-t-2 border-dashed border-unavail-dot/60"
        />
        <span className="relative flex w-full items-center gap-[3px]">
          {Array.from({ length: N }, (_, i) => (
            <CableBlock key={i} i={i} online={online} busy={busy} />
          ))}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-[10px] border shadow-xs transition-colors duration-300",
            online ? "border-brand-200 bg-brand-soft text-brand-ink" : "border-dashed border-unavail-dot/60 bg-unavail-bg text-unavail-fg",
          )}
        >
          <Landmark className="size-[18px]" aria-hidden />
        </span>
      </span>
    </div>
  );
}
