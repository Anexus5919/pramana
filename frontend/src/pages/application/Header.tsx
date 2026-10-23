import { FileWarning, History, Play } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { appStatusMeta, humanize } from "../../lib/labels";
import { fmtDate, fmtRelative } from "../../lib/format";
import type { ApplicationDetail } from "../../types";
import { Tag } from "../../ui/Badge";
import { StatusPill } from "../../ui/Blocks";
import { Button } from "../../ui/Button";
import { Digest } from "../../ui/Digest";
import { dur, ease } from "../../ui/motion";
import { appTitleLayoutId } from "../../ui/shared";
import { Skeleton } from "../../ui/Skeleton";
import { appStatusTone } from "../../ui/tone";
import { Tooltip } from "../../ui/Tooltip";

export function HeaderTitle({ appId, name }: { appId: string; name: string | undefined }) {
  return (
    <motion.h1
      layoutId={appTitleLayoutId(appId)}
      className="font-display text-2xl leading-tight font-semibold tracking-title text-ink text-balance sm:text-[32px] sm:tracking-[-0.025em]"
    >
      {name ?? <Skeleton className="h-9 w-80 max-w-full" />}
    </motion.h1>
  );
}

export function WorkspaceHeader({
  app,
  canValidate,
  canReplay,
  canRectify,
  validating,
  onValidate,
  onReplay,
  onRectify,
  extra,
}: {
  app: ApplicationDetail;
  canValidate: boolean;
  canReplay: boolean;
  canRectify: boolean;
  validating: boolean;
  onValidate: () => void;
  onReplay: () => void;
  onRectify: () => void;
  /** Role-specific actions shown before the standard ones */
  extra?: ReactNode;
}) {
  const run = app.latest_run;
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-[420px]">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.panel, ease: ease.out }}
            className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-ink-3"
          >
            <span className="font-mono text-ink-2">{app.institution.aicte_id}</span>
            <span aria-hidden className="text-ink-4">/</span>
            <span className="font-mono">{app.id}</span>
            <span aria-hidden className="text-ink-4">/</span>
            <span>
              {app.institution.district}, {app.institution.state}
            </span>
          </motion.div>
          <HeaderTitle appId={app.id} name={app.institution.name} />
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.panel, ease: ease.out, delay: 0.06 }}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <StatusPill status={app.status} tone={appStatusTone(app.status)} label={appStatusMeta[app.status]?.label ?? humanize(app.status)} explain={false} size="md" />
            <span className="inline-flex h-7 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink-2">{app.category_label}</span>
            <span className="inline-flex h-7 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink-2">
              AY {app.academic_year}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink-2">Round {app.round}</span>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.panel, ease: ease.out, delay: 0.1 }}
          className="flex flex-wrap items-center gap-2"
        >
          {extra}
          {canRectify && (
            <Button variant="ghost" leadingIcon={<FileWarning />} onClick={onRectify}>
              Request rectification
            </Button>
          )}
          {canReplay && run && (
            <Tooltip content="Re-run the latest run under its pinned ruleset and as-of date, then compare digests.">
              <Button variant="secondary" leadingIcon={<History />} onClick={onReplay}>
                Replay
              </Button>
            </Tooltip>
          )}
          {canValidate && (
            <Button magnetic leadingIcon={<Play />} loading={validating} onClick={onValidate}>
              {validating ? "Validating" : "Run validation"}
            </Button>
          )}
        </motion.div>
      </div>

      {run && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: dur.panel, delay: 0.14 }}
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface/70 px-3.5 py-2 text-xs text-ink-3"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="eyebrow">Latest run</span>
            <Tag variant="mono">{run.ruleset_id}</Tag>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            Report <Digest value={run.report_digest} label="report digest" head={10} tail={6} />
          </span>
          <span>
            As of <span className="font-medium text-ink-2">{fmtDate(run.as_of)}</span>
          </span>
          <span>
            Triggered by <span className="font-medium text-ink-2">{run.triggered_by ?? "system"}</span>
            {run.finished_at && <span className="text-ink-4">, {fmtRelative(run.finished_at)}</span>}
          </span>
          {run.replay_of && <Tag variant="brand">Replay</Tag>}
        </motion.div>
      )}
    </header>
  );
}
