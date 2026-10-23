import { pluralize } from "../../lib/format";
import { humanize, severityRank } from "../../lib/labels";
import type { PdfVerifyResult } from "../../types";
import type { Tone } from "../../ui/tone";
import type { Analysis } from "./analyseApi";
import { credentialState } from "../application/campus/PhotoCard";

export interface Tile {
  id: string;
  label: string;
  tone: Tone;
  value: string;
  note?: string;
  tag?: "DEMO" | "SIMULATED";
}

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

export function asPdfResult(a: Analysis): PdfVerifyResult {
  return {
    filename: a.filename,
    sha256: a.sha256,
    pages: a.page_count,
    active_content: a.intake.active_content,
    signatures: a.signatures,
    forensic_signals: a.document.forensic_signals ?? [],
    revisions: a.revision_count,
    metadata: a.metadata,
  };
}

export function indicatorCount(a: Analysis): { all: number; high: number } {
  const s = (a.document.forensic_signals ?? []).filter((x) => x.severity !== "info");
  return { all: s.length, high: s.filter((x) => (severityRank[x.severity] ?? 9) <= 1).length };
}

function signatureTile(a: Analysis): Tile {
  const signed = signedOnly(a);
  if (!signed.length) return { id: "signatures", label: "Digital signature", tone: "unchecked", value: "No embedded signature", note: "A seal image is not a signature" };
  const order = ["mismatch_detected", "expired", "manual_review_required", "source_unavailable", "verification_pending", "verified"];
  const worst = order.find((st) => signed.some((s) => s.status === st)) ?? signed[0].status;
  const s = signed.find((x) => x.status === worst) ?? signed[0];
  const r = s.response;
  const anchor = typeof r.trust_anchor === "string" ? (r.demo_anchor ? "DEMO root" : r.trust_anchor.startsWith("India PKI") ? "India PKI (CCA)" : "configured root") : null;
  if (modifiedAfterSigning(a)) return { id: "signatures", label: "Digital signature", tone: "mismatch", value: "Modified after signing", note: `${pluralize(signed.length, "signature")}, the later revision is not covered` };
  if (worst === "verified") return { id: "signatures", label: "Digital signature", tone: "verified", value: `Intact, chains to ${anchor ?? "a trust anchor"}`, note: r.revocation_checked ? "Revocation checked" : "Revocation not checked (offline)", tag: r.demo_anchor ? "DEMO" : undefined };
  if (r.trusted === false) return { id: "signatures", label: "Digital signature", tone: "manual", value: "Intact, signer not confirmed", note: "Does not chain to a configured root" };
  return { id: "signatures", label: "Digital signature", tone: worst === "mismatch_detected" ? "mismatch" : "manual", value: humanize(worst), note: s.detail.slice(0, 90) };
}

export function tiles(a: Analysis): Tile[] {
  const out: Tile[] = [];
  const pdf = isPdf(a);
  const active = a.intake.active_content.length;
  out.push({
    id: "intake",
    label: "Intake",
    tone: active ? "manual" : "verified",
    value: active ? `${pluralize(active, "kind")} of active content` : `${pdf ? "PDF" : a.mime === "image/png" ? "PNG" : "JPEG"} accepted`,
    note: `${pluralize(a.page_count, "page")}, content matches the extension`,
  });
  const hindi = a.text.hindi_lines ? `, ${pluralize(a.text.hindi_lines, "Hindi line")} read` : "";
  if (a.incomplete) out.push({ id: "text", label: "Text source", tone: "manual", value: "Stopped at the time limit", note: "Needs review: text, fields and forensics are missing" });
  else out.push({
    id: "text",
    label: "Text source",
    tone: a.text.unreadable_pages.length ? "manual" : "primary",
    value: TEXT_SOURCE[a.text.source ?? ""] ?? humanize(a.text.source),
    note: a.text.unreadable_pages.length ? `${pluralize(a.text.unreadable_pages.length, "page")} unreadable` : `Every page read${hindi}`,
  });
  const fields = a.document.fields;
  const read = fields.filter((f) => f.value !== null).length;
  out.push({
    id: "type",
    label: "Document type",
    tone: a.doc_type.type ? "primary" : "unchecked",
    value: a.doc_type.label ?? "Not recognised",
    note: a.doc_type.type ? `${read} of ${pluralize(fields.length, "field")} read` : a.doc_type.classification?.ambiguous ? "Two types scored equally" : "No ruleset document type matched",
  });
  if (pdf) out.push(signatureTile(a));
  const signedQr = a.qr.filter((q) => q.signed);
  if (signedQr.length) {
    const q = signedQr.find((x) => x.status !== "verified") ?? signedQr[0];
    out.push({ id: "qr", label: "Signed QR", tone: q.status === "verified" ? "verified" : q.status === "expired" ? "expired" : q.status === "mismatch_detected" ? "mismatch" : "manual", value: humanize(q.status), note: q.issuer ?? "Unknown issuer key", tag: q.simulated ? "SIMULATED" : undefined });
  } else {
    out.push({ id: "qr", label: "Signed QR", tone: "unchecked", value: a.qr.length ? "QR without a signed token" : "No QR code found" });
  }
  const reg = a.registry;
  out.push(
    reg.queried && reg.result
      ? { id: "registry", label: "Issuer registry", tone: reg.result.status === "verified" ? "verified" : reg.result.status === "expired" ? "expired" : reg.result.status === "mismatch_detected" ? "mismatch" : "manual", value: humanize(reg.result.status), note: reg.issuer, tag: "SIMULATED" }
      : { id: "registry", label: "Issuer registry", tone: "unchecked", value: "Not queried", note: reg.reason },
  );
  if (pdf) {
    const n = a.revision_count ?? 1;
    const after = (a.revisions?.revisions ?? []).filter((r) => r.after_last_signature).length;
    out.push({ id: "revisions", label: "Revisions", tone: n > 1 ? (after ? "mismatch" : "manual") : "verified", value: n > 1 ? `${n} revisions` : "One revision", note: n > 1 ? (after ? `${pluralize(after, "revision")} after the last signature` : "Appended content; see the time machine") : "Nothing appended after the first save" });
  }
  const ind = indicatorCount(a);
  // A valid signature over the whole file means these features were there when the issuer signed
  const sealed = signedOnly(a).some((s) => s.status === "verified" && s.response.coverage === "ENTIRE_FILE");
  const sev = ind.high ? `${ind.high} high severity` : "Low or medium severity";
  out.push({ id: "structure", label: pdf ? "Structure forensics" : "Photo forensics", tone: ind.high ? "mismatch" : ind.all ? "manual" : "verified", value: ind.all ? pluralize(ind.all, "indicator") : "No indicators", note: ind.all ? (sealed ? `${sev}; all present when the file was signed` : sev) : undefined });
  const instr = a.document.instruction_lines ?? [];
  out.push({ id: "instructions", label: "Text aimed at AI readers", tone: instr.length ? "manual" : "verified", value: instr.length ? pluralize(instr.length, "line") : "None found" });
  if (a.photo) {
    const c = credentialState(a.photo.c2pa);
    out.push({ id: "photo", label: "Content Credentials", tone: c.tone, value: c.label, note: a.photo.room.status === "analysed" ? `Detector reads a ${String(a.photo.room.room_type ?? "room").replace(/_/g, " ")}` : undefined, tag: a.photo.c2pa.present ? "DEMO" : undefined });
  }
  return out;
}
