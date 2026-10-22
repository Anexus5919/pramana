import { CircleCheck, CircleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { fmtDate } from "../../lib/format";
import type { ReplayResult } from "../../types";
import { Tag } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Dialog } from "../../ui/Dialog";
import { dur, ease, spring } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { ErrorState } from "../../ui/States";

const STEP = 0.012;

function DigestGrid({ value, compare, animate, label }: { value: string; compare?: string; animate: boolean; label: string }) {
  const chars = value.split("");
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-ink-3">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="font-mono">{value.length} hex characters</span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${value}`}
        className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-[3px] font-mono text-[13px] sm:grid-cols-[repeat(32,minmax(0,1fr))]"
      >
        {chars.map((c, i) => {
          const match = compare === undefined ? null : compare[i] === c;
          return (
            <motion.span
              key={i}
              initial={animate ? { opacity: 0, y: -6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: animate ? i * STEP : 0, duration: dur.ui, ease: ease.out }}
              className={cn(
                "flex h-6 items-center justify-center rounded-[4px] transition-colors duration-300",
                match === null && "bg-surface-2 text-ink-3",
                match === true && "bg-verified-bg text-verified-fg",
                match === false && "bg-mismatch-bg font-semibold text-mismatch-fg",
              )}
              style={animate && match !== null ? { transitionDelay: `${i * STEP * 1000 + 180}ms` } : undefined}
            >
              {c}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

export function ReplayDialog({
  open,
  onClose,
  pending,
  result,
  error,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  result: ReplayResult | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const orig = result?.original.report_digest ?? "";
  const rep = result?.replay.report_digest ?? "";

  useEffect(() => {
    setSettled(false);
    if (!result) return;
    const t = window.setTimeout(() => setSettled(true), reduce ? 0 : Math.max(orig.length, 64) * STEP * 1000 + 500);
    return () => window.clearTimeout(t);
  }, [result, orig.length, reduce]);

  const same = !!result?.report_identical;
  const diffCount = rep.split("").filter((c, i) => orig[i] !== c).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Replay the latest run"
      description="The run is executed again under its pinned ruleset and as-of date. Identical digests mean the same inputs produced the same report."
      footer={
        <Button variant={settled ? "primary" : "ghost"} onClick={onClose}>
          Done
        </Button>
      }
    >
      {error ? (
        <ErrorState error={error} title="Replay could not run" onRetry={onRetry} />
      ) : (
        <div className="space-y-5">
          {result ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <Tag variant="mono">{result.original.ruleset_id}</Tag>
                <span>As of {fmtDate(result.original.as_of)}</span>
                <span aria-hidden className="text-ink-4">/</span>
                <span>
                  Inputs{" "}
                  <span className={cn("font-semibold", result.inputs_identical ? "text-verified-fg" : "text-mismatch-fg")}>
                    {result.inputs_identical ? "identical" : "changed"}
                  </span>
                </span>
              </div>
              <DigestGrid label="Original report digest" value={orig} animate={false} />
              <DigestGrid label="Replay report digest" value={rep} compare={orig} animate={!reduce} />
            </>
          ) : (
            <div className="space-y-4" role="status" aria-live="polite">
              <span className="sr-only">Replaying the run</span>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <p className="text-sm text-ink-3">{pending ? "Replaying on the server" : "Waiting"}</p>
            </div>
          )}

          <AnimatePresence>
            {result && settled && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={spring.soft}
                className={cn(
                  "flex items-start gap-3 rounded-card border p-4",
                  same ? "border-verified-dot/30 bg-verified-bg" : "border-mismatch-dot/30 bg-mismatch-bg",
                )}
                role="status"
              >
                <motion.span initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.snappy, delay: 0.08 }}>
                  {same ? <CircleCheck className="size-8 text-verified-dot" /> : <CircleAlert className="size-8 text-mismatch-dot" />}
                </motion.span>
                <div className="min-w-0">
                  <div className={cn("font-display text-2xl font-semibold tracking-title", same ? "text-verified-fg" : "text-mismatch-fg")}>
                    {same ? "Reproduced identically" : "Differs"}
                  </div>
                  <p className="mt-1 text-sm text-ink-2 text-pretty">
                    {same
                      ? "Every character of the replay digest matches the original. The same evidence under the same rules gives the same report."
                      : `${diffCount} of ${rep.length} characters differ. Rules and the as-of date were pinned, so the difference comes from external state that can change between runs, such as peer applications in the same year or whether an issuer source was available.`}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Dialog>
  );
}
