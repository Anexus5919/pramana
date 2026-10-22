import type { UseQueryResult } from "@tanstack/react-query";
import type { VerificationAttempt } from "../../../types";

export function VerificationTab({ query }: { query: UseQueryResult<VerificationAttempt[]> }) {
  return <p className="text-sm text-ink-3">{query.data?.length ?? 0} attempts.</p>;
}
