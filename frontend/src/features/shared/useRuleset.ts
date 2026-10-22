import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, qk } from "../../api";
import { humanize } from "../../lib/labels";

export function useRuleset() {
  return useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
}

/** Label lookups for category and document type codes, falling back to a humanized code. */
export function useLabels() {
  const { data } = useRuleset();
  const category = useCallback(
    (code: string | null | undefined) => (code ? (data?.checklists[code]?.label ?? humanize(code)) : ""),
    [data],
  );
  const docType = useCallback(
    (code: string | null | undefined) => (code ? (data?.document_types[code]?.label ?? humanize(code)) : ""),
    [data],
  );
  return { category, docType, ruleset: data };
}
