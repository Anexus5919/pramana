import { CircleCheck, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api";
import { ButtonLink } from "../../components/ui/Button";
import { EmptyState, ErrorBanner, PageLoading } from "../../components/ui/Feedback";
import { TabPanel, Tabs } from "../../components/ui/Tabs";
import { fmtMs, sum } from "../../lib/format";
import { appPath, TABS, type WorkspaceTab } from "./links";
import { RectificationDialog } from "./RectificationDialog";
import { ReplayDialog } from "./ReplayDialog";
import { RunProgress } from "./StageTimeline";
import { AuditTab } from "./tabs/AuditTab";
import { ChecklistTab } from "./tabs/ChecklistTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { FindingsTab } from "./tabs/FindingsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { RelationshipsTab } from "./tabs/RelationshipsTab";
import { RunsTab } from "./tabs/RunsTab";
import { VerificationTab } from "./tabs/VerificationTab";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { useApplication, useFindings, useReplay, useRun, useValidate, useVerifications } from "./useWorkspace";

const TAB_LABEL: Record<WorkspaceTab, string> = {
  overview: "Overview",
  findings: "Findings",
  checklist: "Checklist",
  documents: "Documents",
  verification: "Verification",
  relationships: "Relationships",
  audit: "Audit",
  runs: "Runs",
};

export function ApplicationWorkspace() {
  const { appId = "", tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab: WorkspaceTab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as WorkspaceTab) : "overview";

  const appQ = useApplication(appId);
  const app = appQ.data;
  const runQ = useRun(app?.latest_run?.id);
  const findingsQ = useFindings(appId, !!app);
  const verQ = useVerifications(appId, !!app);
  const validate = useValidate(appId);
  const replay = useReplay(appId);
  const [replayOpen, setReplayOpen] = useState(false);
  const [rectifyOpen, setRectifyOpen] = useState(false);
  const [rectifyPreselect, setRectifyPreselect] = useState<string[] | undefined>();
  const [showDone, setShowDone] = useState(false);

  if (appQ.isPending) return <PageLoading label="Loading application" />;
  if (appQ.error || !app) {
    const notFound = appQ.error instanceof ApiError && appQ.error.status === 404;
    return notFound ? (
      <EmptyState
        title="Application not found"
        action={
          <ButtonLink to="/dashboard" variant="primary">
            Back to dashboard
          </ButtonLink>
        }
      >
        No application with ID {appId} is visible to you.
      </EmptyState>
    ) : (
      <ErrorBanner error={appQ.error} title="Could not load the application" />
    );
  }

  const findings = findingsQ.data ?? [];
  const run = runQ.data;
  const counts: Partial<Record<WorkspaceTab, number>> = {
    findings: findingsQ.data ? findings.length : undefined,
    checklist: run?.checklist.length,
    documents: app.documents.filter((d) => !d.superseded).length,
    verification: verQ.data?.length,
  };

  function runValidation() {
    setShowDone(false);
    validate.mutate(undefined, { onSuccess: () => setShowDone(true) });
  }

  function startReplay() {
    if (!app?.latest_run) return;
    replay.reset();
    setReplayOpen(true);
    replay.mutate(app.latest_run.id);
  }

  return (
    <div>
      <WorkspaceHeader
        app={app}
        onValidate={runValidation}
        validating={validate.isPending}
        onReplay={startReplay}
        replaying={replay.isPending}
        onRectify={() => {
          setRectifyPreselect(undefined);
          setRectifyOpen(true);
        }}
      />
      {validate.isPending && (
        <div className="mb-4">
          <RunProgress />
        </div>
      )}
      {!!validate.error && <ErrorBanner error={validate.error} title="Validation could not run" className="mb-4" />}
      {showDone && validate.data && !validate.isPending && (
        <div
          role="status"
          className="mb-4 flex animate-fade-in items-center gap-3 rounded-lg border border-verified-dot/35 bg-verified-bg px-4 py-2.5 text-sm text-verified-fg"
        >
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            {validate.data.status === "complete"
              ? `Validation complete: ${validate.data.findings ?? 0} findings, ${validate.data.checklist.length} rules evaluated in ${fmtMs(sum(validate.data.stages.map((s) => s.ms)))}.`
              : `Validation ${validate.data.status}: ${validate.data.error ?? ""}`}
          </span>
          <button
            type="button"
            className="rounded p-1 hover:bg-verified-dot/15"
            aria-label="Dismiss"
            onClick={() => setShowDone(false)}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="border-b border-line">
        <Tabs
          label="Application workspace sections"
          idPrefix="ws"
          value={tab}
          onChange={(t) => navigate(appPath(appId, t as WorkspaceTab))}
          items={TABS.map((t) => ({ id: t, label: TAB_LABEL[t], count: counts[t] }))}
        />
      </div>

      <TabPanel id={tab} idPrefix="ws" className="pt-5" key={tab}>
        {tab === "overview" && <OverviewTab app={app} run={run} runLoading={runQ.isLoading} />}
        {tab === "findings" && (
          <FindingsTab
            app={app}
            findingsQuery={findingsQ}
            onRectify={(ids) => {
              setRectifyPreselect(ids);
              setRectifyOpen(true);
            }}
          />
        )}
        {tab === "checklist" && <ChecklistTab app={app} run={run} loading={runQ.isLoading} />}
        {tab === "documents" && <DocumentsTab app={app} run={run} findings={findings} />}
        {tab === "verification" && <VerificationTab app={app} attemptsQuery={verQ} />}
        {tab === "relationships" && <RelationshipsTab app={app} run={run} findings={findings} loading={runQ.isLoading} />}
        {tab === "audit" && <AuditTab appId={app.id} />}
        {tab === "runs" && <RunsTab appId={app.id} />}
      </TabPanel>

      <ReplayDialog
        open={replayOpen}
        onClose={() => setReplayOpen(false)}
        pending={replay.isPending}
        result={replay.data}
        error={replay.error}
      />
      <RectificationDialog
        appId={app.id}
        open={rectifyOpen}
        onClose={() => {
          setRectifyOpen(false);
          setRectifyPreselect(undefined);
        }}
        findings={findings}
        preselect={rectifyPreselect}
      />
    </div>
  );

}
