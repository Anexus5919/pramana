import { useQuery } from "@tanstack/react-query";
import { request } from "../../../api";
import type { BBox, Severity } from "../../../types";

// Mirrors backend/pramana/insights/story.py

export type TrustLevel = "trusted" | "self_asserted" | "editable" | "claim" | "none";

export interface StoryTime {
  at: string | null;
  /** The time exactly as the file wrote it, when it came from the file */
  raw: string | null;
  zone_recorded: boolean;
  precision: "second" | "day";
  source: "pramana" | "tsa" | "signer" | "device" | "metadata" | "exif" | "printed" | "structure" | string;
  trust: TrustLevel;
  label: string;
}

export type StoryLink =
  | { to: "revision"; rev: number }
  | { to: "region"; page: number; bbox: BBox }
  | { to: "page"; page: number }
  | { to: "signature"; field: string | null; rev: number }
  | { to: "findings" }
  | { to: "fields" }
  | { to: "audit" }
  | { to: "photo" }
  | { to: "credentials" };

export interface StoryRegion {
  page: number;
  bbox: BBox;
}

export interface StoryThumb {
  rev?: number;
  page?: number;
  box?: StoryRegion | null;
  photo?: boolean;
}

export interface StoryEvent {
  id: string;
  seq: number;
  sort_at: string;
  kind: string;
  title: string;
  detail: string;
  time: StoryTime;
  origin: "file" | "pramana";
  tone: "neutral" | "attention" | "warning";
  actor: string | null;
  role: "issuer" | "applicant" | "unknown" | string | null;
  tool: string | null;
  revision: number | null;
  link: StoryLink | null;
  region: StoryRegion | null;
  thumb?: StoryThumb;
  status?: string | null;
  simulated?: boolean;
  after_signature?: boolean;
}

export interface StoryAnomaly {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
  from: string | null;
  to: string | null;
  basis: "structure" | "metadata" | "printed" | string;
  interval_s: number | null;
}

export interface StoryCoverage {
  field: string | null;
  signer: string;
  role: string;
  through_revision: number;
  revision_count: number;
  event: string;
  from_event: string;
}

export interface LifeStoryData {
  kind: "pdf" | "photo";
  events: StoryEvent[];
  anomalies: StoryAnomaly[];
  coverage: StoryCoverage[];
  revision_count: number | null;
  first_at: string | null;
  last_at: string | null;
  headline: string;
  trust_levels: { source: string; trust: TrustLevel; label: string }[];
  limitations: string[];
  document_id?: string;
  application_id?: string;
  filename?: string;
}

export const storyKey = (docId: string) => ["document", docId, "story"] as const;

export function useDocumentStory(docId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: storyKey(docId ?? "none"),
    queryFn: () => request<LifeStoryData>("GET", `/documents/${encodeURIComponent(docId!)}/story`),
    enabled: !!docId && enabled,
    staleTime: 60_000,
  });
}
