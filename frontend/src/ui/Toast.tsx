import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { cn } from "./cn";
import { dur, ease, spring } from "./motion";

export type ToastTone = "success" | "error" | "info";

export interface ToastInput {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss; 0 keeps it until closed */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  (t: ToastInput): number;
  success: (title: ReactNode, description?: ReactNode) => number;
  error: (title: ReactNode, description?: ReactNode) => number;
  info: (title: ReactNode, description?: ReactNode) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used inside ToastProvider");
  return api;
}

const ICON = { success: CircleCheck, error: CircleAlert, info: Info };
const ICON_CLASS = { success: "text-verified-dot", error: "text-mismatch-dot", info: "text-brand-500" };

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const t = useT();
  const tone = item.tone ?? "info";
  const Icon = ICON[tone];
  const duration = item.duration ?? (tone === "error" ? 8000 : 5000);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const started = useRef(0);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!duration || paused) return;
    started.current = Date.now();
    const t = window.setTimeout(() => close.current(), remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - started.current;
    };
  }, [paused, duration]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: dur.panel, ease: ease.out } }}
      exit={{ opacity: 0, x: 24, transition: { duration: dur.ui } }}
      transition={spring.snappy}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role={tone === "error" ? "alert" : "status"}
      className="pointer-events-auto relative flex w-[min(380px,calc(100vw-32px))] gap-3 overflow-hidden rounded-card border border-line bg-surface p-3.5 pr-10 shadow-lg"
    >
      <motion.span
        initial={{ scale: 0.4, rotate: -30, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ delay: 0.08, ...spring.snappy }}
        className={cn("mt-px shrink-0", ICON_CLASS[tone])}
      >
        <Icon className="size-[18px]" aria-hidden />
      </motion.span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{item.title}</div>
        {item.description && <div className="mt-0.5 text-sm text-ink-3 text-pretty">{item.description}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("Dismiss notification")}
        className="absolute top-2.5 right-2.5 inline-flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
      {duration > 0 && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-surface-2">
          <span
            className={cn("block h-full origin-left", tone === "error" ? "bg-mismatch-dot" : tone === "success" ? "bg-verified-dot" : "bg-brand-400")}
            style={{
              animation: `toast-timer ${duration}ms linear forwards`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </span>
      )}
    </motion.li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = next.current++;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    return id;
  }, []);

  const api = useMemo(() => {
    const fn = ((t: ToastInput) => push(t)) as ToastApi;
    fn.success = (title, description) => push({ title, description, tone: "success" });
    fn.error = (title, description) => push({ title, description, tone: "error" });
    fn.info = (title, description) => push({ title, description, tone: "info" });
    fn.dismiss = dismiss;
    return fn;
  }, [push, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(
        <ol
          data-toast-region
          aria-label={t("Notifications")}
          className="pointer-events-none fixed right-4 bottom-4 z-[95] flex flex-col items-end gap-2"
        >
          <style>{"@keyframes toast-timer{from{transform:scaleX(1)}to{transform:scaleX(0)}}"}</style>
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />
            ))}
          </AnimatePresence>
        </ol>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
