import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { homePath, useSession } from "./auth/session";
import ApplicationWorkspace from "./pages/application/ApplicationWorkspace";
import AuditLogPage from "./pages/audit/AuditLogPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import IssuerSimulatorPage from "./pages/issuers/IssuerSimulatorPage";
import NotFoundPage from "./pages/not-found/NotFoundPage";
import InstitutionApplicationPage from "./pages/portal/InstitutionApplicationPage";
import MyApplicationsPage from "./pages/portal/MyApplicationsPage";
import NewApplicationPage from "./pages/portal/NewApplicationPage";
import RulesPage from "./pages/rules/RulesPage";
import VerifyPdfPage from "./pages/verify/VerifyPdfPage";
import { AppShell, Footer, FullScreenLoader } from "./shell/AppShell";
import type { Role } from "./types";
import { ErrorState } from "./ui/States";

const LandingPage = lazy(() => import("./landing/LandingPage"));
const LoginPage = lazy(() => import("./pages/login/LoginPage"));

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
          <Route path="/verify-pdf" element={only(OFFICIAL, <VerifyPdfPage />)} />
          <Route path="/audit" element={only(["officer", "admin"], <AuditLogPage />)} />
          <Route path="/portal" element={only(["institution"], <MyApplicationsPage />)} />
          <Route path="/portal/new" element={only(["institution"], <NewApplicationPage />)} />
          <Route path="/portal/applications/:appId" element={only(["institution"], <InstitutionApplicationPage />)} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
