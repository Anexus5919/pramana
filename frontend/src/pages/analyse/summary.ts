import { severityRank } from "../../lib/labels";
import type { Analysis } from "./analyseApi";

export const STEP_LABEL: Record<string, string> = {
  read: "Read text",
  extract: "Classify and extract",
  fingerprints: "Fingerprints",
  forensics: "Forensics",
  qr: "Find QR codes",
  signatures: "Signatures",
  signed_qr: "Signed QR",
  registry: "Issuer registry",
  revisions: "Revisions",
};

/** Stages the server runs for every file, in order; shown while a file is being analysed. */
export const PENDING_STEPS = ["read", "extract", "forensics", "qr", "signatures", "signed_qr", "registry", "revisions"];

export const TEXT_SOURCE: Record<string, string> = {
  digital: "Text layer",
  ocr: "OCR",
  mixed: "Text layer and OCR",
  unreadable: "Unreadable",
};

export function isPdf(a: Analysis): boolean {
  return a.mime === "application/pdf";
}

/** Signatures with a certificate, as Verify a PDF reads them. */
export function signedOnly(a: Analysis) {
  return a.signatures.filter((s) => s.response?.signer);
}

export function modifiedAfterSigning(a: Analysis): boolean {
  return signedOnly(a).some((s) => s.response.coverage !== "ENTIRE_FILE" && !["NONE", "LTA_UPDATES"].includes(String(s.response.modification_level)));
}

export function indicatorCount(a: Analysis): { all: number; high: number } {
  const s = (a.document.forensic_signals ?? []).filter((x) => x.severity !== "info");
  return { all: s.length, high: s.filter((x) => (severityRank[x.severity] ?? 9) <= 1).length };
}

export interface IndexEntry {
  id: string;
  label: string;
}

/** The report's sections in reading order, for the in-page index. Mirrors what Report renders. */
export function reportIndex(a: Analysis): IndexEntry[] {
  const pdf = isPdf(a);
  const out: IndexEntry[] = [{ id: "report", label: "Report" }];
  if (a.story) out.push({ id: "story", label: "Life story" });
  out.push({ id: "intake", label: "Intake" });
  if (!pdf) out.push({ id: "capture", label: "Capture metadata" }, { id: "photo", label: "Content Credentials" }, { id: "room", label: "Room detection" });
  out.push({ id: "text", label: "Text" }, { id: "type", label: "Document type" });
  if (pdf || a.document.fields.length > 0) out.push({ id: "fields", label: "Fields" });
  out.push({ id: "qr", label: "Signed QR" }, { id: "registry", label: "Issuer registry" }, { id: "structure", label: "Indicators" });
  out.push({ id: "instructions", label: "Text aimed at AI readers" });
  if (pdf) {
    out.push({ id: "signatures", label: "Signatures" });
    if (a.revisions && (a.revision_count ?? 1) >= 2) out.push({ id: "revisions", label: "Time machine" });
    out.push({ id: "file", label: "File structure" });
  }
  out.push({ id: "limits", label: "What Pramana cannot know" });
  return out;
}
