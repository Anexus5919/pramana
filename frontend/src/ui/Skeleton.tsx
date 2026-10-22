import { cn } from "./cn";

/** Block placeholder with a slow shimmer; shown only while data is loading. */
export function Skeleton({ className, rounded = "md" }: { className?: string; rounded?: "sm" | "md" | "lg" | "full" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block overflow-hidden bg-surface-3/80",
        rounded === "sm" && "rounded-[4px]",
        rounded === "md" && "rounded-control",
        rounded === "lg" && "rounded-card",
        rounded === "full" && "rounded-full",
        className,
      )}
    >
      <span className="absolute inset-0 shimmer-bg animate-shimmer" />
    </span>
  );
}

/** Skeleton lines for text blocks. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn("block space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} rounded="sm" className={cn("h-3", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}

/** Page-level loading block with an accessible label. */
export function LoadingBlock({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-28 w-full" rounded="lg" />
      <Skeleton className="h-64 w-full" rounded="lg" />
    </div>
  );
}
