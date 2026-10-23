import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Neutral count after the label */
  count?: number;
  /** Shows the count in the attention colour; use for at most one tab */
  attention?: boolean;
  /** Route tabs: each tab is a link and the URL is the state */
  href?: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  /** In-page tabs; omit when every item has an href */
  onChange?: (id: string) => void;
  /** Accessible name of the tab list */
  label: string;
  /** Prefix for tab and panel ids, so TabPanel can point back with aria-labelledby */
  idBase?: string;
  className?: string;
}

function Count({ n, attention }: { n: number; attention?: boolean }) {
  return (
    <span className={cn("text-xs tabular-nums", attention ? "font-medium text-mismatch-fg" : "text-ink-3")}>{n}</span>
  );
}

const tabClass = (active: boolean) =>
  cn(
    "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-1 text-sm font-medium whitespace-nowrap transition-colors duration-150",
    active ? "border-brand-solid text-ink" : "border-transparent text-ink-3 hover:border-line-2 hover:text-ink",
  );

/**
 * Underline tabs. With hrefs they are route links (aria-current), otherwise an
 * ARIA tablist with arrow-key movement. Keep to six tabs or fewer.
 */
export function Tabs({ items, value, onChange, label, idBase = "tabs", className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const routed = items.every((i) => i.href);

  if (routed) {
    return (
      <nav aria-label={label} className={cn("flex min-w-0 gap-6 overflow-x-auto border-b border-line scrollbar-none", className)}>
        {items.map((t) => (
          <Link key={t.id} to={t.href!} aria-current={t.id === value ? "page" : undefined} className={tabClass(t.id === value)}>
            {t.label}
            {t.count != null && <Count n={t.count} attention={t.attention} />}
          </Link>
        ))}
      </nav>
    );
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const enabled = items.filter((i) => !i.disabled);
    const at = enabled.findIndex((i) => i.id === value);
    let next: TabItem | undefined;
    if (e.key === "ArrowRight") next = enabled[(at + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange?.(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${idBase}-tab-${next.id}`)}`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex min-w-0 gap-6 overflow-x-auto border-b border-line scrollbar-none", className)}
    >
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            id={`${idBase}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange?.(t.id)}
            className={tabClass(active)}
          >
            {t.label}
            {t.count != null && <Count n={t.count} attention={t.attention} />}
          </button>
        );
      })}
    </div>
  );
}

/** Panel for in-page Tabs. */
export function TabPanel({ idBase = "tabs", value, children, className }: { idBase?: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} className={cn("min-w-0 pt-6", className)}>
      {children}
    </div>
  );
}

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  count?: number;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the group */
  label: string;
  size?: "sm" | "md";
  className?: string;
}

/** A view switch inside a section (for example Open findings / All rules). Two to four options. */
export function SegmentedControl({ options, value, onChange, label, size = "md", className }: SegmentedControlProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-control border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const at = options.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const n = options[(at + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
                if (n) onChange(n.value);
                const sib = (e.currentTarget.parentElement?.children[options.indexOf(n!)] as HTMLButtonElement | undefined) ?? null;
                sib?.focus();
              }
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors duration-150",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm",
              active ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
            {o.count != null && <span className="text-xs text-ink-3 tabular-nums">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
