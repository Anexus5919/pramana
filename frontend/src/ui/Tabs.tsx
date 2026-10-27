import { motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "./cn";
import { spring } from "./motion";

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  count?: number | null;
  icon?: ReactNode;
  /** Highlights the count, e.g. when there are open high-severity findings */
  attention?: boolean;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange?: (id: T) => void;
  /** When given, tabs render as router links so the tab lives in the URL */
  hrefFor?: (id: T) => string;
  /** Accessible name for the tablist */
  label: string;
  /** Stable id prefix; pair with TabPanel `tabsId` */
  id?: string;
  variant?: "underline" | "pill";
  className?: string;
}

/** Controlled tabs with a sliding indicator and roving arrow-key focus. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  hrefFor,
  label,
  id,
  variant = "underline",
  className,
}: TabsProps<T>) {
  const auto = useId();
  const base = id ?? auto;
  const refs = useRef<Array<HTMLElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);
  // Fade the edge that hides more tabs, so a clipped tab bar reads as scrollable
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () =>
      setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [items.length]);

  useEffect(() => {
    const i = items.findIndex((t) => t.id === value);
    refs.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value, items]);

  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent, black 40px" : "black"}, ${edges.right ? "black calc(100% - 40px), transparent" : "black"})`
      : undefined;

  function onKeyDown(e: KeyboardEvent) {
    const enabled = items.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    const cur = enabled.indexOf(items.findIndex((t) => t.id === value));
    let next = -1;
    if (e.key === "ArrowRight") next = enabled[(cur + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(cur - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next < 0) return;
    e.preventDefault();
    const target = items[next];
    onChange?.(target.id);
    refs.current[next]?.focus();
    if (hrefFor) refs.current[next]?.click();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className={cn(
        "relative flex max-w-full items-center overflow-x-auto scrollbar-none",
        variant === "underline" ? "gap-1 border-b border-line" : "gap-1 rounded-[10px] bg-surface-2 p-1",
        className,
      )}
    >
      {items.map((t, i) => {
        const selected = t.id === value;
        const cls = cn(
          "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-200 [&_svg]:size-4",
          variant === "underline" ? "h-11 px-3" : "h-8 rounded-[7px] px-3",
          selected ? "text-ink" : "text-ink-3 hover:text-ink",
          t.disabled && "pointer-events-none opacity-40",
          "focus-visible:outline-offset-[-2px]",
        );
        const inner = (
          <>
            {selected && (
              <motion.span
                layoutId={`${base}-indicator`}
                transition={spring.snappy}
                aria-hidden
                className={cn(
                  "absolute",
                  variant === "underline"
                    ? "inset-x-2 -bottom-px h-[2px] rounded-full bg-brand-500"
                    : "inset-0 rounded-[7px] bg-surface shadow-sm",
                )}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              {t.icon}
              {t.label}
              {t.count !== undefined && t.count !== null && (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold tabular",
                    t.attention
                      ? "bg-mismatch-bg text-mismatch-fg"
                      : selected
                        ? "bg-brand-soft text-brand-ink"
                        : "bg-surface-2 text-ink-3",
                  )}
                >
                  {t.count}
                </span>
              )}
            </span>
          </>
        );
        const common = {
          role: "tab",
          id: `${base}-tab-${t.id}`,
          "aria-selected": selected,
          "aria-controls": `${base}-panel-${t.id}`,
          tabIndex: selected ? 0 : -1,
          className: cls,
        } as const;
        return hrefFor ? (
          <Link
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            to={hrefFor(t.id)}
            replace
            onClick={() => onChange?.(t.id)}
            {...common}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            disabled={t.disabled}
            onClick={() => onChange?.(t.id)}
            {...common}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Panel paired with a Tabs instance that was given the same `tabsId` as its `id`. */
export function TabPanel({
  tabsId,
  value,
  className,
  children,
}: {
  tabsId: string;
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${tabsId}-panel-${value}`}
      aria-labelledby={`${tabsId}-tab-${value}`}
      tabIndex={0}
      className={cn("outline-none focus-visible:outline-2", className)}
    >
      {children}
    </div>
  );
}

/** Small segmented control for filters (not navigation). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "sm",
  className,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[9px] bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-colors duration-200",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              on ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {on && (
              <motion.span
                layoutId={`${id}-seg`}
                transition={spring.snappy}
                aria-hidden
                className="absolute inset-0 rounded-[7px] bg-surface shadow-xs ring-1 ring-line"
              />
            )}
            <span className="relative">{o.label}</span>
            {o.count !== undefined && <span className="relative text-ink-3 tabular">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
