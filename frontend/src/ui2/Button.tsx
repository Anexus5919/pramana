import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-solid text-white shadow-xs hover:bg-brand-solid-hover active:bg-brand-solid-hover",
  secondary: "border border-line-2 bg-surface text-ink shadow-xs hover:bg-surface-2 active:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3",
  danger: "border border-line-2 bg-surface text-mismatch-fg shadow-xs hover:border-mismatch-dot/50 hover:bg-mismatch-bg",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-sm [&_svg]:size-3.5",
  md: "h-8 px-3 text-sm [&_svg]:size-4",
  lg: "h-10 px-4 text-base [&_svg]:size-4",
};

const iconSizes: Record<ButtonSize, string> = {
  sm: "size-7 [&_svg]:size-3.5",
  md: "size-8 [&_svg]:size-4",
  lg: "size-10 [&_svg]:size-[18px]",
};

/** Classes for anything that should look like a v2 button (links, labels, summary elements). */
export function buttonStyles(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string, iconOnly = false): string {
  return cn(base, variants[variant], iconOnly ? iconSizes[size] : sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the leading icon and blocks clicks */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** The one button. Use variant="primary" for at most one action per screen. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, leadingIcon, trailingIcon, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="animate-spin" /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** A router link styled as a button, for navigation actions. */
export function ButtonLink({ variant = "secondary", size = "md", leadingIcon, trailingIcon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonStyles(variant, size, className)} {...rest}>
      {leadingIcon}
      {children as ReactNode}
      {trailingIcon}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as the native tooltip */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Pressed or selected state, for toggles */
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", active, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={buttonStyles(variant, size, cn(active && "bg-surface-2 text-ink", className), true)}
      {...rest}
    >
      {icon}
    </button>
  );
});
