import { useMutation } from "@tanstack/react-query";
import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  History,
  LayoutGrid,
  ListChecks,
  MapPinned,
  Network,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../../api";
import { useAuth } from "../../auth/session";
import { WORKSPACE_TAB_LABEL } from "../../shell/nav";
import type { DocumentSummary } from "../../types";
import { ButtonLink } from "../../ui/Button";
import { dur, ease } from "../../ui/motion";
import type { AppNavState } from "../../ui/shared";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../ui/States";
import { TabPanel, Tabs, type TabItem } from "../../ui/Tabs";
import { WorkspaceProvider, type DocTarget, type WorkspaceCtx } from "./context";
import { appPath, isTab, useApplication, useFindings, useInvalidateApp, useRun, useVerifications, type WorkspaceTab } from "./data";
import { HeaderTitle, WorkspaceHeader } from "./Header";
import { SinceLastYearTab } from "./history/SinceLastYearTab";
import { AskPanel } from "./officer/AskPanel";
import { EvidencePackDialog } from "./officer/EvidencePackDialog";
import { LetterEditor } from "./officer/LetterEditor";
import { OfficerActions } from "./officer/OfficerActions";
import { RectifyDialog } from "./RectifyDialog";
import { ReplayDialog } from "./ReplayDialog";
import { RunPanel, useValidation } from "./RunPanel";
import { AuditTab } from "./tabs/AuditTab";
import { ChecklistTab } from "./tabs/ChecklistTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { FindingsTab } from "./tabs/FindingsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { RelationshipsTab } from "./tabs/RelationshipsTab";
import { RunsTab } from "./tabs/RunsTab";
import { VerificationTab } from "./tabs/VerificationTab";
import { ViewerSheet } from "./viewer/ViewerSheet";

const ICONS: Record<WorkspaceTab, ReactNode> = {
  overview: <LayoutGrid />,
  documents: <FileText />,
  findings: <ListChecks />,
  checklist: <ClipboardCheck />,
  verification: <ShieldCheck />,
  relationships: <Network />,
  campus: <MapPinned />,
  "since-last-year": <CalendarClock />,
  runs: <History />,
  audit: <ScrollText />,
};

const OPEN = new Set(["open", "acknowledged", "evidence_requested"]);
// Leaflet is only needed on the Campus tab, so it loads with it
const CampusTab = lazy(() => import("./tabs/CampusTab").then((m) => ({ default: m.CampusTab })));
const TABS_ID = "ws";

function LoadingHeader({ appId, name }: { appId: string; name?: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading the application</span>
      <Skeleton className="mb-3 h-4 w-72" rounded="sm" />
      <HeaderTitle appId={appId} name={name} />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-7 w-32" rounded="full" />
        <Skeleton className="h-7 w-48" rounded="full" />
        <Skeleton className="h-7 w-24" rounded="full" />
      </div>
      <Skeleton className="mt-5 h-11 w-full" rounded="md" />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-72" rounded="lg" />
        <Skeleton className="h-72" rounded="lg" />
      </div>
    </div>
  );
}

export default function ApplicationWorkspace() {
  const { appId = "", tab: tabParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const nav = (location.state ?? {}) as AppNavState;
  const tab: WorkspaceTab = isTab(tabParam) ? tabParam : "overview";
  const { role, is } = useAuth();

  const appQ = useApplication(appId);
  const app = appQ.data;
  const runQ = useRun(app?.latest_run?.id);
  const findingsQ = useFindings(appId, !!app);
  const verQ = useVerifications(appId, !!app);
  const validation = useValidation(appId);
  const invalidate = useInvalidateApp(appId);
  const replay = useMutation({ mutationFn: (runId: string) => api.replay(runId), onSuccess: () => invalidate() });
  const [replayOpen, setReplayOpen] = useState(false);
  const [rectify, setRectify] = useState<{ open: boolean; preselect?: string[] }>({ open: false });
  const [viewer, setViewer] = useState<DocTarget | null>(null);
  const [letter, setLetter] = useState<{ open: boolean; findingIds?: string[]; resumeId?: string | null }>({ open: false });
  const [packOpen, setPackOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const docs = useMemo(() => {
    const m: Record<string, DocumentSummary> = {};
    for (const d of app?.documents ?? []) m[d.id] = d;
    return m;
  }, [app?.documents]);

  const openDoc = useCallback((t: DocTarget) => setViewer(t), []);
  const ctx: WorkspaceCtx | null = useMemo(
    () => (app ? { app, run: runQ.data, runLoading: runQ.isLoading, findings: findingsQ.data, docs, role, openDoc } : null),
    [app, runQ.data, runQ.isLoading, findingsQ.data, docs, role, openDoc],
  );

  if (appQ.isPending) return <LoadingHeader appId={appId} name={nav.institution} />;
  if (!app || !ctx) {
    const notFound = appQ.error instanceof ApiError && appQ.error.status === 404;
    return notFound ? (
      <EmptyState
        title="Application not found"
        description={`No application with ID ${appId} is visible to you.`}
        action={<ButtonLink to="/dashboard">Back to the dashboard</ButtonLink>}
      />
    ) : (
      <ErrorState error={appQ.error} title="Could not load the application" onRetry={() => void appQ.refetch()} retrying={appQ.isFetching} />
    );
  }

  const findings = findingsQ.data ?? [];
  const run = runQ.data;
  const openCount = findings.filter((f) => OPEN.has(f.review_status)).length;
  const openHigh = findings.some((f) => OPEN.has(f.review_status) && (f.severity === "high" || f.severity === "critical"));
  const currentAttempts = (verQ.data ?? []).filter((a) => a.run_id === app.latest_run?.id);
  const peers = run?.graph?.nodes.filter((n) => n.kind === "application" && !n.focus).length;
  const yoyOpen = findings.filter((f) => f.code.startsWith("YOY-") && OPEN.has(f.review_status)).length;

  const items: TabItem<WorkspaceTab>[] = [
    { id: "overview", label: WORKSPACE_TAB_LABEL.overview, icon: ICONS.overview },
    { id: "documents", label: WORKSPACE_TAB_LABEL.documents, icon: ICONS.documents, count: app.documents.filter((d) => !d.superseded).length },
    { id: "findings", label: WORKSPACE_TAB_LABEL.findings, icon: ICONS.findings, count: findingsQ.data ? openCount : undefined, attention: openHigh },
    { id: "checklist", label: WORKSPACE_TAB_LABEL.checklist, icon: ICONS.checklist, count: run?.checklist.length },
    { id: "verification", label: WORKSPACE_TAB_LABEL.verification, icon: ICONS.verification, count: verQ.data ? currentAttempts.length : undefined },
    { id: "relationships", label: WORKSPACE_TAB_LABEL.relationships, icon: ICONS.relationships, count: peers || undefined },
    // Officer-only photo evidence; the workspace route is already limited to officials
    ...(is("officer", "verifier", "admin")
      ? [{ id: "campus" as const, label: WORKSPACE_TAB_LABEL.campus ?? "Campus", icon: ICONS.campus, count: app.documents.filter((d) => !d.superseded && d.mime.startsWith("image/")).length || undefined }]
      : []),
    { id: "since-last-year", label: WORKSPACE_TAB_LABEL["since-last-year"], icon: ICONS["since-last-year"], count: yoyOpen || undefined, attention: yoyOpen > 0 },
    { id: "runs", label: WORKSPACE_TAB_LABEL.runs, icon: ICONS.runs },
    { id: "audit", label: WORKSPACE_TAB_LABEL.audit, icon: ICONS.audit },
  ];

  const startReplay = () => {
    if (!app.latest_run) return;
    replay.reset();
    setReplayOpen(true);
    replay.mutate(app.latest_run.id);
  };

  return (
    <WorkspaceProvider value={ctx}>
      <div className={askOpen ? "min-w-0 transition-[padding] duration-300 2xl:pr-[440px]" : "min-w-0 transition-[padding] duration-300"}>
        <WorkspaceHeader
          app={app}
          canValidate={is("officer", "verifier", "admin")}
          canReplay={is("officer", "admin")}
          canRectify={is("officer")}
          validating={validation.pending}
          onValidate={() => void validation.start()}
          onReplay={startReplay}
          onRectify={() => setRectify({ open: true })}
          extra={is("officer") ? <OfficerActions askOpen={askOpen} onAsk={() => setAskOpen((v) => !v)} onPack={() => setPackOpen(true)} /> : undefined}
        />
        <RunPanel appId={app.id} v={validation} />

        <div className="sticky top-16 z-20 -mx-4 bg-canvas/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Tabs id={TABS_ID} label="Application workspace sections" items={items} value={tab} hrefFor={(t) => appPath(app.id, t)} />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: dur.ui, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: dur.micro } }}
          >
            <TabPanel tabsId={TABS_ID} value={tab} className="pt-6">
              {tab === "overview" && <OverviewTab />}
              {tab === "documents" && <DocumentsTab />}
              {tab === "findings" && (
                <FindingsTab
                  query={findingsQ}
                  onRectify={is("officer") ? (ids) => setRectify({ open: true, preselect: ids }) : undefined}
                />
              )}
              {tab === "checklist" && <ChecklistTab />}
              {tab === "verification" && <VerificationTab query={verQ} />}
              {tab === "relationships" && <RelationshipsTab />}
              {tab === "campus" && is("officer", "verifier", "admin") && (
                <Suspense fallback={<Skeleton className="h-[440px]" rounded="lg" />}>
                  <CampusTab />
                </Suspense>
              )}
              {tab === "since-last-year" && <SinceLastYearTab />}
              {tab === "runs" && <RunsTab />}
              {tab === "audit" && <AuditTab />}
            </TabPanel>
          </motion.div>
        </AnimatePresence>

        <ViewerSheet
          target={viewer}
          onClose={() => setViewer(null)}
          onFinding={(id) => {
            setViewer(null);
            navigate(appPath(app.id, "findings", { finding: id }));
          }}
        />
        <ReplayDialog
          open={replayOpen}
          onClose={() => setReplayOpen(false)}
          pending={replay.isPending}
          result={replay.data}
          error={replay.error}
          onRetry={startReplay}
        />
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
        {is("officer") && (
          <>
            <LetterEditor appId={app.id} open={letter.open} findingIds={letter.findingIds} resumeId={letter.resumeId} onClose={() => setLetter({ open: false })} />
            <EvidencePackDialog appId={app.id} open={packOpen} onClose={() => setPackOpen(false)} />
            <AskPanel open={askOpen} onClose={() => setAskOpen(false)} />
          </>
        )}
      </div>
    </WorkspaceProvider>
  );
}
