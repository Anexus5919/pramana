import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
  as: As = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <As className={clsx("rounded-lg border border-line bg-surface shadow-xs", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-subtle-fg">{icon}</span>}
        <div className="min-w-0">
          <h2 id={id} className="text-sm font-semibold text-fg">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-subtle-fg">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={clsx("text-[11px] font-semibold tracking-wider text-subtle-fg uppercase", className)}>{children}</h3>
  );
}
