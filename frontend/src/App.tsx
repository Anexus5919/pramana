import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { homePath, useSession } from "./auth/session";
import AnalysePage from "./pages/analyse/AnalysePage";
import ApplicationWorkspace from "./pages/application/ApplicationWorkspace";
import AuditLogPage from "./pages/audit/AuditLogPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import IssuerSimulatorPage from "./pages/issuers/IssuerSimulatorPage";
import NotFoundPage from "./pages/not-found/NotFoundPage";
import PlatformPage from "./pages/platform/PlatformPage";
import InstitutionApplicationPage from "./pages/portal/InstitutionApplicationPage";
import MyApplicationsPage from "./pages/portal/MyApplicationsPage";
import NewApplicationPage from "./pages/portal/NewApplicationPage";
import RulesPage from "./pages/rules/RulesPage";
import { AppShell, Footer, FullScreenLoader } from "./shell/AppShell";
import type { Role } from "./types";
import { ErrorState } from "./ui/States";

// The v3 landing (block ground hero); three.js loads in a further lazy chunk inside it
const LandingPage = lazy(() => import("./landing-v3/LandingV3"));
const LoginPage = lazy(() => import("./pages/login/LoginPage"));
const ScanPage = lazy(() => import("./pages/scan/ScanPage"));
// Living reference for design system v2; dev builds, or production with VITE_UI_KIT=1
const UiKit = import.meta.env.DEV || import.meta.env.VITE_UI_KIT === "1" ? lazy(() => import("./ui2/Kit")) : null;

const OFFICIAL: Role[] = ["officer", "verifier", "admin"];

function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { data, isPending, error, refetch, isFetching } = useSession();
  const location = useLocation();
  if (isPending) return <FullScreenLoader label="Checking session" />;
  if (error)
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <div className="mx-auto flex w-full max-w-xl flex-1 items-center p-6">
          <ErrorState
            error={error}
            title="Could not reach the Pramana service"
            onRetry={() => void refetch()}
            retrying={isFetching}
            className="w-full"
          />
        </div>
        <Footer />
      </div>
    );
  if (!data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(data.user.role)) return <Navigate to={homePath(data.user.role)} replace />;
  return <>{children}</>;
}

function only(roles: Role[], el: ReactNode) {
  return <Guard roles={roles}>{el}</Guard>;
}

export function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route
          element={
            <Guard>
              <AppShell />
            </Guard>
          }
        >
          <Route path="/dashboard" element={only(OFFICIAL, <DashboardPage />)} />
          <Route path="/applications/:appId/:tab?" element={only(OFFICIAL, <ApplicationWorkspace />)} />
          <Route path="/rules" element={only(OFFICIAL, <RulesPage />)} />
          <Route path="/issuers" element={only(OFFICIAL, <IssuerSimulatorPage />)} />
          <Route path="/analyse" element={only(OFFICIAL, <AnalysePage />)} />
          {/* Verify a PDF is part of Analyse a document now; old links land there */}
          <Route path="/verify-pdf" element={<Navigate to="/analyse" replace />} />
          <Route path="/audit" element={only(["officer", "admin"], <AuditLogPage />)} />
          <Route path="/platform" element={only(["officer", "admin"], <PlatformPage />)} />
          <Route path="/portal" element={only(["institution"], <MyApplicationsPage />)} />
          <Route path="/portal/new" element={only(["institution"], <NewApplicationPage />)} />
          <Route path="/portal/applications/:appId" element={only(["institution"], <InstitutionApplicationPage />)} />
          {UiKit && <Route path="/ui-kit" element={<UiKit />} />}
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
