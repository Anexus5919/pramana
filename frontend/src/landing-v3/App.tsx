import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import LandingV3 from "./LandingV3";
import { WORKSPACE_ORIGIN } from "./links";
import { WorkspaceOrigin } from "./workspace";

// v1 sections link to app routes such as /login; on this port those belong to the workspace origin
function ToWorkspace() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.location.replace(`${WORKSPACE_ORIGIN}${pathname}${search}`);
  }, [pathname, search]);
  return null;
}

// Standalone app for the 5181 preview; the main app routes "/" to LandingV3 directly
export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <WorkspaceOrigin value={WORKSPACE_ORIGIN}>
            <LandingV3 />
          </WorkspaceOrigin>
        }
      />
      <Route path="*" element={<ToWorkspace />} />
    </Routes>
  );
}
