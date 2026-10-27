import { CircleAlert, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "../api";
import { Button } from "./Button";
import { useT } from "../i18n";
import { cn } from "./cn";
import { dur, ease } from "./motion";

function Voxel({ x, y, top, left, right, delay }: { x: number; y: number; top: string; left: string; right: string; delay: number }) {
  return (
    <motion.g initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: dur.panel, ease: ease.out }}>
      <path d={`M${x} ${y} l18 10 -18 10 -18 -10Z`} style={{ fill: top }} />
      <path d={`M${x - 18} ${y + 10} l18 10 v20 l-18 -10Z`} style={{ fill: left }} />
      <path d={`M${x + 18} ${y + 10} l-18 10 v20 l18 -10Z`} style={{ fill: right }} />
    </motion.g>
  );
}

/** Three stacked voxel blocks in brand tints; the empty-state illustration. */
export function BlockStack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 84" className={cn("h-20 w-24", className)} aria-hidden>
      <Voxel x={30} y={24} top="var(--brand-200)" left="var(--brand-400)" right="var(--brand-600)" delay={0.05} />
      <Voxel x={66} y={24} top="var(--lilac)" left="var(--brand-300)" right="var(--brand-500)" delay={0.12} />
      <Voxel x={48} y={4} top="var(--brand-100)" left="var(--brand-300)" right="var(--brand-500)" delay={0.22} />
    </svg>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Replaces the block illustration */
  icon?: ReactNode;
  /** Use the sky gradient backdrop for prominent empty states */
  sky?: boolean;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ title, description, action, icon, sky = false, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        sky && "rounded-card bg-sky-soft",
        className,
      )}
    >
      {icon ?? (!compact && <BlockStack />)}
      <div className="max-w-sm">
        <h3 className={cn("font-display font-semibold text-ink", compact ? "text-base" : "text-md")}>{title}</h3>
        {description && <p className="mt-1 text-sm text-ink-3 text-pretty">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  error: unknown;
  title?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}

/** Shows the API error detail, the HTTP status and an optional retry. */
export function ErrorState({ error, title, onRetry, retrying, compact = false, className }: ErrorStateProps) {
  const t = useT();
  const status = error instanceof ApiError ? error.status : null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-card border border-mismatch-dot/25 bg-mismatch-bg text-left",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-mismatch-dot" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-mismatch-fg">{title ?? t("Something went wrong")}</div>
        <p className="mt-0.5 text-sm break-words text-ink-2">{errorMessage(error)}</p>
        {status !== null && status > 0 && <p className="mt-1 font-mono text-[0.6875rem] text-ink-3">HTTP {status}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="ghost" leadingIcon={<RotateCcw />} onClick={onRetry} loading={retrying}>
          {t("Retry")}
        </Button>
      )}
    </div>
  );
}
