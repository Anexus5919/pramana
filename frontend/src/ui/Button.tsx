import { motion, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "./cn";
import { tap } from "./motion";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium rounded-control transition-[background-color,color,border-color,box-shadow,opacity,transform] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-solid text-white hover:bg-brand-solid-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12),0_1px_2px_rgb(43_15_92/0.25),0_6px_16px_-6px_rgb(139_61_255/0.55)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.3),inset_0_-1px_0_rgb(0_0_0/0.12),0_1px_2px_rgb(43_15_92/0.25),0_10px_24px_-8px_rgb(139_61_255/0.65)]",
  secondary:
    "border border-ink/85 text-ink bg-transparent hover:bg-ink hover:text-canvas dark:border-ink/60",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  soft: "bg-brand-soft text-brand-ink hover:bg-brand-100",
  danger: "border border-mismatch-dot/40 bg-mismatch-bg text-mismatch-fg hover:border-mismatch-dot/70 hover:bg-mismatch-bg/70",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 [&_svg]:size-3.5",
  md: "h-10 px-4 text-[14px] [&_svg]:size-4",
  lg: "h-12 px-6 text-base [&_svg]:size-[18px]",
};

const iconSizes: Record<ButtonSize, string> = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-10 [&_svg]:size-[18px]",
  lg: "size-12 [&_svg]:size-5",
};

/** Classes for a button-styled element. Pass `iconOnly` for square icon buttons. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
  iconOnly = false,
): string {
  return cn(base, variants[variant], iconOnly ? iconSizes[size] : sizes[size], className);
}

/** Three blocks lighting in sequence; shown only while a request is pending. */
export function BlockLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex items-end gap-[3px]", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block size-[5px] rounded-[1.5px] bg-current animate-block-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Pulls toward the cursor by up to 6px. Use on at most one CTA per page. */
  magnetic?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    magnetic = false,
    disabled,
    className,
    children,
    type = "button",
    onPointerMove,
    onPointerLeave,
    style,
    ...rest
  },
  ref,
) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 300, damping: 20, mass: 0.4 });
  const y = useSpring(my, { stiffness: 300, damping: 20, mass: 0.4 });
  const pull = magnetic && !reduce;

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileTap={disabled || loading ? undefined : tap}
      className={buttonClasses(variant, size, className)}
      style={pull ? { ...style, x, y } : style}
      onPointerMove={(e) => {
        if (pull) {
          const r = e.currentTarget.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          mx.set(Math.max(-6, Math.min(6, dx * 0.18)));
          my.set(Math.max(-6, Math.min(6, dy * 0.3)));
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        mx.set(0);
        my.set(0);
        onPointerLeave?.(e);
      }}
      {...rest}
    >
      {variant === "primary" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/18 to-transparent"
        />
      )}
      {loading ? <BlockLoader /> : leadingIcon}
      {children !== undefined && <span className="relative">{children}</span>}
      {!loading && trailingIcon}
    </motion.button>
  );
});

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** A router Link that looks like a Button. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, cn("active:scale-[0.97]", className))} {...rest}>
      {variant === "primary" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/18 to-transparent"
        />
      )}
      {leadingIcon}
      <span className="relative">{children as ReactNode}</span>
      {trailingIcon}
    </Link>
  );
}

export interface IconButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  /** Accessible name; also used as the native title */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", loading, active, className, type = "button", disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      whileTap={disabled ? undefined : tap}
      className={buttonClasses(variant, size, cn(active && "bg-surface-2 text-ink", className), true)}
      {...rest}
    >
      {loading ? <BlockLoader /> : icon}
    </motion.button>
  );
});
