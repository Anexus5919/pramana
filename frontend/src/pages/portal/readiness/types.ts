/** Response of POST /api/applications/:id/readiness (backend: pramana/insights/readiness.py). */

export type ReadinessStatus = "met" | "fix" | "waiting";
export type ReadinessGroupId = "documents" | "validity" | "norms";

export interface ReadinessTarget {
  kind: "document" | "figure";
  /** A checklist doc_type, or a declared figure key ("programmes" for the programmes table) */
  key: string;
  label: string;
}

export interface ReadinessClause {
  source: string;
  section: string | null;
  page: number | null;
  quote: string | null;
}

export interface ReadinessItem {
  id: string;
  group: ReadinessGroupId;
  status: ReadinessStatus;
  title: string;
  detail: string | null;
  action: string | null;
  /** Met, but worth a look: a certificate that lapses during the session, pages that could not be read */
  advice: { text: string; action: string } | null;
  clause: ReadinessClause | null;
  targets: ReadinessTarget[];
  /** Named in the open rectification request */
  requested: boolean;
  /** Why a document that is usually optional is required for this application */
  conditional: string | null;
}

export interface ReadinessGroup {
  id: ReadinessGroupId;
  label: string;
  items: ReadinessItem[];
}

export interface Readiness {
  application_id: string;
  status: string;
  round: number;
  resubmission: boolean;
  checked_at: string;
  as_of: string;
  session: { year: string; ends: string };
  state: "fix" | "ready";
  counts: { total: number; met: number; fix: number; waiting: number; advice: number; requested: number; requested_fix: number };
  groups: ReadinessGroup[];
  notes: string[];
  fresh_reads: number;
  duration_ms: number;
}
