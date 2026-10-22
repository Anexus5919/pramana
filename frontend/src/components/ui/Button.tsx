import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-on shadow-sm hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-fg shadow-xs hover:bg-subtle",
  subtle: "bg-primary-soft text-primary-ink hover:brightness-95 dark:hover:brightness-125",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
  danger: "border border-mismatch-dot/40 bg-mismatch-bg text-mismatch-fg hover:brightness-95 dark:hover:brightness-125",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
