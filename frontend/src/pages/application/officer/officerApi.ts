import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "../../../api";
import type { BBox } from "../../../types";

const enc = encodeURIComponent;

export interface LetterCitation {
  rule_id: string;
  rule_title?: string | null;
  doc?: string | null;
  doc_title?: string | null;
  section?: string | null;
  page?: number | string | null;
  quote?: string | null;
}

export interface LetterItem {
  finding_ids: string[];
  codes: string[];
  title: string;
  description: string;
  required: string;
  citation: LetterCitation | null;
  respond_by: string;
}

export interface Letter {
  id: string;
  application_id: string;
  round: number;
  status: "draft" | "final" | string;
  subject: string;
  intro: string;
  items: LetterItem[];
  finalised_at: string | null;
  final_sha256: string | null;
  rectification_id: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  finalised_by?: string | null;
  final_reason?: string | null;
  page_count?: number | null;
}

export interface LetterItemInput {
  finding_ids: string[];
  title: string;
  description: string;
  required: string;
  rule_id: string | null;
  respond_by: string;
}

export interface FinaliseResult {
  letter: Letter;
  rectification_id: string;
  rectification_created: boolean;
  round: number;
}

export interface PackFile {
  name: string;
  sha256: string;
  size: number;
  role: string;
}

export interface PackResult {
  pack_id: string;
  application_id: string;
  filename: string;
  size: number;
  zip_sha256: string;
  manifest_sha256: string;
  public_key: string;
  include_originals: boolean;
  files: PackFile[];
  stages: { stage: string; ms: number }[];
  total_ms: number;
  findings: number;
  audit_events: number;
  checkpoint_seq: number;
  generated_at: string;
  download_url: string;
}

export type AskTarget =
  | { type: "finding"; finding_id: string }
  | { type: "region"; document_id: string; page: number; bbox: BBox; label: string; finding_id: string }
  | { type: "document"; document_id: string }
  | { type: "verification"; attempt_id: string; document_id: string | null }
  | ({ type: "rule" } & LetterCitation)
  | { type: "run"; run_id: string };

export interface AskEvidence {
  id: string;
  kind: "finding" | "region" | "document" | "verification" | "rule" | "run";
  label: string;
  text: string;
  target: AskTarget;
}

export interface AskAnswer {
  question: string;
  mode: "model" | "template";
  provider: string | null;
  model: string | null;
  external: boolean;
  sentences: { text: string; cites: string[] }[];
  dropped: { text: string; cites: string[]; reason: string }[];
  dropped_count: number;
  proposed_count: number;
  evidence: Record<string, AskEvidence>;
  context_items: number;
  errors: string[];
  run_id: string | null;
  latency_ms: number;
  notice: string;
}

export const officerApi = {
  draftLetter: (appId: string, findingIds?: string[]) =>
    request<Letter>("POST", `/applications/${enc(appId)}/letters`, { finding_ids: findingIds?.length ? findingIds : null }),
  letters: (appId: string) => request<Letter[]>("GET", `/applications/${enc(appId)}/letters`),
  letter: (id: string) => request<Letter>("GET", `/letters/${enc(id)}`),
  updateLetter: (id: string, body: { subject: string; intro: string; items: LetterItemInput[] }) =>
    request<Letter>("PUT", `/letters/${enc(id)}`, body),
  finaliseLetter: (id: string, reason: string, message: string | null) =>
    request<FinaliseResult>("POST", `/letters/${enc(id)}/finalise`, { reason, message }),
  letterPdfUrl: (id: string) => `/api/letters/${enc(id)}/pdf`,
  letterPageUrl: (id: string, page: number, version: string) => `/api/letters/${enc(id)}/pages/${page}.png?v=${enc(version)}`,
  exportPack: (appId: string, includeOriginals: boolean) =>
    request<PackResult>("POST", `/applications/${enc(appId)}/evidence-packs`, { include_originals: includeOriginals }),
  ask: (appId: string, question: string) => request<AskAnswer>("POST", `/applications/${enc(appId)}/ask`, { question }),
};

export const lettersKey = (appId: string) => ["application", appId, "letters"] as const;

export function useLetters(appId: string, enabled = true) {
  return useQuery({ queryKey: lettersKey(appId), queryFn: () => officerApi.letters(appId), enabled });
}

export function useInvalidateLetters(appId: string) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: lettersKey(appId) });
}

export function useAsk(appId: string) {
  return useMutation({ mutationFn: (question: string) => officerApi.ask(appId, question) });
}
