import clsx from "clsx";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const inputClass =
  "block w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-fg shadow-xs placeholder:text-subtle-fg focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/50 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted aria-[invalid=true]:border-mismatch-dot";

export function Label({
  htmlFor,
  children,
  hint,
  required,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">
      {children}
      {required && (
        <span className="text-mismatch-fg" aria-hidden>
          {" "}
          *
        </span>
      )}
      {hint && <span className="ml-1 font-normal text-subtle-fg">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputClass, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputClass, "min-h-20 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputClass, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("grid gap-3 sm:grid-cols-2", className)}>{children}</div>;
}
