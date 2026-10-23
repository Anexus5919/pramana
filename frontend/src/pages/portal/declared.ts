import type { Declared, Programme } from "../../types";

export const LEVELS = [
  { value: "UG_ET", label: "UG Engineering" },
  { value: "PG_ET", label: "PG Engineering" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "MCA", label: "MCA" },
  { value: "MBA", label: "MBA" },
];

export interface NumberField {
  key: string;
  label: string;
  unit?: string;
  type: "number" | "text";
  hint?: string;
  placeholder?: string;
}

export const DECLARED_FIELDS: NumberField[] = [
  { key: "faculty_count", label: "Faculty count", type: "number", hint: "Regular teachers on the faculty list you upload", placeholder: "36" },
  {
    key: "built_up_area_sqm",
    label: "Built-up area",
    unit: "sq m",
    type: "number",
    hint: "In square metres, as on the Occupancy or Completion Certificate",
    placeholder: "14450",
  },
  { key: "land_area_acres", label: "Land area", unit: "acres", type: "number", hint: "In acres, as on your land documents", placeholder: "10.5" },
  {
    key: "administrative_area_sqm",
    label: "Administrative area",
    unit: "sq m",
    type: "number",
    hint: "In square metres: offices, records and the principal's office",
    placeholder: "820",
  },
  {
    key: "amenities_area_sqm",
    label: "Amenities area",
    unit: "sq m",
    type: "number",
    hint: "In square metres: canteen, common rooms and the medical room",
    placeholder: "560",
  },
  { key: "internet_bandwidth_mbps", label: "Internet bandwidth", unit: "Mbps", type: "number", hint: "In Mbps, the speed of the campus connection", placeholder: "200" },
  {
    key: "building_age_years",
    label: "Building age",
    unit: "years",
    type: "number",
    hint: "In years since the Completion Certificate. Over 30 years also needs a Structural Stability Certificate",
    placeholder: "12",
  },
  {
    key: "fire_noc_number",
    label: "Fire NOC number",
    type: "text",
    hint: "The number on your Fire Safety Certificate (NOC means No Objection Certificate)",
    placeholder: "FES/PUN/2025/04417",
  },
  {
    key: "fee_transaction_id",
    label: "TER fee transaction ID",
    type: "text",
    hint: "From the receipt for the Technical Education Regulatory (TER) fee",
    placeholder: "TER26-88132554",
  },
];

const KNOWN = new Set(["programmes", ...DECLARED_FIELDS.map((f) => f.key)]);

export interface ProgrammeDraft {
  key: string;
  code: string;
  name: string;
  level: string;
  duration_years: string;
  approved_intake: string;
  proposed_intake: string;
  core: boolean;
  cs_allied: boolean;
  nba_accredited: boolean;
}

export interface DeclaredDraft {
  programmes: ProgrammeDraft[];
  fields: Record<string, string>;
  /** Keys this form does not edit; kept as they were */
  extras: Record<string, unknown>;
}

let seq = 0;
const nextKey = () => `p${++seq}`;

export function emptyProgramme(): ProgrammeDraft {
  return {
    key: nextKey(),
    code: "",
    name: "",
    level: "UG_ET",
    duration_years: "4",
    approved_intake: "60",
    proposed_intake: "60",
    core: true,
    cs_allied: false,
    nba_accredited: false,
  };
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function toDraft(declared: Declared | undefined): DeclaredDraft {
  const d = declared ?? {};
  const fields: Record<string, string> = {};
  for (const f of DECLARED_FIELDS) fields[f.key] = str(d[f.key]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (!KNOWN.has(k)) extras[k] = v;
  const progs = Array.isArray(d.programmes) ? d.programmes : [];
  return {
    programmes: progs.length
      ? progs.map((p: Programme) => ({
          key: nextKey(),
          code: str(p.code),
          name: str(p.name),
          level: str(p.level) || "UG_ET",
          duration_years: str(p.duration_years),
          approved_intake: str(p.approved_intake),
          proposed_intake: str(p.proposed_intake),
          core: !!p.core,
          cs_allied: !!p.cs_allied,
          nba_accredited: !!p.nba_accredited,
        }))
      : [emptyProgramme()],
    fields,
    extras,
  };
}

const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

export function fromDraft(d: DeclaredDraft): Declared {
  const out: Declared = { ...d.extras };
  out.programmes = d.programmes
    .filter((p) => p.code.trim() || p.name.trim())
    .map((p) => ({
      code: p.code.trim().toUpperCase(),
      name: p.name.trim(),
      level: p.level,
      duration_years: num(p.duration_years),
      approved_intake: num(p.approved_intake) ?? 0,
      proposed_intake: num(p.proposed_intake) ?? 0,
      core: p.core,
      cs_allied: p.cs_allied,
      nba_accredited: p.nba_accredited,
    }));
  for (const f of DECLARED_FIELDS) {
    const v = (d.fields[f.key] ?? "").trim();
    if (v === "") continue;
    out[f.key] = f.type === "number" ? Number(v) : v;
  }
  return out;
}

export type DraftErrors = Record<string, string>;

const bad = (v: string) => v.trim() !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0);

export function programmeErrors(d: DeclaredDraft): DraftErrors {
  const e: DraftErrors = {};
  const filled = d.programmes.filter((p) => p.code.trim() || p.name.trim());
  if (!filled.length) e.programmes = "Add at least one programme with a code and a name.";
  d.programmes.forEach((p) => {
    if (!(p.code.trim() || p.name.trim())) return;
    if (!p.code.trim()) e[`${p.key}.code`] = "Enter a code";
    if (!p.name.trim()) e[`${p.key}.name`] = "Enter a name";
    for (const k of ["duration_years", "approved_intake", "proposed_intake"] as const) if (bad(p[k])) e[`${p.key}.${k}`] = "Enter a number of 0 or more";
  });
  return e;
}

export function fieldErrors(d: DeclaredDraft): DraftErrors {
  const e: DraftErrors = {};
  for (const f of DECLARED_FIELDS) {
    const v = d.fields[f.key] ?? "";
    if (f.type === "number" && bad(v)) e[f.key] = "Enter a number of 0 or more";
  }
  return e;
}

export function levelLabel(v: string): string {
  return LEVELS.find((l) => l.value === v)?.label ?? v;
}

/** Seat change as plain text: "+60 seats", "-30 seats" or "No change". Empty when either figure is missing. */
export function intakeChange(approved: unknown, proposed: unknown): string {
  const a = Number(approved);
  const p = Number(proposed);
  if (approved === "" || proposed === "" || !Number.isFinite(a) || !Number.isFinite(p)) return "";
  const d = p - a;
  if (d === 0) return "No change";
  return `${d > 0 ? "+" : "-"}${Math.abs(d)} ${Math.abs(d) === 1 ? "seat" : "seats"}`;
}
