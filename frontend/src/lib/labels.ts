export type Tone = "verified" | "mismatch" | "expired" | "pending" | "unavail" | "manual" | "unchecked" | "primary";

/** Label for a fact path such as doc.fire_noc.valid_until: its last segment, humanized. */
export function pathLabel(s: string | null | undefined): string {
  if (!s) return "";
  return humanize(s.includes(".") ? s.slice(s.lastIndexOf(".") + 1) : s);
}

export function humanize(s: string | null | undefined): string {
  if (!s) return "";
  const t = s.replace(/[_.]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const VERIFICATION_STATUSES = [
  "verified",
  "mismatch_detected",
  "expired",
  "verification_pending",
  "source_unavailable",
  "manual_review_required",
  "not_checked",
] as const;

export const verificationMeta: Record<string, { label: string; tone: Tone; meaning: string }> = {
  verified: { label: "Verified", tone: "verified", meaning: "Matches the authoritative source." },
  mismatch_detected: {
    label: "Mismatch detected",
    tone: "mismatch",
    meaning: "The authoritative source disagrees with what was submitted.",
  },
  expired: { label: "Expired", tone: "expired", meaning: "Confirmed by the source, but its validity has ended." },
  verification_pending: {
    label: "Verification pending",
    tone: "pending",
    meaning: "The issuer confirms asynchronously; awaiting a response.",
  },
  source_unavailable: {
    label: "Source unavailable",
    tone: "unavail",
    meaning: "The issuing source did not respond; routed for manual confirmation.",
  },
  manual_review_required: {
    label: "Manual review required",
    tone: "manual",
    meaning: "Automated checks could not reach a conclusion.",
  },
  not_checked: { label: "Not checked", tone: "unchecked", meaning: "No verification channel applied." },
};

export const outcomeMeta: Record<string, { label: string; tone: Tone }> = {
  pass: { label: "Pass", tone: "verified" },
  fail: { label: "Fail", tone: "mismatch" },
  insufficient_evidence: { label: "Insufficient evidence", tone: "manual" },
  not_applicable: { label: "Not applicable", tone: "unchecked" },
  error: { label: "Error", tone: "unavail" },
};

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export const EVIDENCE_CLASSES = [
  "cryptographic",
  "issuer",
  "record",
  "rule",
  "structural",
  "heuristic",
  "model",
] as const;

export const evidenceClassMeta: Record<string, { label: string; meaning: string; level: number }> = {
  cryptographic: {
    label: "Cryptographic",
    meaning: "A signature or signed QR checked against a public key.",
    level: 1,
  },
  issuer: { label: "Issuer", meaning: "A response from the issuing authority's registry.", level: 2 },
  record: { label: "Record", meaning: "Compared with AICTE reference records.", level: 3 },
  rule: { label: "Rule", meaning: "A deterministic check of the submitted data.", level: 4 },
  structural: { label: "Structural", meaning: "An observable fact about the file itself.", level: 5 },
  heuristic: { label: "Heuristic", meaning: "An indicator that needs human judgement.", level: 6 },
  model: { label: "Model", meaning: "A machine-learning suspicion; weakest evidence.", level: 7 },
};

export const CATEGORIES = [
  "completeness",
  "compliance",
  "validity",
  "verification",
  "forensic",
  "consistency",
] as const;

export const categoryMeta: Record<string, { label: string; short: string; meaning: string }> = {
  completeness: { label: "Completeness", short: "Completeness", meaning: "Required documents and readable values." },
  compliance: { label: "Compliance", short: "Compliance", meaning: "Norms and conditions from the cited regulations." },
  validity: { label: "Validity", short: "Validity", meaning: "Dates, validity periods and expiry." },
  verification: { label: "Verification", short: "Verification", meaning: "Signatures, signed QR codes and issuer registries." },
  forensic: { label: "Document forensics", short: "Forensics", meaning: "Observable traces in the files themselves." },
  consistency: {
    label: "Consistency",
    short: "Consistency",
    meaning: "Agreement between documents, records and other applications.",
  },
};

export const reviewStatusMeta: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "pending" },
  acknowledged: { label: "Acknowledged", tone: "primary" },
  accepted: { label: "Flag accepted", tone: "mismatch" },
  dismissed: { label: "Dismissed", tone: "unchecked" },
  escalated: { label: "Escalated for inspection", tone: "unavail" },
  evidence_requested: { label: "Evidence requested", tone: "manual" },
  resolved: { label: "Resolved", tone: "verified" },
};

export const reviewActionLabel: Record<string, string> = {
  acknowledge: "Acknowledged",
  accept: "Accepted flag",
  dismiss: "Dismissed",
  escalate_inspection: "Escalated for inspection",
  request_evidence: "Requested evidence",
  resolve: "Resolved",
  note: "Added note",
};

export const appStatusMeta: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "unchecked" },
  submitted: { label: "Submitted", tone: "pending" },
  validating: { label: "Validating", tone: "pending" },
  under_review: { label: "Under review", tone: "primary" },
  rectification_requested: { label: "Rectification requested", tone: "manual" },
  rectified: { label: "Rectified, resubmitted", tone: "pending" },
};

export const CHANNELS = [
  "issuer_signature",
  "applicant_signature",
  "signed_qr",
  "issuer_registry",
  "content_credentials",
  "manual_confirmation",
] as const;

const SIGNATURE_CHANNELS = new Set(["issuer_signature", "applicant_signature", "pdf_signature", "content_credentials"]);

export function isSignatureChannel(channel: string): boolean {
  return SIGNATURE_CHANNELS.has(channel);
}

export const channelMeta: Record<string, { label: string; meaning: string }> = {
  issuer_signature: {
    label: "Issuer signature",
    meaning: "Embedded PAdES signature of the issuing authority, validated against trust anchors.",
  },
  applicant_signature: {
    label: "Applicant signature",
    meaning: "The institution's own DSC. Proves who uploaded the file, not who issued it.",
  },
  pdf_signature: { label: "PDF signature", meaning: "Embedded PAdES/CMS signature validated against trust anchors." },
  signed_qr: { label: "Signed QR", meaning: "Issuer-signed QR token verified offline with the issuer's key." },
  issuer_registry: { label: "Issuer registry", meaning: "Reference number looked up with the issuing authority." },
  content_credentials: {
    label: "Content credentials",
    meaning: "C2PA manifest embedded in a photo, validated against the DEMO capture trust list.",
  },
  manual_confirmation: { label: "Manual confirmation", meaning: "Recorded by the verification cell after an offline check." },
};

export const stageLabel: Record<string, string> = {
  document_processing: "Document processing",
  extraction_checks: "Extraction checks",
  rules: "Rule evaluation",
  verification: "Verification",
  forensics: "Forensics",
  cross_application: "Cross-application checks",
};

export const PIPELINE_STAGES = [
  "document_processing",
  "extraction_checks",
  "rules",
  "verification",
  "forensics",
  "cross_application",
] as const;

export const factSourceMeta: Record<string, { label: string; tone: Tone }> = {
  declared: { label: "Declared", tone: "unchecked" },
  document: { label: "Document", tone: "pending" },
  reference: { label: "Reference record", tone: "primary" },
  verified: { label: "Verified", tone: "verified" },
  derived: { label: "Derived", tone: "manual" },
};

export const roleOrder = ["officer", "verifier", "admin", "institution"] as const;

export const roleLabel: Record<string, string> = {
  institution: "Institution applicant",
  officer: "Scrutiny officer",
  verifier: "Verification cell",
  admin: "Administrator / auditor",
};

export const graphKindMeta: Record<string, { label: string; meaning: string }> = {
  application: { label: "Application", meaning: "An application in the same academic year." },
  faculty: { label: "Faculty member", meaning: "A faculty ID listed by more than one institution." },
  ref: { label: "Certificate number", meaning: "An issuer reference number used more than once." },
  sha256: { label: "Identical file", meaning: "Byte-identical file (SHA-256)." },
  phash: { label: "Similar photo", meaning: "Perceptually near-identical image." },
  minhash: { label: "Similar text", meaning: "Near-duplicate document text." },
  fields: { label: "Same certificate details", meaning: "Identical extracted values in another institution's document." },
};
