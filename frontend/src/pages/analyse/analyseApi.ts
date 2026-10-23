import { request } from "../../api";
import type { BBox, Comparison, ContentCredentials, DocumentDetail, PdfSignatureCheck, RoomReading, VerificationStatus } from "../../types";
import type { Revisions } from "../application/history/api";
import type { LifeStoryData } from "../application/insights/storyApi";

// Mirrors backend/pramana/analyse/core.py

export interface AnalyseStep {
  step: string;
  ms: number;
  [key: string]: unknown;
}

export interface QrCheck {
  page: number;
  bbox: BBox;
  length: number;
  signed: boolean;
  status: VerificationStatus;
  detail: string;
  text?: string;
  kid?: string | null;
  issuer?: string | null;
  simulated?: boolean;
  payload?: Record<string, unknown> | null;
  comparisons?: Comparison[];
  claim?: string;
}

export interface RegistryCheck {
  queried: boolean;
  reason?: string;
  issuer_code?: string;
  issuer?: string;
  simulated?: boolean;
  ref_field?: string;
  ref_no?: string;
  result?: PdfSignatureCheck & { channel: string; source_name: string; comparisons: Comparison[]; request: Record<string, unknown> };
}

export interface SealImage {
  page: number;
  bbox: BBox;
  sha256: string;
  phash: string;
  px: [number, number];
}

export interface AnalysedPhoto {
  width: number | null;
  height: number | null;
  exif: { captured: string | null; captured_original: string | null; camera: string | null; software: string | null; gps: [number, number] | null };
  attribution: { artist?: string; copyright?: string; description?: string } | null;
  c2pa: ContentCredentials;
  c2pa_status: { status: VerificationStatus; detail: string; claim: string } | null;
  room: RoomReading;
}

export interface Analysis {
  token: string;
  /** Set when reading stopped at the sandbox time limit; the checks that do not need the text still ran */
  incomplete: { reason: string; after: string | null } | null;
  filename: string;
  sha256: string;
  size_bytes: number;
  mime: string;
  page_count: number;
  ruleset: { id: string; version: string | number };
  intake: { mime: string; page_count: number; active_content: { key: string; count: number; meaning: string }[]; notes: string[] };
  steps: AnalyseStep[];
  document: DocumentDetail & { instruction_lines?: { page: number; bbox: BBox; text: string }[] };
  doc_type: {
    type: string | null;
    label: string | null;
    classification: DocumentDetail["classification"];
    labels: Record<string, string>;
  };
  text: { source: string | null; unreadable_pages: number[]; hindi_pages: number; hindi_lines: number };
  signatures: PdfSignatureCheck[];
  qr: QrCheck[];
  registry: RegistryCheck;
  revisions: (Omit<Revisions, "supported"> & { supported?: boolean }) | null;
  revision_count: number | null;
  metadata: Record<string, string>;
  seal_images: SealImage[];
  photo: AnalysedPhoto | null;
  cannot_know: { what: string; why: string }[];
  /** Life story from the in-memory analysis; null when it could not be built */
  story?: LifeStoryData | null;
  expires_at: string;
}

const enc = encodeURIComponent;

export const analyseApi = {
  analyse: (file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return request<Analysis>("POST", "/analyse", fd);
  },
  forget: (token: string) => request<{ forgotten: boolean }>("DELETE", `/analyse/${enc(token)}`),
  pageUrl: (token: string, page: number) => `/api/analyse/${enc(token)}/pages/${page}.png`,
  revisionPageUrl: (token: string, n: number, page: number) => `/api/analyse/${enc(token)}/revisions/${n}/pages/${page}.png`,
  photoUrl: (token: string) => `/api/analyse/${enc(token)}/photo.jpg`,
};

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
