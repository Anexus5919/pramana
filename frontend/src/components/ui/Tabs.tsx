import clsx from "clsx";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  label,
  idPrefix = "tab",
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  idPrefix?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(items[next].id);
    }
  }

  return (
    <div role="tablist" aria-label={label} className={clsx("flex gap-1 overflow-x-auto", className)}>
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              "relative inline-flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2.5 text-sm font-medium transition-colors",
              selected ? "text-primary-ink" : "text-muted hover:text-fg",
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={clsx(
                  "rounded-full px-1.5 text-[11px] leading-4 tabular-nums",
                  selected ? "bg-primary-soft text-primary-ink" : "bg-subtle text-subtle-fg",
                )}
              >
                {t.count}
              </span>
            )}
            <span
              aria-hidden
              className={clsx(
                "absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors",
                selected ? "bg-primary-ink" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  idPrefix = "tab",
  children,
  className,
}: {
  id: string;
  idPrefix?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-${id}`}
      tabIndex={-1}
      className={clsx("animate-fade-in outline-none", className)}
    >
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            o.value === value ? "bg-surface text-fg shadow-xs" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
