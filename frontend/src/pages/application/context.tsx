import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext } from "react";
import { api, qk } from "../../api";
import { humanize } from "../../lib/labels";
import type { ApplicationDetail, BBox, DocumentSummary, Finding, Role, RunFull } from "../../types";

export interface DocTarget {
  docId: string;
  page?: number | null;
  bbox?: BBox | null;
  label?: string | null;
}

export interface WorkspaceCtx {
  app: ApplicationDetail;
  run: RunFull | undefined;
  runLoading: boolean;
  findings: Finding[] | undefined;
  docs: Record<string, DocumentSummary>;
  role: Role | undefined;
  openDoc: (t: DocTarget) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);
export const WorkspaceProvider = Ctx.Provider;

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside the workspace");
  return v;
}

/** Label for a document type code from the active ruleset. */
export function useDocTypeLabel() {
  const { data } = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  return useCallback((code: string | null | undefined) => (code ? (data?.document_types[code]?.label ?? humanize(code)) : "Unknown type"), [data]);
}
