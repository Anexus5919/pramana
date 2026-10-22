import { Check, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { spring } from "./motion";

const control =
  "w-full min-w-0 rounded-control border bg-surface text-[14px] text-ink placeholder:text-ink-4 shadow-xs transition-[border-color,box-shadow] duration-200 outline-none hover:border-ink-4/60 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3";

function invalidCls(invalid?: boolean) {
  return invalid
    ? "border-mismatch-dot/70 focus-visible:border-mismatch-dot focus-visible:ring-mismatch-dot/20"
    : "border-line-2";
}

export function Label({ className, children, required, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("block text-sm font-medium text-ink-2", className)} {...rest}>
      {children}
      {required && (
        <span className="ml-0.5 text-mismatch-fg" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <motion.p
      id={id}
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-1.5 text-xs font-medium text-mismatch-fg"
      role="alert"
    >
      {children}
    </motion.p>
  );
}

export interface FieldProps {
  label: ReactNode;
  /** A single control; Field wires id, aria-invalid and aria-describedby */
  children: ReactElement;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

/** Label, control, hint and error text wired together for accessibility. */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const auto = useId();
  const childProps = isValidElement<{ id?: string }>(children) ? children.props : {};
  const id = childProps.id ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const described = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": described,
        required,
      })
    : children;
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id} required={required} className="mb-1.5">
        {label}
      </Label>
      {child}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-3">
          {hint}
        </p>
      )}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  inputSize?: "sm" | "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leadingIcon, trailing, inputSize = "md", className, ...rest },
  ref,
) {
  const inv = invalid || rest["aria-invalid"] === true;
  const h = inputSize === "sm" ? "h-8 text-sm" : inputSize === "lg" ? "h-12 text-base" : "h-10";
  if (!leadingIcon && !trailing) {
    return <input ref={ref} className={cn(control, invalidCls(inv), h, "px-3", className)} {...rest} />;
  }
  return (
    <div className={cn("relative", className)}>
      {leadingIcon && (
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3 [&_svg]:size-4">{leadingIcon}</span>
      )}
      <input
        ref={ref}
        className={cn(control, invalidCls(inv), h, leadingIcon ? "pl-9" : "pl-3", trailing ? "pr-10" : "pr-3")}
        {...rest}
      />
      {trailing && <span className="absolute top-1/2 right-2 -translate-y-1/2">{trailing}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className, rows = 4, ...rest }, ref) {
    const inv = invalid || rest["aria-invalid"] === true;
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(control, invalidCls(inv), "resize-y px-3 py-2 leading-relaxed", className)}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; selectSize?: "sm" | "md" }>(
  function Select({ invalid, className, children, selectSize = "md", ...rest }, ref) {
    const inv = invalid || rest["aria-invalid"] === true;
    return (
      <div className={cn("relative", className)}>
        <select
          ref={ref}
          className={cn(control, invalidCls(inv), "appearance-none pr-9 pl-3", selectSize === "sm" ? "h-8 text-sm" : "h-10")}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" />
      </div>
    );
  },
);

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ checked, onChange, label, description, className, disabled, id, ...rest }: CheckboxProps) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn("group inline-flex items-start gap-2.5", disabled ? "opacity-50" : "cursor-pointer", className)}>
      <span className="relative mt-0.5 inline-flex size-[18px] shrink-0">
        <input
          id={cid}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 m-0 cursor-[inherit] appearance-none rounded-[5px] border border-line-2 bg-surface transition-colors checked:border-brand-solid checked:bg-brand-solid group-hover:border-ink-4 checked:group-hover:border-brand-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          {...rest}
        />
        <motion.span
          aria-hidden
          initial={false}
          animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }}
          transition={spring.snappy}
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"
        >
          <Check className="size-3" strokeWidth={3.2} />
        </motion.span>
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-ink">{label}</span>}
          {description && <span className="block text-xs text-ink-3">{description}</span>}
        </span>
      )}
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** Visually hide the label but keep it for screen readers */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, hideLabel, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <span className={cn("inline-flex items-center gap-2.5", disabled && "opacity-50", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200",
          checked ? "bg-brand-solid" : "bg-line-2",
        )}
      >
        <motion.span
          aria-hidden
          layout
          transition={spring.snappy}
          className={cn("block size-4 rounded-full bg-white shadow-sm", checked && "ml-auto")}
        />
      </button>
      <label htmlFor={id} className={cn("text-sm font-medium text-ink-2", hideLabel && "sr-only", !disabled && "cursor-pointer")}>
        {label}
      </label>
    </span>
  );
}
