import { useQuery } from "@tanstack/react-query";
import { request } from "../../../api";
import type { BBox, Citation, Comparison, Evidence, Severity } from "../../../types";

/* Proof-strength matrix */

export type RungState = "supports" | "against" | "inconclusive" | "not_checked" | "none";
export type ItemEffect = "supports" | "against" | "inconclusive" | "not_checked" | "info";

export const STATE_LABEL: Record<RungState, string> = {
  supports: "Supports",
  against: "Contradicts",
  inconclusive: "Inconclusive",
  not_checked: "Not checked",
  none: "No source",
};

export interface ProofLevel {
  id: "declared" | "present" | "read" | "record" | "issuer" | "crypto";
  label: string;
  description: string;
  simulated?: boolean;
}

interface ItemBase {
  effect: ItemEffect;
}

export interface RuleItem extends ItemBase {
  kind: "rule";
  rule_id: string;
  title: string | null;
  outcome: string;
  message: string | null;
  citation: Citation | null;
  evidence: Evidence[];
  finding_id: string | null;
}

export interface AttemptItem extends ItemBase {
  kind: "attempt";
  attempt_id: string;
  channel: string;
  status: string;
  source: string;
  simulated: boolean;
  detail: string | null;
  document_id: string | null;
  comparisons: Comparison[];
  finding_id: string | null;
  note: string | null;
}

export interface FindingItem extends ItemBase {
  kind: "finding";
  finding_id: string;
  code: string;
  title: string;
  message: string;
  severity: Severity;
  evidence_class: string;
  review_status: string;
  document_id: string | null;
}

export interface ExtractedFieldBrief {
  name: string;
  value: string | null;
  raw: string | null;
  page: number | null;
  bbox: BBox | null;
  status: string;
  method: string;
}

export interface FieldsItem extends ItemBase {
  kind: "fields";
  document_id: string;
  doc_type: string;
  label: string;
  fields: ExtractedFieldBrief[];
  rows?: number;
  note?: string;
}

export interface DocumentItem extends ItemBase {
  kind: "document";
  document_id: string;
  doc_type: string;
  label: string;
  filename: string;
}

export interface DeclaredItem extends ItemBase {
  kind: "declared";
  field: string;
  value: unknown;
}

export interface ClaimItem extends ItemBase {
  kind: "claim";
  text: string;
}

export interface RegistryCheckItem extends ItemBase {
  kind: "registry_check";
  source: string;
  text: string;
  checked: number;
  matched: number;
  elsewhere: string[];
  missing: string[];
  document_id: string;
}

export type ProofItem = RuleItem | AttemptItem | FindingItem | FieldsItem | DocumentItem | DeclaredItem | ClaimItem | RegistryCheckItem;

export interface Rung {
  level: number;
  state: RungState;
  partial: boolean;
  items: ProofItem[];
}

export interface ProofRow {
  id: string;
  label: string;
  group: "checklist" | "claims";
  documents: { doc_type: string; label: string; required: boolean; present: boolean }[];
  rule_count: number;
  levels: Rung[];
  strongest: number;
  verdict: { kind: "contradicted" | "proven" | "read" | "present" | "declared"; level: number; text: string };
  notes: string[];
}

export interface ProofMatrix {
  levels: ProofLevel[];
  rows: ProofRow[];
  summary: { text: string; total: number; proven: number; contradicted: string[]; declared_only: string[] };
  groups: { id: string; label: string; source: Citation | null }[];
}

/* Certificate coverage calendar */

export type CoverageStatus = "covers_session" | "expires_in_session" | "lapses_before_session" | "expired_at_submission" | "unknown";

export interface DatePoint {
  date: string | null;
  label: string;
  field: string | null;
  raw: string | null;
  page: number | null;
  bbox: BBox | null;
  method: string | null;
}

export interface CoverageAlternative {
  source: string;
  kind: "signed_qr" | "issuer_registry" | "record" | "page_overlay";
  date: string | null;
  simulated: boolean;
  differs: boolean;
  status: CoverageStatus;
  attempt_id?: string;
  finding_id?: string;
  record_id?: string;
  verification?: string;
  page?: number | null;
  bbox?: BBox | null;
  note?: string;
}

export interface CoverageCert {
  doc_type: string;
  label: string;
  document_id: string;
  filename: string;
  start: DatePoint;
  end: DatePoint & { basis: "printed" | "rule"; rule: { id: string; title: string; days: number | null; citation: Citation | null } | null };
  status: CoverageStatus;
  months_into_session: number | null;
  headline: string;
  alternatives: CoverageAlternative[];
  conflict: boolean;
  finding_id: string | null;
}

export interface Coverage {
  as_of: string;
  today: string;
  session: { label: string; start: string; end: string; basis: string; source: string; assumed: boolean };
  certificates: CoverageCert[];
  open_ended: { doc_type: string; label: string; document_id: string; issued: DatePoint; certificate_type: string | null; note: string }[];
  counts: Partial<Record<CoverageStatus, number>>;
  summary: string;
}

export interface ProofInsights {
  application_id: string;
  run_id: string | null;
  as_of?: string;
  ruleset?: string;
  matrix: ProofMatrix | null;
  coverage: Coverage | null;
}

export function useProofInsights(appId: string, runId: string | null | undefined) {
  return useQuery({
    // Under the application key, so a new run or a review invalidates it with the rest of the workspace
    queryKey: ["application", appId, "insights-proof", runId ?? "none"],
    queryFn: () => request<ProofInsights>("GET", `/applications/${encodeURIComponent(appId)}/insights/proof`),
    enabled: !!appId,
    staleTime: 30_000,
  });
}
