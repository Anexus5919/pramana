import clsx from "clsx";
import { CircleAlert, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "../../api";

export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={clsx("inline-flex items-center gap-2 text-sm text-muted", className)}>
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      {label}
    </span>
  );
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function ErrorBanner({ error, title = "Something went wrong", className }: {
  error: unknown;
  title?: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={clsx(
        "flex items-start gap-2.5 rounded-md border border-mismatch-dot/35 bg-mismatch-bg px-3 py-2.5 text-sm text-mismatch-fg",
        className,
      )}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 break-words">{errorMessage(error)}</p>
      </div>
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
  icon,
}: {
  tone?: "info" | "caution" | "simulated";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const styles = {
    info: "border-pending-dot/30 bg-pending-bg text-pending-fg",
    caution: "border-manual-dot/40 bg-manual-bg text-manual-fg",
    simulated: "border-dashed border-unavail-dot bg-unavail-bg text-unavail-fg",
  }[tone];
  const Icon = tone === "caution" ? TriangleAlert : Info;
  return (
    <div className={clsx("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm", styles, className)}>
      <span aria-hidden className="mt-0.5 shrink-0">
        {icon ?? <Icon className="size-4" />}
      </span>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={clsx(title && "mt-0.5", "leading-relaxed")}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 rounded-full bg-subtle p-3 text-subtle-fg">{icon}</div>}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("relative overflow-hidden rounded-md bg-subtle", className)}>
      <div className="absolute inset-y-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-surface/70 to-transparent" />
    </div>
  );
}
