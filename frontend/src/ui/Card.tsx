import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export type Elevation = "flat" | "raised" | "floating";

const elevations: Record<Elevation, string> = {
  flat: "border border-line bg-surface",
  raised: "border border-line bg-surface shadow-sm",
  floating: "border border-line/70 bg-surface shadow-lg",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  /** Adds a cursor spotlight and hover lift to signal clickability */
  interactive?: boolean;
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { elevation = "raised", interactive = false, padded = false, className, children, onPointerMove, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-card",
        elevations[elevation],
        padded && "p-5",
        interactive &&
          "group/card overflow-hidden transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-brand-200 hover:shadow-md",
        className,
      )}
      onPointerMove={(e) => {
        if (interactive) {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
        }
        onPointerMove?.(e);
      }}
      {...rest}
    >
      {interactive && <Spotlight />}
      {children}
    </div>
  );
});

/** Radial highlight that follows the cursor inside a `group/card` parent. */
export function Spotlight({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100",
        className,
      )}
      style={{
        background:
          "radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklab, var(--brand-400) 12%, transparent), transparent 60%)",
      }}
    />
  );
}

export interface SectionCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  elevation?: Elevation;
  /** Removes body padding, for edge-to-edge lists */
  flush?: boolean;
  bodyClassName?: string;
}

export function SectionCard({
  title,
  eyebrow,
  description,
  actions,
  footer,
  elevation = "raised",
  flush = false,
  className,
  bodyClassName,
  children,
  ...rest
}: SectionCardProps) {
  const hasHeader = title || eyebrow || description || actions;
  return (
    <section className={cn("relative rounded-card", elevations[elevation], className)} {...rest}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="font-display text-md font-semibold tracking-title text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-3 text-pretty">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "px-5 pb-5", flush && hasHeader && "border-t border-line", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-line px-5 py-3 text-sm text-ink-3">{footer}</footer>}
    </section>
  );
}
