import clsx from "clsx";
import { CircleCheck, Gauge, Landmark, ListChecks, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader } from "../../../components/ui/Card";
import { EmptyState, Skeleton } from "../../../components/ui/Feedback";
import { KeyValue } from "../../../components/ui/KeyValue";
import { evidenceLevelClass } from "../../../components/ui/tone";
import { fmtValue, sum } from "../../../lib/format";
import { EVIDENCE_CLASSES, evidenceClassMeta } from "../../../lib/labels";
import type { ApplicationDetail, RunFull } from "../../../types";
import { DeclaredDataView } from "../../shared/DeclaredDataView";
import { countStatuses, SeverityChips, StatusBar, VerificationMix } from "../../shared/Summaries";
import { appPath } from "../links";
import { StageTimeline } from "../StageTimeline";

function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 shadow-xs">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl leading-none font-semibold text-fg tabular-nums">{value}</div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function TrustLadder({ app, run }: { app: ApplicationDetail; run: RunFull }) {
  const counts = run.by_evidence_class ?? {};
  const max = Math.max(1, ...Object.values(counts));
  const extra = Object.keys(counts).filter((k) => !(k in evidenceClassMeta));
  return (
    <Card aria-labelledby="ladder-title">
      <CardHeader
        id="ladder-title"
        icon={<Gauge className="size-4" />}
        title="Trust ladder"
        subtitle="Findings by the strength of the evidence behind them, strongest first. Weaker rungs need more human judgement."
      />
      <ol className="divide-y divide-line">
        {[...EVIDENCE_CLASSES, ...extra].map((ec) => {
          const m = evidenceClassMeta[ec] ?? { label: ec, meaning: "", level: 7 };
          const n = counts[ec] ?? 0;
          return (
            <li key={ec}>
              <Link
                to={`${appPath(app.id, "findings")}?ec=${encodeURIComponent(ec)}`}
                className={clsx(
                  "grid grid-cols-[34px_120px_minmax(0,1fr)_minmax(80px,180px)_32px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle/60",
                  !n && "opacity-60",
                )}
                aria-label={`${m.label}: ${n} findings. ${m.meaning}`}
              >
                <span
                  className={clsx(
                    "inline-flex h-6 items-center justify-center rounded-[5px] border font-mono text-[11px] font-semibold",
                    evidenceLevelClass[m.level],
                  )}
                >
                  E{m.level}
                </span>
                <span className="text-sm font-medium text-fg">{m.label}</span>
                <span className="truncate text-xs text-muted">{m.meaning}</span>
                <span className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden>
                  <span
                    className="block h-full origin-left animate-grow rounded-full bg-primary/70"
                    style={{ width: `${(n / max) * 100}%` }}
                  />
                </span>
                <span className="text-right text-sm font-semibold text-fg tabular-nums">{n}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function OverviewTab({
  app,
  run,
  runLoading,
}: {
  app: ApplicationDetail;
  run: RunFull | undefined;
  runLoading: boolean;
}) {
  const inst = app.institution;
  const docCounts = countStatuses(run?.document_status ?? {});
  const passed = run?.checklist.filter((c) => c.outcome === "pass").length ?? 0;
  const failed = run?.checklist.filter((c) => c.outcome === "fail").length ?? 0;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        {runLoading ? (
          <Skeleton className="h-80" />
        ) : !run ? (
          <Card>
            <EmptyState icon={<Workflow className="size-6" />} title="No validation run yet">
              {app.status === "draft"
                ? "The application is still a draft. Results appear once the institution submits it."
                : "Use Run validation to process documents, evaluate rules, verify with issuers and check other applications."}
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Findings" value={run.findings ?? 0}>
                <SeverityChips bySeverity={run.by_severity} />
              </Stat>
              <Stat label="Review order" value={run.review_priority ?? 0}>
                <p className="text-xs text-subtle-fg">Sort key for the queue only; not a score</p>
              </Stat>
              <Stat label="Rules evaluated" value={run.checklist.length}>
                <p className="text-xs text-muted">
                  <span className="font-semibold text-verified-fg">{passed} pass</span>,{" "}
                  <span className="font-semibold text-mismatch-fg">{failed} fail</span>,{" "}
                  {run.checklist.length - passed - failed} other
                </p>
              </Stat>
              <Stat label="Documents checked" value={sum(Object.values(docCounts))}>
                <StatusBar counts={docCounts} className="mb-1.5" />
                <VerificationMix counts={docCounts} />
              </Stat>
            </div>
            <TrustLadder app={app} run={run} />
            <Card aria-labelledby="stages-title">
              <CardHeader
                id="stages-title"
                icon={<Workflow className="size-4" />}
                title="Pipeline stages"
                subtitle={`Run ${run.id}, engine ${run.engine_version}`}
              />
              <div className="px-4 py-3">
                <StageTimeline stages={run.stages ?? []} />
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="space-y-5">
        {run && (
          <Card aria-labelledby="resolved-title">
            <CardHeader
              id="resolved-title"
              icon={<CircleCheck className="size-4" />}
              title="Resolved since previous run"
              subtitle={run.previous_run ? `Compared with ${run.previous_run}` : "This is the first run"}
            />
            {run.resolved_since_previous.length ? (
              <ul className="divide-y divide-line">
                {run.resolved_since_previous.map((r, i) => (
                  <li key={`${r.code}-${i}`} className="flex items-start gap-2.5 px-4 py-2">
                    <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-verified-dot" />
                    <span className="min-w-0">
                      <span className="block text-sm text-fg">{r.title}</span>
                      <span className="block font-mono text-[11px] text-subtle-fg">{r.code}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-subtle-fg">
                {run.previous_run ? "No findings from the previous run were resolved." : "Nothing to compare yet."}
              </p>
            )}
          </Card>
        )}

        <Card aria-labelledby="declared-title">
          <CardHeader
            id="declared-title"
            icon={<ListChecks className="size-4" />}
            title="Declared application data"
            subtitle="Typed by the institution; a claim until checked against documents or records"
          />
          <div className="px-4 py-3">
            <DeclaredDataView declared={app.declared ?? {}} />
          </div>
        </Card>

        <Card aria-labelledby="inst-title">
          <CardHeader
            id="inst-title"
            icon={<Landmark className="size-4" />}
            title="Institution master record"
            subtitle="Synthetic stand-in for the AICTE institution master"
          />
          <div className="px-4 py-3">
            <KeyValue
              cols={2}
              items={[
                { label: "AICTE ID", value: <span className="font-mono text-xs">{inst.aicte_id}</span> },
                { label: "AISHE code", value: fmtValue(inst.aishe_code) },
                { label: "Type", value: inst.institution_type },
                { label: "Established", value: fmtValue(inst.established_year) },
                { label: "Society / trust", value: fmtValue(inst.society_name) },
                { label: "Women only", value: inst.women_only ? "Yes" : "No" },
                { label: "Address", value: [inst.address, inst.district, inst.state, inst.pincode].filter(Boolean).join(", ") },
                {
                  label: "Campus location",
                  value:
                    inst.latitude != null && inst.longitude != null
                      ? `${inst.latitude.toFixed(4)}, ${inst.longitude.toFixed(4)}`
                      : "Not on record",
                },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
