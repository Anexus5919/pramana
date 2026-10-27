import { humanize } from "../../../../lib/labels";
import type { DocumentDetail, Finding, VerificationAttempt } from "../../../../types";
import { validBox } from "../../data";
import { INSTRUCTION_CODE, instructionLinesOf, type InstructionLine } from "../../viewer/overlays";

/** Statuses that wait for the verification cell to confirm offline. */
export const NEEDS_MANUAL = new Set(["source_unavailable", "verification_pending", "manual_review_required"]);

export const DOC_PANELS = ["fields", "verification", "forensics", "revisions", "extraction"] as const;
export type DocPanel = (typeof DOC_PANELS)[number];

/** Parameters that belong to one open document; cleared when the document closes or changes. */
export const DOC_PARAMS = { doc: null, page: null, hl: null, hlabel: null, panel: null, rev: null } as const;

export const when = (a: VerificationAttempt) => a.completed_at ?? a.started_at ?? "";

const TEXT_SOURCE: Record<string, string> = {
  digital: "Text layer",
  ocr: "OCR",
  mixed: "Text layer and OCR",
  none: "No text",
};

export function textSourceLabel(s: string | null | undefined): string {
  return s ? (TEXT_SOURCE[s] ?? humanize(s)) : "Text source unknown";
}

/** Findings that point at a document, by owner or by evidence. */
export function docFindings(findings: Finding[] | undefined, docId: string): Finding[] {
  return (findings ?? []).filter((f) => f.document_id === docId || f.evidence.some((e) => "document_id" in e && e.document_id === docId));
}

/** Attempts from the latest run, plus manual confirmations, which stand across runs. */
export function currentAttempts(all: VerificationAttempt[], latestRun: string | undefined): VerificationAttempt[] {
  return all.filter((a) => !latestRun || a.run_id === latestRun || a.channel === "manual_confirmation");
}

/** Ids of the attempts a manual confirmation has followed, which no longer wait for one. */
export function followedIds(all: VerificationAttempt[]): Set<string> {
  const out = new Set<string>();
  for (const a of all) if (a.channel === "manual_confirmation" && typeof a.request?.follows === "string") out.add(a.request.follows);
  return out;
}

/** Instruction lines from the document, or from the instruction finding when the API does not return them. */
export function instructionLinesFor(doc: DocumentDetail, findings: Finding[] | undefined): InstructionLine[] {
  const own = instructionLinesOf(doc);
  if (own.length) return own;
  const out: InstructionLine[] = [];
  for (const f of findings ?? []) {
    if (f.code !== INSTRUCTION_CODE) continue;
    for (const e of f.evidence) {
      if (e.kind === "region" && (e.document_id ?? f.document_id) === doc.id && e.page && validBox(e.bbox)) out.push({ page: e.page, bbox: e.bbox, text: String(e.value ?? e.raw ?? "") });
    }
  }
  return out;
}
