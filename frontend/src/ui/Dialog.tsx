import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";
import { useT } from "../i18n";
import { cn } from "./cn";
import { dur, ease, spring } from "./motion";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Traps Tab inside the panel, closes on Escape, restores focus to the opener and locks page scroll. */
function useModal(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const el = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current;
      el?.focus({ preventScroll: true });
    });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, panel, initialFocus]);
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Right-aligned action buttons */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

const widths = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]", xl: "max-w-[1040px]" };

export function Dialog({ open, onClose, title, description, children, footer, size = "md", initialFocus, className }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const t = useT();
  useModal(open, panel, onClose, initialFocus);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-overlay backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.ui }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={description ? `${id}-desc` : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: dur.panel, ease: ease.out } }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: dur.micro } }}
            className={cn(
              "relative flex max-h-[min(88dvh,900px)] w-full flex-col overflow-hidden rounded-t-panel border border-line bg-surface shadow-lg outline-none sm:rounded-panel",
              widths[size],
              className,
            )}
          >
            <header className="flex items-start gap-4 px-6 pt-5 pb-3">
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-title`} className="font-display text-lg font-semibold tracking-title">
                  {title}
                </h2>
                {description && (
                  <p id={`${id}-desc`} className="mt-1 text-sm text-ink-3 text-pretty">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label={t("Close")} icon={<X />} size="sm" onClick={onClose} className="-mt-0.5 -mr-2" />
            </header>
            {children !== undefined && <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>}
            {footer && (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-3.5">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** The side the sheet enters from; match the side of its trigger */
  side?: "left" | "right";
  width?: number | string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Hide the visible header; the title still labels the dialog */
  bare?: boolean;
  className?: string;
}

/** Side drawer with a soft spring; used for detail panels and the mobile nav. */
export function Sheet({ open, onClose, title, description, side = "right", width = 480, children, footer, bare, className }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const t = useT();
  useModal(open, panel, onClose);
  const off = side === "right" ? "100%" : "-100%";

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.ui }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            tabIndex={-1}
            initial={{ x: off }}
            animate={{ x: 0, transition: spring.soft }}
            exit={{ x: off, transition: { duration: dur.panel, ease: ease.inOut } }}
            style={{ width: typeof width === "number" ? `min(${width}px, 100vw)` : width }}
            className={cn(
              "absolute inset-y-0 flex flex-col bg-surface shadow-lg outline-none",
              side === "right" ? "right-0 border-l border-line" : "left-0 border-r border-line",
              className,
            )}
          >
            <header className={cn("flex items-start gap-3 border-b border-line px-5 py-4", bare && "sr-only")}>
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-title`} className="font-display text-md font-semibold tracking-title">
                  {title}
                </h2>
                {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
              </div>
              <IconButton label={t("Close")} icon={<X />} size="sm" onClick={onClose} className="-mr-1.5" />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
