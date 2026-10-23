import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, request } from "../../../api";
import type { BBox, Citation, Evidence, Severity } from "../../../types";

const enc = encodeURIComponent;

/* ---------- Revision time machine ---------- */

export interface RevisionSignature {
  field: string;
  revision: number;
  signed_bytes: number;
  signer: string | null;
  signing_time: string | null;
  role: "issuer" | "applicant" | "unknown" | string;
  status: string | null;
  detail: string | null;
  simulated: boolean | null;
}

export interface RevisionChange {
  page: number;
  added_text: string;
  removed_text: string;
  text_underneath: string;
  bbox: BBox | null;
}

export interface Revision {
  n: number;
  start: number;
  end: number;
  bytes: number;
  kind: "original" | "edit" | "signature" | "update";
  objects_written: number;
  adds_signature: boolean;
  adds_annotations: boolean;
  updates_metadata: boolean;
  signatures: RevisionSignature[];
  covered_by: string[];
  after_last_signature: boolean;
  changes: RevisionChange[];
}

export interface Revisions {
  supported: boolean;
  document_id: string;
  size_bytes?: number;
  revision_count: number;
  page_count?: number;
  pages?: { page_no: number; width: number; height: number }[];
  signatures?: RevisionSignature[];
  signed_through?: number | null;
  trailing_bytes?: number;
  limitations?: string[];
  revisions: Revision[];
}

/* ---------- Re-verification watch ---------- */

export type WatchState = "ok" | "revoked" | "suspended" | "expired" | "not_found" | "record_changed" | "source_unavailable";

export interface WatchItem {
  id: string;
  document_id: string | null;
  declared_type: string;
  label: string;
  issuer_code: string;
  issuer: string;
  ref_no: string;
  valid_until: string | null;
  state: WatchState | string;
  detail: string | null;
  baseline: { run_id?: string; status?: string; checked_at?: string | null };
  active: boolean;
  last_checked_at: string | null;
  created_at: string;
  simulated: true;
}

export interface WatchEvent {
  id: string;
  item_id: string;
  application_id: string;
  institution: string | null;
  change: WatchState | "restored" | string;
  previous_state: string;
  severity: Severity;
  detail: string;
  finding_id: string | null;
  open: boolean;
  created_at: string;
  label: string | null;
  ref_no: string | null;
  issuer: string | null;
  simulated: true;
}

export interface WatchRunBrief {
  id: string;
  trigger: "scheduler" | "manual" | "baseline" | string;
  actor: string;
  checked: number;
  changes: number;
  started_at: string;
  finished_at: string | null;
}

export interface WatchStatus {
  interval_hours: number;
  scheduler_enabled: boolean;
  last_run: WatchRunBrief | null;
  next_check: string | null;
  active_items: number;
}

export interface ScrutinyOutcome {
  id: string;
  outcome: string;
  label: string;
  reason: string;
  round: number;
  run_id: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface ApplicationWatch extends WatchStatus {
  outcome: ScrutinyOutcome | null;
  outcomes: { value: string; label: string }[];
  items: WatchItem[];
  events: WatchEvent[];
}

export interface WatchRunResult {
  run: WatchRunBrief;
  changes: WatchEvent[];
}

/* ---------- Since last year ---------- */

export interface ScalarChange {
  key: string;
  label: string;
  unit: string | null;
  before: number | string | null;
  after: number | string | null;
  delta: number | null;
  pct: number | null;
  status: "same" | "increased" | "decreased" | "unknown";
}

export interface ProgrammeChange {
  code: string;
  name: string;
  before_approved: number | null;
  after_approved: number | null;
  after_proposed: number | null;
  delta_proposed: number | null;
  before_nba: boolean;
  after_nba: boolean;
  status: "same" | "changed" | "added" | "removed";
}

export interface CertificateChange {
  type: string;
  before_number: string | null;
  after_number: string | null;
  before_valid_until: string | null;
  after_valid_until: string | null;
  status: "unchanged" | "new_number" | "reused_new_validity" | "not_read" | "new" | "missing";
  document_id: string | null;
  page: number | null;
  bbox: BBox | null;
}

export interface YoyIndicator {
  code: string;
  fingerprint: string;
  category: string;
  evidence_class: string;
  severity: Severity;
  outcome: string;
  title: string;
  message: string;
  limitation: string | null;
  rule: { id: string; version: number; citation: Citation & { related_rule?: string } };
  evidence: Evidence[];
  document_id: string | null;
}

export interface SinceLastYear {
  available: boolean;
  academic_year: string;
  previous?: {
    academic_year: string;
    application_id: string | null;
    category: string | null;
    submitted_on: string | null;
    record_id: string;
    source: string;
    provenance: string;
  };
  scalars?: ScalarChange[];
  programmes?: ProgrammeChange[];
  faculty?: { before: number; after: number; retained: number; added: string[]; removed: string[]; replaced_share: number | null } | null;
  labs?: { before: number; after: number; added: string[]; removed: string[] } | null;
  certificates?: CertificateChange[];
  roster_document_id?: string | null;
  indicators?: YoyIndicator[];
  as_of?: string;
}

export const historyApi = {
  revisions: (docId: string) => request<Revisions>("GET", `/documents/${enc(docId)}/revisions`),
  revisionPageUrl: (docId: string, n: number, page: number) => `/api/documents/${enc(docId)}/revisions/${n}/pages/${page}.png`,
  watch: (appId: string) => request<ApplicationWatch>("GET", `/applications/${enc(appId)}/watch`),
  recordOutcome: (appId: string, outcome: string, reason: string) =>
    request<ApplicationWatch>("POST", `/applications/${enc(appId)}/scrutiny-outcome`, { outcome, reason }),
  watchStatus: () => request<WatchStatus>("GET", "/watch"),
  runWatch: () => request<WatchRunResult>("POST", "/watch/run", {}),
  sinceLastYear: (appId: string) => request<SinceLastYear>("GET", `/applications/${enc(appId)}/since-last-year`),
  setRecordStatus: (code: string, refNo: string, status: string, note: string | null) =>
    request<{ simulated: true; issuer: string; record: Record<string, unknown> }>("POST", `/sim/issuers/${enc(code)}/records/status`, {
      ref_no: refNo,
      status,
      note,
    }),
};

export const hk = {
  revisions: (docId: string) => ["document", docId, "revisions"] as const,
  watch: (appId: string) => ["application", appId, "watch"] as const,
  watchStatus: ["watch-status"] as const,
  sinceLastYear: (appId: string) => ["application", appId, "since-last-year"] as const,
};

export function useRevisions(docId: string | null | undefined, enabled = true) {
  return useQuery({ queryKey: hk.revisions(docId ?? "none"), queryFn: () => historyApi.revisions(docId!), enabled: !!docId && enabled, staleTime: 60_000 });
}

export function useWatch(appId: string) {
  return useQuery({ queryKey: hk.watch(appId), queryFn: () => historyApi.watch(appId), enabled: !!appId });
}

export function useSinceLastYear(appId: string) {
  return useQuery({ queryKey: hk.sinceLastYear(appId), queryFn: () => historyApi.sinceLastYear(appId), enabled: !!appId });
}

/** Run the watch over every watched application; refresh every view that shows its results. */
export function useRunWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: historyApi.runWatch,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["application"] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.audit });
      void qc.invalidateQueries({ queryKey: hk.watchStatus });
    },
  });
}

export function useRecordOutcome(appId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ outcome, reason }: { outcome: string; reason: string }) => historyApi.recordOutcome(appId, outcome, reason),
    onSuccess: (data) => {
      qc.setQueryData(hk.watch(appId), data);
      void qc.invalidateQueries({ queryKey: ["application", appId] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: hk.watchStatus });
    },
  });
}
