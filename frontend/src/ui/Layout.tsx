import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { dur, ease } from "./motion";

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra row under the header, e.g. tabs or meta chips */
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-title text-ink sm:text-3xl sm:tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-2 text-base text-ink-3 text-pretty">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  /** Render the value in mono, for codes and document values */
  mono?: boolean;
  hint?: ReactNode;
}

export interface KeyValueProps {
  items: KeyValueItem[];
  /** Two columns on wide screens */
  columns?: 1 | 2;
  /** Label width on wide screens */
  labelWidth?: number;
  className?: string;
}

/** Definition list of label and value pairs with hairline separators. */
export function KeyValue({ items, columns = 1, labelWidth = 160, className }: KeyValueProps) {
  return (
    <dl className={cn("grid gap-x-8", columns === 2 && "md:grid-cols-2", className)}>
      {items.map((it, i) => (
        <div
          key={i}
          className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[var(--kv-label)_minmax(0,1fr)]"
          style={{ ["--kv-label" as string]: `${labelWidth}px` }}
        >
          <dt className="text-sm text-ink-3">{it.label}</dt>
          <dd className={cn("min-w-0 text-sm break-words text-ink", it.mono && "font-mono text-[13px]")}>
            {it.value}
            {it.hint && <div className="mt-0.5 text-xs text-ink-3">{it.hint}</div>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Thin labelled divider for grouping inside cards. */
export function Divider({ label, className }: { label?: ReactNode; className?: string }) {
  if (!label) return <hr className={cn("border-line", className)} />;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="eyebrow">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
