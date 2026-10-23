import {
  FilePlus2,
  FileSearch,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  ScrollText,
  ServerCog,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "../types";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  group: "Review" | "System" | "Portal";
  /** Match only the exact path */
  end?: boolean;
  keywords?: string;
}

const OFFICIAL: Role[] = ["officer", "verifier", "admin"];

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: OFFICIAL, group: "Review", keywords: "queue triage alerts home" },
  { to: "/verify-pdf", label: "Verify a PDF", icon: FileSearch, roles: OFFICIAL, group: "Review", keywords: "signature check upload tool" },
  { to: "/rules", label: "Rules", icon: ScrollText, roles: OFFICIAL, group: "System", keywords: "ruleset handbook impact" },
  { to: "/issuers", label: "Issuer simulator", icon: FlaskConical, roles: OFFICIAL, group: "System", keywords: "registry simulated demo" },
  { to: "/audit", label: "Audit log", icon: ShieldCheck, roles: ["officer", "admin"], group: "System", keywords: "chain hash checkpoint" },
  { to: "/platform", label: "Platform", icon: ServerCog, roles: ["officer", "admin"], group: "System", keywords: "sandbox keys retention jobs security" },
  { to: "/portal", label: "My applications", icon: Inbox, roles: ["institution"], group: "Portal", end: true, keywords: "home" },
  { to: "/portal/new", label: "New application", icon: FilePlus2, roles: ["institution"], group: "Portal", keywords: "create apply" },
];

export function navFor(role: Role | undefined): NavItem[] {
  return role ? NAV.filter((n) => n.roles.includes(role)) : [];
}

export function applicationPath(role: Role | undefined, appId: string): string {
  const id = encodeURIComponent(appId);
  return role === "institution" ? `/portal/applications/${id}` : `/applications/${id}`;
}

/** Workspace tab labels for breadcrumbs; the workspace owns the tabs themselves. */
export const WORKSPACE_TAB_LABEL: Record<string, string> = {
  overview: "Overview",
  documents: "Documents",
  findings: "Findings",
  checklist: "Checklist",
  verification: "Verification",
  relationships: "Relationships",
  campus: "Campus",
  "since-last-year": "Since last year",
  runs: "Runs",
  audit: "Audit",
};
