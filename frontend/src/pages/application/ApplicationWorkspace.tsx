import { useMutation } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../../api";
import { useAuth } from "../../auth/session";
import { useRoundThreads } from "../../conversation/api";
import { LEGACY_TABS, workspacePath, type WorkspaceSection } from "../../shell/nav";
import type { DocumentSummary } from "../../types";
import type { AppNavState } from "../../ui/shared";
import { ButtonLink, EmptyState, ErrorState, Page, Skeleton } from "../../ui2";
import { WorkspaceProvider, type DocTarget, type WorkspaceActions, type WorkspaceCtx } from "./context";
import { isOpenFinding, isPathSection, useApplication, useFindings, useInvalidateApp, useRun, useVerifications } from "./data";
import { HeaderSkeleton, WorkspaceHeader } from "./Header";
import { useWatch } from "./history/api";
import { OutcomeDialog } from "./history/WatchCard";
import { RunCallout } from "./live/RunCallout";
import { useValidation } from "./live/useValidation";
import { AskPanel } from "./officer/AskPanel";
import { InspectionBriefDialog } from "./insights/InspectionBriefDialog";
import { EvidencePackDialog } from "./officer/EvidencePackDialog";
import { LetterEditor } from "./officer/LetterEditor";
import { RectifyDialog } from "./RectifyDialog";
import { ReplayDialog } from "./ReplayDialog";
import { ActivitySection } from "./sections/ActivitySection";
import { DocumentsSection } from "./sections/DocumentsSection";
import { FindingsSection } from "./sections/FindingsSection";
import { RectificationSection } from "./sections/RectificationSection";
import { SummarySection } from "./sections/SummarySection";
import { ViewerSheet } from "./viewer/ViewerSheet";

// Leaflet is only needed for the campus view, so Comparisons loads on demand
const ComparisonsSection = lazy(() => import("./sections/ComparisonsSection").then((m) => ({ default: m.ComparisonsSection })));

/**
 * Route entry. Old v1 tab URLs redirect to their v2 section and view, keeping every
 * other search parameter, so deep links such as verification?attempt= still land.
 */
export default function ApplicationWorkspace() {
  const { appId = "", tab } = useParams();
  const [sp] = useSearchParams();
  const legacy = tab ? LEGACY_TABS[tab] : undefined;
  if (legacy) {
    const params = Object.fromEntries(sp);
    return <Navigate replace to={workspacePath(appId, legacy.section, { ...params, view: legacy.view ?? params.view })} />;
  }
  if (tab && !isPathSection(tab)) return <Navigate replace to={workspacePath(appId)} />;
  return <Workspace key={appId} appId={appId} section={(tab as WorkspaceSection | undefined) ?? "summary"} />;
}

function Workspace({ appId, section }: { appId: string; section: WorkspaceSection }) {
  const location = useLocation();
  const navigate = useNavigate();
  const nav = (location.state ?? {}) as AppNavState;
  const { role } = useAuth();
  const officer = role === "officer";

  const appQ = useApplication(appId);
  const app = appQ.data;
  const runQ = useRun(app?.latest_run?.id);
  const findingsQ = useFindings(appId, !!app);
  const verQ = useVerifications(appId, !!app);
  const watchQ = useWatch(appId);
  // The latest round's counts: the tab count, and whether a review request holds up the outcome
  const convQ = useRoundThreads(appId, undefined, !!app && app.rectifications.length > 0);
  const reviewPending = convQ.data?.counts.pending_reviews_all_rounds ?? 0;
  const pendingThread = convQ.data?.threads.find((t) => t.pending_review)?.id;
  const validation = useValidation(appId);
  const invalidate = useInvalidateApp(appId);
  const replay = useMutation({ mutationFn: (runId: string) => api.replay(runId), onSuccess: () => invalidate() });

  const [replayRun, setReplayRun] = useState<string | null>(null);
  const [rectify, setRectify] = useState<{ open: boolean; preselect?: string[] }>({ open: false });
  const [letter, setLetter] = useState<{ open: boolean; findingIds?: string[]; resumeId?: string | null }>({ open: false });
  const [viewer, setViewer] = useState<DocTarget | null>(null);
  const [packOpen, setPackOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [ask, setAsk] = useState<{ open: boolean; prefill?: { question: string; key: number } }>({ open: false });

  // Drishti links here with ?ask=1 to open Ask why, or ?action=decide to open the Decide menu (officers; it only
  // opens the menu, the officer still chooses and gives a reason). Flags are dropped once read so Back does not reopen them
  const [sp, setSp] = useSearchParams();
  const [decideSignal, setDecideSignal] = useState(0);
  const loaded = !!appQ.data;
  useEffect(() => {
    const wantAsk = sp.get("ask") === "1";
    const wantDecide = sp.get("action") === "decide";
    if (!wantAsk && !wantDecide) return;
    // The Decide menu lives in the header, which renders once the application has loaded
    if (wantDecide && !loaded) return;
    if (wantAsk && officer) setAsk({ open: true });
    if (wantDecide && officer) setDecideSignal((n) => n + 1);
    const next = new URLSearchParams(sp);
    next.delete("ask");
    next.delete("action");
    setSp(next, { replace: true, state: location.state });
  }, [sp, setSp, officer, loaded, location.state]);

  const docs = useMemo(() => {
    const m: Record<string, DocumentSummary> = {};
    for (const d of app?.documents ?? []) m[d.id] = d;
    return m;
  }, [app?.documents]);

  const latestRunId = app?.latest_run?.id;
  const startReplay = useCallback(
    (runId?: string) => {
      const id = runId ?? latestRunId;
      if (!id) return;
      replay.reset();
      setReplayRun(id);
      replay.mutate(id);
    },
    // replay.mutate and replay.reset are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latestRunId],
  );

  const actions: WorkspaceActions = useMemo(
    () => ({
      ask: officer ? (question?: string) => setAsk({ open: true, prefill: question ? { question, key: Date.now() } : undefined }) : undefined,
      rectify: officer ? (preselect?: string[]) => setRectify({ open: true, preselect }) : undefined,
      replay: role === "officer" || role === "admin" ? startReplay : undefined,
      exportPack: officer ? () => setPackOpen(true) : undefined,
      recordOutcome: officer ? () => setOutcomeOpen(true) : undefined,
      validate: role === "officer" || role === "verifier" || role === "admin" ? () => void validation.start() : undefined,
    }),
    // validation.start is stable per application
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [officer, role, startReplay, validation.start],
  );

  const openDoc = useCallback((t: DocTarget) => setViewer(t), []);
  const ctx: WorkspaceCtx | null = useMemo(
    () => (app ? { app, run: runQ.data, runLoading: runQ.isLoading, findings: findingsQ.data, docs, role, openDoc, actions } : null),
    [app, runQ.data, runQ.isLoading, findingsQ.data, docs, role, openDoc, actions],
  );

  if (appQ.isPending) {
    return (
      <Page width="wide">
        <div role="status" className="space-y-8">
          <span className="sr-only">Loading the application</span>
          <HeaderSkeleton name={nav.institution} />
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </Page>
    );
  }
  if (!app || !ctx) {
    const notFound = appQ.error instanceof ApiError && appQ.error.status === 404;
    return (
      <Page width="wide">
        {notFound ? (
          <EmptyState
            title="Application not found"
            description={`No application with ID ${appId} is visible to you.`}
            action={<ButtonLink to="/dashboard">Back to the review queue</ButtonLink>}
          />
        ) : (
          <ErrorState error={appQ.error} title="Could not load the application" onRetry={() => void appQ.refetch()} retrying={appQ.isFetching} />
        )}
      </Page>
    );
  }

  const findings = findingsQ.data ?? [];
  const open = findings.filter(isOpenFinding);
  const openHigh = open.some((f) => f.severity === "high" || f.severity === "critical");

  return (
    <WorkspaceProvider value={ctx}>
      <Page width="wide">
        <WorkspaceHeader
          app={app}
          section={section}
          openCount={findingsQ.data ? open.length : undefined}
          openHigh={openHigh}
          validating={validation.pending}
          askOpen={ask.open}
          decideSignal={decideSignal}
          onValidate={actions.validate}
          onReplay={actions.replay ? () => startReplay() : undefined}
          onPack={actions.exportPack}
          onBrief={officer ? () => setBriefOpen(true) : undefined}
          onAsk={actions.ask ? () => setAsk((a) => ({ open: !a.open })) : undefined}
          onRectify={actions.rectify ? () => setRectify({ open: true }) : undefined}
          onOutcome={actions.recordOutcome}
          awaitingReply={convQ.data?.counts.awaiting_reply}
          reviewPending={reviewPending}
        />

        <RunCallout appId={app.id} v={validation} />

        <div className="min-w-0">
          {section === "summary" && <SummarySection />}
          {section === "findings" && <FindingsSection query={findingsQ} />}
          {section === "documents" && <DocumentsSection query={verQ} />}
          {section === "comparisons" && (
            <Suspense
              fallback={
                <div role="status">
                  <span className="sr-only">Loading comparisons</span>
                  <Skeleton className="h-[440px]" />
                </div>
              }
            >
              <ComparisonsSection />
            </Suspense>
          )}
          {section === "rectification" && <RectificationSection />}
          {section === "activity" && <ActivitySection />}
        </div>
      </Page>

      <ViewerSheet
        target={viewer}
        onClose={() => setViewer(null)}
        onFinding={(id) => {
          setViewer(null);
          navigate(workspacePath(app.id, "findings", { finding: id }));
        }}
      />
      <ReplayDialog
        open={replayRun !== null}
        onClose={() => setReplayRun(null)}
        pending={replay.isPending}
        result={replay.data}
        error={replay.error}
        onRetry={() => startReplay(replayRun ?? undefined)}
      />
      {officer && (
        <>
          <RectifyDialog
            appId={app.id}
            open={rectify.open}
            preselect={rectify.preselect}
            findings={findings}
            onClose={() => setRectify({ open: false })}
            onDraftLetter={(ids, resumeId) => {
              setRectify({ open: false });
              setLetter({ open: true, findingIds: ids, resumeId });
            }}
          />
          <LetterEditor appId={app.id} open={letter.open} findingIds={letter.findingIds} resumeId={letter.resumeId} onClose={() => setLetter({ open: false })} />
          <EvidencePackDialog appId={app.id} open={packOpen} onClose={() => setPackOpen(false)} />
          <InspectionBriefDialog appId={app.id} open={briefOpen} onClose={() => setBriefOpen(false)} />
          <OutcomeDialog
            open={outcomeOpen}
            onClose={() => setOutcomeOpen(false)}
            watch={watchQ.data}
            reviewPending={reviewPending}
            reviewLink={workspacePath(app.id, "rectification", { thread: pendingThread })}
          />
          <AskPanel open={ask.open} prefill={ask.prefill} onClose={() => setAsk({ open: false })} />
        </>
      )}
    </WorkspaceProvider>
  );
}
