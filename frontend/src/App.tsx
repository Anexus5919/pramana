import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { homePath, useSession } from "./auth/session";
import { AppShell } from "./components/layout/AppShell";
import { Footer } from "./components/layout/Footer";
import { ErrorBanner, PageLoading } from "./components/ui/Feedback";
import { AuditLogPage } from "./features/admin/AuditLogPage";
import { IssuerSimulatorPage } from "./features/admin/IssuerSimulatorPage";
import { RulesPage } from "./features/admin/RulesPage";
import { ApplicationWorkspace } from "./features/application/ApplicationWorkspace";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { LoginPage } from "./features/login/LoginPage";
import { InstitutionApplicationPage } from "./features/portal/InstitutionApplicationPage";
import { MyApplicationsPage } from "./features/portal/MyApplicationsPage";
import { NewApplicationPage } from "./features/portal/NewApplicationPage";
import { NotFoundPage } from "./features/NotFoundPage";
import { VerifyPdfPage } from "./features/tools/VerifyPdfPage";
import type { Role } from "./types";

function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { data, isPending, error } = useSession();
  const location = useLocation();
  if (isPending) return <PageLoading label="Checking session" />;
  if (error)
    return (
      <div className="flex min-h-screen flex-col">
        <div className="mx-auto w-full max-w-xl flex-1 p-6">
          <ErrorBanner error={error} title="Could not reach the Pramana service" />
        </div>
        <Footer />
      </div>
    );
  if (!data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(data.user.role)) return <Navigate to={homePath(data.user.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { data, isPending } = useSession();
  if (isPending) return <PageLoading label="Checking session" />;
  return <Navigate to={data ? homePath(data.user.role) : "/login"} replace />;
}

const OFFICIAL: Role[] = ["officer", "verifier", "admin"];

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Home />} />
      <Route
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route path="/dashboard" element={<Guard roles={OFFICIAL}><DashboardPage /></Guard>} />
        <Route path="/applications/:appId/:tab?" element={<Guard roles={OFFICIAL}><ApplicationWorkspace /></Guard>} />
        <Route path="/rules" element={<Guard roles={OFFICIAL}><RulesPage /></Guard>} />
        <Route path="/issuers" element={<Guard roles={OFFICIAL}><IssuerSimulatorPage /></Guard>} />
        <Route path="/verify-pdf" element={<Guard roles={OFFICIAL}><VerifyPdfPage /></Guard>} />
        <Route path="/audit" element={<Guard roles={["officer", "admin"]}><AuditLogPage /></Guard>} />
        <Route path="/portal" element={<Guard roles={["institution"]}><MyApplicationsPage /></Guard>} />
        <Route path="/portal/new" element={<Guard roles={["institution"]}><NewApplicationPage /></Guard>} />
        <Route
          path="/portal/applications/:appId"
          element={<Guard roles={["institution"]}><InstitutionApplicationPage /></Guard>}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
