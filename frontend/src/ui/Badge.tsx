import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { toneClass, type Tone } from "./tone";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone | "neutral";
  variant?: "soft" | "outline" | "dot";
  size?: "sm" | "md";
  icon?: ReactNode;
}

/** Compact status label. `dot` shows a coloured dot before neutral text. */
export function Badge({ tone = "neutral", variant = "soft", size = "sm", icon, className, children, ...rest }: BadgeProps) {
  const t = tone === "neutral" ? null : toneClass[tone];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
        size === "sm" ? "h-6 px-2.5 text-xs" : "h-7 px-3 text-sm",
        variant === "soft" && (t ? cn(t.bg, t.fg) : "bg-surface-2 text-ink-2"),
        variant === "outline" && (t ? cn("border bg-transparent", t.border, t.fg) : "border border-line-2 text-ink-2"),
        variant === "dot" && "border border-line bg-surface text-ink-2",
        className,
      )}
      {...rest}
    >
      {variant === "dot" && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", t ? t.dot : "bg-ink-4")} />}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** `demo` marks simulated data and must be visible wherever it applies */
  variant?: "neutral" | "brand" | "demo" | "mono";
}

/** Small uppercase or mono label for metadata, codes and SIMULATED markers. */
export function Tag({ variant = "neutral", className, children, ...rest }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 text-[10.5px] font-semibold",
        variant === "neutral" && "bg-surface-2 text-ink-2 uppercase tracking-[0.08em]",
        variant === "brand" && "bg-brand-soft text-brand-ink uppercase tracking-[0.08em]",
        variant === "demo" &&
          "border border-dashed border-manual-dot/60 bg-manual-bg text-manual-fg uppercase tracking-[0.1em]",
        variant === "mono" && "bg-surface-2 font-mono text-[11px] font-medium text-ink-2",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export function Kbd({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-2 bg-surface px-1 font-sans text-[11px] font-medium text-ink-3 shadow-[0_1px_0_var(--line-2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}
