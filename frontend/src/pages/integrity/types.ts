// Payloads of /api/insights; officials only

export type ItemKind = "faculty" | "certificate" | "file" | "photo" | "seal" | "details";

export interface FindingBrief {
  id: string;
  code: string;
  title: string;
  severity: string;
  review_status: string;
}

export interface NetworkApplication {
  id: string;
  institution_id: string;
  institution: string;
  short_name: string;
  district: string;
  status: string;
  cluster: string | null;
  degree: number;
}

export interface NetworkItem {
  id: string;
  kind: ItemKind;
  label: string;
  detail: string | null;
  doc_type: string | null;
  doc_label: string | null;
  relation: string;
  applications: string[];
}

export interface NetworkEdge {
  source: string;
  target: string;
  kind: ItemKind;
  relation: string;
  findings: FindingBrief[];
  document_id: string | null;
  page: number | null;
  bbox: number[] | null;
}

export interface NetworkCluster {
  id: string;
  applications: string[];
  items: string[];
  summary: string;
  pairs: { a: string; b: string; items: string[]; summary: string }[];
  findings: number;
  high_findings: number;
  kinds: Partial<Record<ItemKind, number>>;
}

export interface NetworkDataset {
  id: "current" | "synthetic";
  label: string;
  applications: number;
  note?: string | null;
}

export interface NetworkPayload {
  dataset: string;
  synthetic: boolean;
  note?: string | null;
  datasets?: NetworkDataset[];
  academic_year: string | null;
  applications: NetworkApplication[];
  items: NetworkItem[];
  edges: NetworkEdge[];
  pairs: { a: string; b: string; items: string[] }[];
  clusters: NetworkCluster[];
  stats: {
    applications: number;
    linked_applications: number;
    clusters: number;
    shared_items: number;
    by_kind: Record<ItemKind, number>;
  };
}

export interface FacultyLane {
  source: "roster" | "registry";
  institution_id: string;
  institution: string;
  short_name: string;
  application_id: string | null;
  document_id: string | null;
  page: number | null;
  bbox: number[] | null;
  name: string | null;
  designation: string | null;
  joined: string | null;
  left: string | null;
  registry: boolean;
  last_year: boolean;
  findings: FindingBrief[];
}

export interface FacultyPerson {
  faculty_id: string;
  name: string | null;
  names_differ: boolean;
  designation: string | null;
  institutions: number;
  claimed_by: number;
  applications: string[];
  registry: { institution_id: string | null; institution: string | null; source: string | null; listed_by_registry_institution: boolean } | null;
  overlap_start: string | null;
  overlap_days: number;
  concurrent: number;
  lanes: FacultyLane[];
}

export interface FacultyOverlapPayload {
  academic_year: string | null;
  as_of: string;
  last_year: string | null;
  people: FacultyPerson[];
  stats: {
    faculty_ids: number;
    applications_involved: number;
    applications_checked: number;
    rows_checked: number;
    claimed_by_two_or_more: number;
    registered_elsewhere: number;
  };
}
