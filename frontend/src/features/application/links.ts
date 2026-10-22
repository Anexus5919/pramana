import type { BBox } from "../../types";

export const TABS = [
  "overview",
  "findings",
  "checklist",
  "documents",
  "verification",
  "relationships",
  "audit",
  "runs",
] as const;

export type WorkspaceTab = (typeof TABS)[number];

export function appPath(appId: string, tab?: WorkspaceTab): string {
  return `/applications/${encodeURIComponent(appId)}${tab && tab !== "overview" ? `/${tab}` : ""}`;
}

export function docLink(
  appId: string,
  docId: string,
  opts: { page?: number | null; bbox?: BBox | null; label?: string | null } = {},
): string {
  const p = new URLSearchParams({ doc: docId });
  if (opts.page) p.set("page", String(opts.page));
  if (opts.bbox && opts.bbox.length === 4) p.set("hl", opts.bbox.map((v) => Math.round(v * 100) / 100).join(","));
  if (opts.label) p.set("hlabel", opts.label);
  return `${appPath(appId, "documents")}?${p.toString()}`;
}

export function findingLink(appId: string, findingId: string): string {
  return `${appPath(appId, "findings")}?finding=${encodeURIComponent(findingId)}`;
}

export function parseBBox(s: string | null): BBox | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as BBox;
}
