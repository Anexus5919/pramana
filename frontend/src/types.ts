// Shapes mirror backend/pramana/serializers.py and the run summary built in pipeline/validate.py.

type Open<T extends string> = T | (string & {});

export type Role = "institution" | "officer" | "verifier" | "admin";

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  institution_id: string | null;
}

export interface SessionInfo {
  user: User;
  csrf_token: string;
  role_label: string;
}

export interface DemoAccount extends User {
  role_label: string;
  institution: string | null;
}

export interface DemoAccounts {
  password: string;
  notice: string;
  accounts: DemoAccount[];
}

export interface Institution {
  id: string;
  aicte_id: string;
  name: string;
  aishe_code: string | null;
  society_name: string | null;
  address: string;
  state: string;
  district: string;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  institution_type: string;
  women_only: boolean;
  established_year: number | null;
}

export type Severity = Open<"critical" | "high" | "medium" | "low" | "info">;
export type EvidenceClass = Open<
  "cryptographic" | "issuer" | "record" | "rule" | "structural" | "heuristic" | "model"
>;
export type FindingCategory = Open<
  "completeness" | "compliance" | "validity" | "verification" | "forensic" | "consistency"
>;
export type VerificationStatus = Open<
  | "verified"
  | "mismatch_detected"
  | "expired"
  | "verification_pending"
  | "source_unavailable"
  | "manual_review_required"
  | "not_checked"
>;
export type RuleOutcome = Open<"pass" | "fail" | "insufficient_evidence" | "not_applicable" | "error">;
export type ReviewStatus = Open<
  "open" | "acknowledged" | "accepted" | "dismissed" | "escalated" | "evidence_requested" | "resolved"
>;
export type ApplicationStatus = Open<
  "draft" | "submitted" | "validating" | "under_review" | "rectification_requested" | "rectified"
>;
export type ReviewAction =
  | "acknowledge"
  | "accept"
  | "dismiss"
  | "escalate_inspection"
  | "request_evidence"
  | "resolve"
  | "note";

/** [x0, top, x1, bottom] with a top-left origin, in page units (PDF points or image pixels). */
export type BBox = [number, number, number, number];

export interface Comparison {
  field: string;
  submitted: unknown;
  authoritative: unknown;
  match: boolean | null;
  note?: string | null;
}

export interface Provenance {
  document_id?: string;
  field_id?: string;
  page?: number;
  bbox?: BBox;
  method?: string;
  raw?: string;
  filename?: string;
  record?: string;
  record_id?: string;
  records?: number;
  form_field?: string;
  [key: string]: unknown;
}

export interface FactInput {
  path: string;
  value: unknown;
  source: Open<"declared" | "document" | "reference" | "verified" | "derived">;
  provenance: Provenance;
}

export interface Citation {
  doc?: string;
  section?: string;
  clause?: string;
  page?: number | string;
  quote?: string;
  doc_title?: string | null;
  doc_url?: string | null;
  [key: string]: unknown;
}

export interface RegionEvidence {
  kind: "region";
  document_id?: string | null;
  page?: number | null;
  bbox?: BBox | null;
  label?: string;
  value?: unknown;
  raw?: string | null;
}
export interface DocumentEvidence {
  kind: "document";
  document_id: string;
}
export interface PeerDocumentEvidence {
  kind: "peer_document";
  document_id: string;
  application_id: string;
  page?: number | null;
  bbox?: BBox | null;
}
export interface ReferenceRecordEvidence {
  kind: "reference_record";
  record_id?: string | null;
  source?: string | null;
  label?: string;
  value?: unknown;
}
export interface DeclaredEvidence {
  kind: "declared";
  field?: string | null;
  label?: string;
  value?: unknown;
}
export interface VerificationEvidence {
  kind: "verification";
  channel: string;
  source: string;
  simulated: boolean;
  comparisons: Comparison[];
}
export interface RevisionDiff {
  from_revision: number;
  to_revision: number;
  page: number;
  added_text: string;
  removed_text: string;
  text_underneath: string;
  bbox: BBox | null;
}
export interface RevisionDiffEvidence extends RevisionDiff {
  kind: "revision_diff";
  document_id?: string;
}
export interface GeoEvidence {
  kind: "geo";
  photo: [number, number];
  campus: [number, number];
  distance_km: number;
  document_id?: string;
}
/** The same embedded image (a seal) on this document and on another application's document. */
export interface ImageMatchEvidence {
  kind: "image_match";
  document_id: string;
  page: number;
  bbox: BBox;
  issuer: string;
  peer_document_id: string;
  peer_application_id: string;
  peer_institution: string;
  peer_page: number;
  peer_bbox: BBox;
  peer_issuer: string;
  distance: number;
  exact: boolean;
}
export interface UnknownEvidence {
  kind: string;
  [key: string]: unknown;
}

export type Evidence =
  | RegionEvidence
  | DocumentEvidence
  | PeerDocumentEvidence
  | ReferenceRecordEvidence
  | DeclaredEvidence
  | VerificationEvidence
  | RevisionDiffEvidence
  | GeoEvidence
  | ImageMatchEvidence;

export interface FindingTrace {
  inputs?: FactInput[];
  missing?: string[];
  detail?: { computed?: Record<string, unknown>; [key: string]: unknown };
  check?: Record<string, unknown> | null;
}

export interface Finding {
  id: string;
  run_id: string;
  code: string;
  fingerprint: string;
  category: FindingCategory;
  evidence_class: EvidenceClass;
  severity: Severity;
  outcome: string;
  title: string;
  message: string;
  limitation: string | null;
  rule: { id: string; version?: string | number | null; citation?: Citation } | null;
  evidence: Evidence[];
  trace: FindingTrace;
  document_id: string | null;
  review_status: ReviewStatus;
  review_note: string | null;
}

export interface ReviewEntry {
  id: string;
  finding_id: string;
  actor_id: string;
  actor: string | null;
  action: ReviewAction | string;
  note: string | null;
  created_at: string;
}

export interface Stage {
  stage: string;
  ms: number;
  [key: string]: unknown;
}

export interface ChecklistEntry {
  rule_id: string;
  title: string;
  category: string | null;
  outcome: RuleOutcome;
  message: string;
  severity: Severity | null;
  citation: Citation;
  inputs: FactInput[];
  missing: string[];
  evidence: Evidence[];
}

export interface GraphNode {
  id: string;
  kind: Open<"application" | "faculty" | "ref" | "sha256" | "phash" | "minhash">;
  label: string;
  focus?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  code: string;
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RunBrief {
  id: string;
  status: Open<"running" | "complete" | "failed">;
  round: number;
  ruleset_id: string;
  ruleset_hash: string;
  engine_version: string;
  input_digest: string | null;
  report_digest: string | null;
  started_at: string | null;
  finished_at: string | null;
  findings: number | null;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  by_evidence_class: Record<string, number>;
  review_priority: number | null;
  document_status: Record<string, VerificationStatus>;
  as_of: string | null;
  replay_of: string | null;
  triggered_by: string | null;
  error: string | null;
}

export interface RunFull extends RunBrief {
  stages: Stage[];
  checklist: ChecklistEntry[];
  graph: RelationshipGraph | null;
  resolved_since_previous: { code: string; title: string }[];
  previous_run: string | null;
  facts: FactInput[];
}

export interface ReplayResult {
  original: RunBrief;
  replay: RunBrief;
  inputs_identical: boolean;
  report_identical: boolean;
}

export interface Programme {
  code: string;
  name: string;
  level: string;
  approved_intake: number;
  proposed_intake: number;
  duration_years?: number;
  core?: boolean;
  cs_allied?: boolean;
  nba_accredited?: boolean;
  [key: string]: unknown;
}

export type Declared = Record<string, unknown> & { programmes?: Programme[] };

export interface Application {
  id: string;
  institution: Institution;
  category: string;
  academic_year: string;
  status: ApplicationStatus;
  round: number;
  declared: Declared;
  created_at: string | null;
  submitted_at: string | null;
  latest_run: RunBrief | null;
}

export interface ChecklistSlot {
  doc_type: string;
  label: string;
  description: string | null;
  required: boolean;
  uploaded: boolean;
}

export interface RectificationItem {
  finding_id: string;
  code: string;
  title: string;
  message: string;
}

export interface Rectification {
  id: string;
  round: number;
  items: RectificationItem[];
  message: string | null;
  status: Open<"open" | "responded">;
  created_at: string;
  responded_at: string | null;
}

export interface DocumentSummary {
  id: string;
  application_id: string;
  round: number;
  declared_type: string;
  detected_type: string | null;
  original_filename: string;
  sha256: string;
  size_bytes: number;
  mime: string;
  page_count: number;
  text_source: string | null;
  processing_status: Open<"pending" | "processed" | "failed">;
  processing_error: string | null;
  uploaded_at: string | null;
  superseded: boolean;
}

export interface ApplicationDetail extends Application {
  category_label: string;
  checklist_source: Record<string, unknown> | string | null;
  document_checklist: ChecklistSlot[];
  documents: DocumentSummary[];
  rectifications: Rectification[];
}

export interface DashboardRow extends Application {
  open_findings: number;
  open_high: number;
}

export interface DashboardAlert {
  application_id: string;
  institution: string;
  finding_id: string | null;
  severity: Severity;
  category: string;
  title: string;
  kind: Open<"high_severity_finding" | "source_unavailable" | "verification_pending">;
  attempt_id?: string;
}

export interface Dashboard {
  applications: DashboardRow[];
  status_counts: Record<string, number>;
  verification_counts: Record<string, number>;
  open_findings_by_category: Record<string, number>;
  open_findings: number;
  alerts: DashboardAlert[];
}

export interface ExtractedField {
  id: string;
  name: string;
  raw: string | null;
  value: string | null;
  value_type: string;
  page: number | null;
  bbox: BBox | null;
  method: string;
  confidence: number | null;
  status: Open<"extracted" | "uncertain" | "unparseable" | "missing">;
}

export interface DocumentPage {
  page_no: number;
  width: number;
  height: number;
  text_source: string;
  ocr_mean_confidence: number | null;
  text: string;
}

export interface ForensicSignal {
  code: string;
  title: string;
  detail: string;
  severity: Severity;
  evidence: Evidence[];
  limitation: string | null;
}

export interface PdfForensicFacts {
  revisions?: number;
  metadata?: { info?: Record<string, string>; xmp?: Record<string, string>; fonts?: string[] };
  revision_diffs?: RevisionDiff[];
  overlapping_text?: { page: number; bbox: BBox; overlapping_glyph_pairs: number }[];
  covered_text?: { page: number; bbox: BBox; text_under_or_over: string }[];
  created?: string | null;
  modified?: string | null;
  // Image documents carry EXIF facts instead
  width?: number;
  height?: number;
  format?: string;
  Make?: string;
  Model?: string;
  Software?: string;
  DateTime?: string;
  DateTimeOriginal?: string;
  gps?: [number, number];
  distance_km?: number;
  [key: string]: unknown;
}

export interface VerificationAttempt {
  id: string;
  document_id: string | null;
  run_id: string | null;
  channel: Open<"pdf_signature" | "signed_qr" | "issuer_registry" | "manual_confirmation">;
  source_name: string;
  simulated: boolean;
  status: VerificationStatus;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  comparison: Comparison[];
  detail: string | null;
  actor: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface TableRow {
  _page?: number;
  _bbox?: BBox | null;
  [key: string]: unknown;
}

export interface DocumentDetail extends DocumentSummary {
  classification: {
    type?: string | null;
    candidates?: { type: string; score: number; matched: string[]; excluded_by: string[] }[];
    ambiguous?: boolean;
    method?: string;
  } | null;
  pages: DocumentPage[];
  fields: ExtractedField[];
  forensic_signals?: ForensicSignal[];
  forensic_facts?: PdfForensicFacts;
  qr: { page: number; bbox: BBox; length: number }[];
  rows: TableRow[] | null;
  fingerprints?: Record<string, unknown>;
  verifications?: VerificationAttempt[];
}

export interface AuditEvent {
  seq: number;
  ts: string;
  actor: string;
  actor_role: string;
  action: string;
  object_type: string;
  object_id: string | null;
  application_id: string | null;
  details: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

export interface ChainVerification {
  events_checked: number;
  intact: boolean;
  first_broken_seq: number | null;
  head_hash: string;
  checkpoints: { seq: number; signature_valid: boolean; matches_chain: boolean; created_at: string }[];
}

export interface Checkpoint {
  seq?: number;
  head_hash?: string;
  signature?: string;
}

export interface RuleSource {
  id: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

export interface Rule {
  id: string;
  version?: string | number;
  title: string;
  category?: string;
  severity?: Severity;
  applies_to?: { categories?: string[]; when?: string } | null;
  effective_from?: string | null;
  effective_to?: string | null;
  source?: Citation | null;
  check: { type: string; expr?: string; date?: string; doc_type?: string; doc_types?: string[]; [key: string]: unknown };
  messages?: Record<string, string>;
  limitation?: string | null;
  [key: string]: unknown;
}

export interface DocumentTypeSpec {
  label?: string;
  description?: string;
  fields?: string[];
  verification?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChecklistSpec {
  label?: string;
  source?: unknown;
  required?: string[];
  optional?: string[];
  [key: string]: unknown;
}

export interface ActiveRuleset {
  id: string;
  title: string;
  version: string;
  sha256: string;
  sources: RuleSource[];
  rules: Rule[];
  document_types: Record<string, DocumentTypeSpec>;
  checklists: Record<string, ChecklistSpec>;
}

export interface RuleImpact {
  active_ruleset: string;
  active_hash: string;
  affected: {
    application_id: string;
    institution: string;
    changes: { rule_id: string; before: string | null; after: string | null }[];
  }[];
}

export interface SimIssuer {
  code: string;
  name: string;
  available?: boolean;
  latency_ms?: number;
  mode?: string;
  compare_fields?: string[];
  simulated: true;
  [key: string]: unknown;
}

export interface SimLookup {
  simulated: true;
  issuer: string;
  found: boolean;
  record: Record<string, unknown> | null;
  mode: string;
}

export interface RunMetrics {
  runs: number;
  mean_seconds: number | null;
  max_seconds: number | null;
}

export interface NewApplicationBody {
  category: string;
  academic_year: string;
  declared: Declared;
}

export interface SignatureResponse {
  field?: string;
  signer?: string;
  signer_role?: string;
  trust_anchor?: string | null;
  demo_anchor?: boolean | null;
  coverage?: string;
  modification_level?: string;
  signing_time?: string | null;
  validated_at?: string;
  time_source?: string;
  revocation_checked?: boolean;
  intact?: boolean;
  valid?: boolean;
  trusted?: boolean;
  revoked?: boolean;
  docmdp_ok?: boolean | null;
  [key: string]: unknown;
}

export interface PdfSignatureCheck {
  status: VerificationStatus;
  simulated: boolean;
  detail: string;
  claim: string | null;
  response: SignatureResponse;
}

export interface PdfVerifyResult {
  filename: string;
  sha256: string;
  pages: number;
  active_content: { key: string; count: number; meaning: string }[];
  signatures: PdfSignatureCheck[];
  forensic_signals: ForensicSignal[];
  revisions: number | null;
  metadata: Record<string, string>;
}
