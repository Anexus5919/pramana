import { Plus, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Field";
import type { Declared, Programme } from "../../types";
import { DECLARED_FIELDS } from "../shared/DeclaredDataView";

export const LEVELS = [
  { value: "UG_ET", label: "UG Engineering" },
  { value: "PG_ET", label: "PG Engineering" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "MCA", label: "MCA" },
  { value: "MBA", label: "MBA" },
];

const KNOWN = new Set(["programmes", ...DECLARED_FIELDS.map((f) => f.key)]);

export interface DeclaredDraft {
  programmes: Programme[];
  fields: Record<string, string>;
  extras: { key: string; value: string }[];
}

export function emptyProgramme(): Programme {
  return { code: "", name: "", level: "UG_ET", duration_years: 4, approved_intake: 60, proposed_intake: 60, core: false, cs_allied: false, nba_accredited: false };
}

export function toDraft(declared: Declared | undefined): DeclaredDraft {
  const d = declared ?? {};
  const fields: Record<string, string> = {};
  for (const f of DECLARED_FIELDS) fields[f.key] = d[f.key] === undefined || d[f.key] === null ? "" : String(d[f.key]);
  return {
    programmes: Array.isArray(d.programmes) && d.programmes.length ? d.programmes.map((p) => ({ ...p })) : [emptyProgramme()],
    fields,
    extras: Object.entries(d)
      .filter(([k]) => !KNOWN.has(k))
      .map(([key, value]) => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) })),
  };
}

function parseExtra(v: string): unknown {
  const t = v.trim();
  if (t === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === "true" || t === "false") return t === "true";
  return t;
}

export function fromDraft(d: DeclaredDraft): Declared {
  const out: Declared = {};
  out.programmes = d.programmes
    .filter((p) => p.code.trim() || p.name.trim())
    .map((p) => ({
      ...p,
      code: p.code.trim().toUpperCase(),
      name: p.name.trim(),
      approved_intake: Number(p.approved_intake) || 0,
      proposed_intake: Number(p.proposed_intake) || 0,
      duration_years: Number(p.duration_years) || undefined,
    }));
  for (const f of DECLARED_FIELDS) {
    const v = (d.fields[f.key] ?? "").trim();
    if (v === "") continue;
    out[f.key] = f.type === "number" ? Number(v) : v;
  }
  for (const e of d.extras) {
    const k = e.key.trim().replace(/\s+/g, "_").toLowerCase();
    if (k && !KNOWN.has(k)) out[k] = parseExtra(e.value);
  }
  return out;
}

export function draftErrors(d: DeclaredDraft): string[] {
  const errs: string[] = [];
  d.programmes.forEach((p, i) => {
    if ((p.code.trim() || p.name.trim()) && (!p.code.trim() || !p.name.trim())) errs.push(`Programme row ${i + 1} needs both a code and a name.`);
    if (Number(p.approved_intake) < 0 || Number(p.proposed_intake) < 0) errs.push(`Programme row ${i + 1} has a negative intake.`);
  });
  for (const f of DECLARED_FIELDS) {
    const v = (d.fields[f.key] ?? "").trim();
    if (v && f.type === "number" && !Number.isFinite(Number(v))) errs.push(`${f.label} must be a number.`);
  }
  return errs;
}

const cell = "h-8 px-2 py-1 text-sm";

export function DeclaredForm({ value, onChange, idPrefix = "decl" }: { value: DeclaredDraft; onChange: (d: DeclaredDraft) => void; idPrefix?: string }) {
  function setProg(i: number, patch: Partial<Programme>) {
    onChange({ ...value, programmes: value.programmes.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  }
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-fg">Programmes</legend>
        <p className="mb-2 text-xs text-muted">One row per programme. Approved intake is what the last approval allowed; proposed is what you apply for.</p>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="bg-subtle/70 text-left text-[11px] tracking-wider text-subtle-fg uppercase">
                <th scope="col" className="px-2 py-1.5 font-semibold">Code</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Programme name</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Level</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Years</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Approved intake</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Proposed intake</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Core</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">CS / allied</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">NBA</th>
                <th scope="col" className="w-8 px-1">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {value.programmes.map((p, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="w-24 px-2 py-1.5">
                    <Input aria-label={`Programme ${i + 1} code`} value={p.code} onChange={(e) => setProg(i, { code: e.target.value })} className={cell} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Programme ${i + 1} name`} value={p.name} onChange={(e) => setProg(i, { name: e.target.value })} className={cell} />
                  </td>
                  <td className="w-44 px-2 py-1.5">
                    <select
                      aria-label={`Programme ${i + 1} level`}
                      value={p.level}
                      onChange={(e) => setProg(i, { level: e.target.value })}
                      className="block h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                    >
                      {LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                      {!LEVELS.some((l) => l.value === p.level) && <option value={p.level}>{p.level}</option>}
                    </select>
                  </td>
                  <td className="w-16 px-2 py-1.5">
                    <Input aria-label={`Programme ${i + 1} duration in years`} type="number" min={1} max={6} value={p.duration_years ?? ""} onChange={(e) => setProg(i, { duration_years: e.target.value === "" ? undefined : Number(e.target.value) })} className={cell} />
                  </td>
                  <td className="w-28 px-2 py-1.5">
                    <Input aria-label={`Programme ${i + 1} approved intake`} type="number" min={0} value={p.approved_intake} onChange={(e) => setProg(i, { approved_intake: Number(e.target.value) })} className={cell} />
                  </td>
                  <td className="w-28 px-2 py-1.5">
                    <Input aria-label={`Programme ${i + 1} proposed intake`} type="number" min={0} value={p.proposed_intake} onChange={(e) => setProg(i, { proposed_intake: Number(e.target.value) })} className={cell} />
                  </td>
                  {(["core", "cs_allied", "nba_accredited"] as const).map((k) => (
                    <td key={k} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Programme ${i + 1} ${k === "core" ? "core branch" : k === "cs_allied" ? "computer science or allied" : "NBA accredited"}`}
                        checked={!!p[k]}
                        onChange={(e) => setProg(i, { [k]: e.target.checked })}
                        className="size-4 accent-[var(--primary)]"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      aria-label={`Remove programme ${i + 1}`}
                      onClick={() => onChange({ ...value, programmes: value.programmes.filter((_, j) => j !== i) })}
                      className="rounded p-1 text-subtle-fg hover:bg-subtle hover:text-mismatch-fg"
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-3.5" />} onClick={() => onChange({ ...value, programmes: [...value.programmes, emptyProgramme()] })}>
          Add programme
        </Button>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-fg">Institution facts</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DECLARED_FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`${idPrefix}-${f.key}`} hint={f.unit ? `(${f.unit})` : undefined}>
                {f.label}
              </Label>
              <Input
                id={`${idPrefix}-${f.key}`}
                inputMode={f.type === "number" ? "decimal" : undefined}
                value={value.fields[f.key] ?? ""}
                onChange={(e) => onChange({ ...value, fields: { ...value.fields, [f.key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-fg">Other declared values</legend>
        <p className="mb-2 text-xs text-muted">Free key and value pairs. Numbers and true or false are stored as such.</p>
        <div className="space-y-2">
          {value.extras.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={`Extra ${i + 1} key`}
                placeholder="key, for example hostel_capacity"
                value={e.key}
                onChange={(ev) => onChange({ ...value, extras: value.extras.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)) })}
                className="max-w-64 font-mono text-xs"
              />
              <Input
                aria-label={`Extra ${i + 1} value`}
                placeholder="value"
                value={e.value}
                onChange={(ev) => onChange({ ...value, extras: value.extras.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) })}
              />
              <button
                type="button"
                aria-label={`Remove extra ${i + 1}`}
                onClick={() => onChange({ ...value, extras: value.extras.filter((_, j) => j !== i) })}
                className="rounded p-1 text-subtle-fg hover:bg-subtle hover:text-mismatch-fg"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-3.5" />} onClick={() => onChange({ ...value, extras: [...value.extras, { key: "", value: "" }] })}>
          Add value
        </Button>
      </fieldset>
    </div>
  );
}
