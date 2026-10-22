import { AnimatePresence, motion } from "motion/react";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { dur, ease } from "./motion";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom";
  delay?: number;
  className?: string;
  /** Wrapper element class, e.g. to make the trigger a block */
  wrapperClassName?: string;
  disabled?: boolean;
}

/** Hover and focus tooltip, portalled and kept inside the viewport. */
export function Tooltip({ content, children, side = "top", delay = 250, className, wrapperClassName, disabled }: TooltipProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; side: "top" | "bottom" } | null>(null);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, [delay]);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current?.getBoundingClientRect();
    const w = t?.width ?? 200;
    const h = t?.height ?? 32;
    let s = side;
    if (s === "top" && a.top - h - 8 < 4) s = "bottom";
    if (s === "bottom" && a.bottom + h + 8 > window.innerHeight - 4) s = "top";
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, a.left + a.width / 2 - w / 2));
    const y = s === "top" ? a.top - h - 8 : a.bottom + 8;
    setPos({ x, y, side: s });
  }, [open, side, content]);

  if (disabled || content === null || content === undefined || content === "") return children;

  const child = isValidElement<{ "aria-describedby"?: string }>(children)
    ? cloneElement(children, { "aria-describedby": open ? id : undefined })
    : children;

  return (
    <span
      ref={anchor}
      className={cn("inline-flex max-w-full", wrapperClassName)}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {child}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={tip}
              id={id}
              role="tooltip"
              initial={{ opacity: 0, y: (pos?.side ?? side) === "top" ? 4 : -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: dur.micro } }}
              transition={{ duration: dur.ui, ease: ease.out }}
              style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
              className={cn(
                "pointer-events-none fixed z-[90] max-w-[280px] rounded-[10px] bg-pupil-2 px-3 py-2 text-xs leading-snug text-white shadow-lg dark:bg-surface-3 dark:text-ink",
                className,
              )}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
