import { ChevronRight, Play, RotateCcw, Send } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/session";
import { AppStatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Digest } from "../../components/ui/Digest";
import { fmtDate, fmtDateTime } from "../../lib/format";
import type { ApplicationDetail } from "../../types";

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-subtle-fg">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{children}</dd>
    </div>
  );
}

export function WorkspaceHeader({
  app,
  onValidate,
  validating,
  onReplay,
  replaying,
  onRectify,
}: {
  app: ApplicationDetail;
  onValidate: () => void;
  validating: boolean;
  onReplay: () => void;
  replaying: boolean;
  onRectify: () => void;
}) {
  const { is } = useAuth();
  const run = app.latest_run;
  const busy = validating || replaying;

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-subtle-fg">
            <Link to="/dashboard" className="hover:text-fg hover:underline">
              Dashboard
            </Link>
            <ChevronRight aria-hidden className="size-3" />
            <span className="font-mono" aria-current="page">
              {app.id}
            </span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight text-fg">{app.institution.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-mono text-xs">{app.institution.aicte_id}</span>
            <span>{app.category_label}</span>
            <span>AY {app.academic_year}</span>
            <AppStatusBadge status={app.status} />
            <span className="text-xs">Round {app.round}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {is("officer") && (
            <Button
              icon={<Send className="size-4" />}
              onClick={onRectify}
              disabled={busy || !run || app.status === "draft"}
              title={!run ? "Run a validation first" : undefined}
            >
              Request rectification
            </Button>
          )}
          {is("officer", "admin") && (
            <Button
              icon={<RotateCcw className="size-4" />}
              onClick={onReplay}
              loading={replaying}
              disabled={busy || !run || run.status !== "complete"}
              title="Re-run under the pinned ruleset and as-of date and compare digests"
            >
              Replay latest run
            </Button>
          )}
          {is("officer", "verifier", "admin") && (
            <Button
              variant="primary"
              icon={<Play className="size-4" />}
              onClick={onValidate}
              loading={validating}
              disabled={busy || app.status === "draft"}
              title={app.status === "draft" ? "The institution has not submitted this application" : undefined}
            >
              {validating ? "Validating" : "Run validation"}
            </Button>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line bg-subtle/50 px-5 py-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {run ? (
          <>
            <Meta label="Latest run">
              <span className="font-mono text-xs">{run.id}</span>
            </Meta>
            <Meta label="Ruleset">
              <span className="font-mono text-xs">{run.ruleset_id}</span>
            </Meta>
            <Meta label="Report digest">
              <Digest value={run.report_digest} label="report digest" />
            </Meta>
            <Meta label="As of">{fmtDate(run.as_of)}</Meta>
            <Meta label="Finished">{fmtDateTime(run.finished_at)}</Meta>
            <Meta label="Triggered by">
              {run.triggered_by ?? "system"}
              {run.replay_of && <span className="ml-1 text-xs text-subtle-fg">(replay)</span>}
            </Meta>
          </>
        ) : (
          <div className="col-span-full text-sm text-muted">
            Not validated yet.{" "}
            {app.status === "draft"
              ? "The institution has not submitted this application."
              : "Run a validation to produce findings."}
          </div>
        )}
      </dl>
      {run?.status === "failed" && (
        <p role="alert" className="border-t border-line bg-mismatch-bg px-5 py-2 text-sm text-mismatch-fg">
          The latest run failed: {run.error ?? "no error detail recorded"}
        </p>
      )}
    </div>
  );
}
