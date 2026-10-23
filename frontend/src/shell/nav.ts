import { FileSearch, FlaskConical, Inbox, ScrollText, ServerCog, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Role } from "../types";

export type NavGroup = "Review" | "Tools" | "Governance";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Officials only; institutions get no sidebar */
  group: NavGroup;
  /** Match only the exact path */
  end?: boolean;
  /** Extra words the command palette matches on */
  keywords?: string;
}

const OFFICIAL: Role[] = ["officer", "verifier", "admin"];

/** Sidebar order is the order of work: the queue, then tools used during review, then reference and system. */
export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Review queue", icon: Inbox, roles: OFFICIAL, group: "Review", keywords: "dashboard home applications triage alerts next" },
  { to: "/analyse", label: "Analyse a document", icon: FileSearch, roles: OFFICIAL, group: "Tools", keywords: "verify pdf signature check upload photo ocr hindi forensics revisions" },
  { to: "/issuers", label: "Issuer simulator", icon: FlaskConical, roles: OFFICIAL, group: "Tools", keywords: "registry simulated demo revoke suspend watch" },
  { to: "/rules", label: "Rules", icon: ScrollText, roles: OFFICIAL, group: "Governance", keywords: "ruleset handbook checklist impact clauses" },
  { to: "/audit", label: "Audit log", icon: ShieldCheck, roles: ["officer", "admin"], group: "Governance", keywords: "chain hash checkpoint tamper" },
  { to: "/platform", label: "Platform", icon: ServerCog, roles: ["officer", "admin"], group: "Governance", keywords: "sandbox keys retention jobs security status" },
];

export const NAV_GROUP_LABEL: Record<NavGroup, string | null> = {
  Review: null,
  Tools: "Tools",
  Governance: "Governance",
};

/** Institution pages; shown as top-bar links, not a sidebar. */
export const PORTAL_NAV: NavItem[] = [
  { to: "/portal", label: "Applications", icon: Inbox, roles: ["institution"], group: "Review", end: true, keywords: "home my applications" },
];

export function navFor(role: Role | undefined): NavItem[] {
  if (!role) return [];
  if (role === "institution") return PORTAL_NAV;
  return NAV.filter((n) => n.roles.includes(role));
}

export function applicationPath(role: Role | undefined, appId: string): string {
  const id = encodeURIComponent(appId);
  return role === "institution" ? `/portal/applications/${id}` : `/applications/${id}`;
}

/* Application workspace sections ------------------------------------------------ */

export type WorkspaceSection = "summary" | "findings" | "documents" | "comparisons" | "activity";

/** The five workspace sections, in order. Summary is the bare /applications/:id URL. */
export const WORKSPACE_SECTIONS: { id: WorkspaceSection; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "findings", label: "Findings" },
  { id: "documents", label: "Documents" },
  { id: "comparisons", label: "Comparisons" },
  { id: "activity", label: "Activity" },
];

/**
 * v1 tab ids and where they live now. The workspace redirects /applications/:id/<old>
 * to /applications/:id/<section>?view=<view>, keeping every other search param,
 * so deep links such as findings?finding=, documents?doc= and verification?attempt= still work.
 */
export const LEGACY_TABS: Record<string, { section: WorkspaceSection; view?: string }> = {
  overview: { section: "summary" },
  checklist: { section: "findings", view: "checklist" },
  verification: { section: "documents", view: "verification" },
  relationships: { section: "comparisons", view: "related" },
  campus: { section: "comparisons", view: "campus" },
  "since-last-year": { section: "comparisons", view: "since-last-year" },
  runs: { section: "activity", view: "runs" },
  audit: { section: "activity", view: "audit" },
};

/** Builds a workspace URL. `params` become the search string. */
export function workspacePath(appId: string, section: WorkspaceSection = "summary", params?: Record<string, string | undefined>): string {
  const base = `/applications/${encodeURIComponent(appId)}${section === "summary" ? "" : `/${section}`}`;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** v1 tab labels, still used by the v1 workspace tab bar until package B replaces it. */
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

/** Breadcrumb label for a workspace path segment, v2 sections and v1 tabs alike. */
export const WORKSPACE_CRUMB_LABEL: Record<string, string> = {
  summary: "Summary",
  findings: "Findings",
  documents: "Documents",
  comparisons: "Comparisons",
  activity: "Activity",
  overview: "Summary",
  checklist: "Findings",
  verification: "Documents",
  relationships: "Comparisons",
  campus: "Comparisons",
  "since-last-year": "Comparisons",
  runs: "Activity",
  audit: "Activity",
};
