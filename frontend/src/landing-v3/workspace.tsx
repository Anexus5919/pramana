import { createContext, type ReactNode, useContext } from "react";
import { Link } from "react-router-dom";
import { useWorkspaceHref } from "../landing/kit";

// Empty inside the main app, so every workspace action is router navigation; the standalone build sets the backend origin
const OriginContext = createContext("");
export const WorkspaceOrigin = OriginContext.Provider;

// "Open the workspace": the role home when signed in, otherwise the login page (same rule as the v1 landing)
export function WorkspaceLink({ className, children }: { className: string; children: ReactNode }) {
  const origin = useContext(OriginContext);
  const href = useWorkspaceHref();
  if (origin) {
    return (
      <a href={`${origin}${href}`} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
