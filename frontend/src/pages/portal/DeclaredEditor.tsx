import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { fmtValue } from "../../lib/format";
import type { Declared, Programme } from "../../types";
import { Button, Checkbox, DescriptionList, Field, Input, Select, cn } from "../../ui2";
import {
  DECLARED_FIELDS,
  LEVELS,
  emptyProgramme,
  intakeChange,
  levelLabel,
  type DeclaredDraft,
  type DraftErrors,
  type ProgrammeDraft,
} from "./declared";

type SetDraft = Dispatch<SetStateAction<DeclaredDraft>>;

/** One sentence that explains the two intake figures, shown once above the programme rows. */
export const INTAKE_HELP =
  "Approved intake is the number of seats AICTE approved last year. Proposed intake is the number you ask for this year. For a renewal with no change, enter the same number twice.";

function ProgrammeRow({
  p,
  index,
  errors,
  onChange,
  onRemove,
  canRemove,
}: {
  p: ProgrammeDraft;
  index: number;
  errors: DraftErrors;
  onChange: (patch: Partial<ProgrammeDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const err = (k: string) => errors[`${p.key}.${k}`];
  const change = intakeChange(p.approved_intake.trim(), p.proposed_intake.trim());
  const n = index + 1;
  return (
    <li className="py-5 first:pt-0 last:pb-0" aria-labelledby={`${p.key}-title`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 id={`${p.key}-title`} className="text-sm font-medium text-ink">
            Programme {n}
          </h3>
          {change && <span className="text-sm text-ink-3">{change}</span>}
        </div>
        {canRemove && (
          <Button size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={onRemove} aria-label={`Remove programme ${n}`}>
            Remove
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[104px_minmax(0,1fr)_176px]">
        <Field label="Code" error={err("code")}>
          <Input value={p.code} onChange={(e) => onChange({ code: e.target.value.toUpperCase() })} className="font-mono" maxLength={12} />
        </Field>
        <Field label="Programme name" error={err("name")}>
          <Input value={p.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="For example B.Tech Civil Engineering" />
        </Field>
        <Field label="Level">
          <Select value={p.level} onChange={(e) => onChange({ level: e.target.value })}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Duration in years" error={err("duration_years")}>
          <Input inputMode="numeric" value={p.duration_years} onChange={(e) => onChange({ duration_years: e.target.value })} />
        </Field>
        <Field label="Approved intake (seats)" error={err("approved_intake")}>
          <Input inputMode="numeric" value={p.approved_intake} onChange={(e) => onChange({ approved_intake: e.target.value })} />
        </Field>
        <Field label="Proposed intake (seats)" error={err("proposed_intake")}>
          <Input inputMode="numeric" value={p.proposed_intake} onChange={(e) => onChange({ proposed_intake: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <Checkbox checked={p.core} onChange={(v) => onChange({ core: v })} label="Core programme" description="Civil, mechanical, electrical and similar" />
        <Checkbox checked={p.cs_allied} onChange={(v) => onChange({ cs_allied: v })} label="Computer science or allied" description="CSE, IT, AI and similar" />
        <Checkbox checked={p.nba_accredited} onChange={(v) => onChange({ nba_accredited: v })} label="NBA accredited" description="National Board of Accreditation" />
      </div>
    </li>
  );
}

/** Programmes as a row-per-programme form: inputs, checkboxes and the seat change as plain text. */
export function ProgrammesEditor({ draft, setDraft, errors }: { draft: DeclaredDraft; setDraft: SetDraft; errors: DraftErrors }) {
  const update = (key: string, patch: Partial<ProgrammeDraft>) =>
    setDraft((d) => ({ ...d, programmes: d.programmes.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  return (
    <div className="min-w-0">
      <ul className="divide-y divide-line">
        {draft.programmes.map((p, i) => (
          <ProgrammeRow
            key={p.key}
            p={p}
            index={i}
            errors={errors}
            canRemove={draft.programmes.length > 1}
            onChange={(patch) => update(p.key, patch)}
            onRemove={() => setDraft((d) => ({ ...d, programmes: d.programmes.filter((x) => x.key !== p.key) }))}
          />
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button
          variant="secondary"
          leadingIcon={<Plus />}
          onClick={() => setDraft((d) => ({ ...d, programmes: [...d.programmes, { ...emptyProgramme(), core: false }] }))}
        >
          Add programme
        </Button>
        {errors.programmes && (
          <p role="alert" className="text-xs font-medium text-mismatch-fg">
            {errors.programmes}
          </p>
        )}
      </div>
    </div>
  );
}

/** Declared figures as labelled fields in two columns; the unit is said in each hint. */
export function NumbersEditor({ draft, setDraft, errors }: { draft: DeclaredDraft; setDraft: SetDraft; errors: DraftErrors }) {
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      {DECLARED_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
          <Input
            id={`declared-${f.key}`}
            value={draft.fields[f.key] ?? ""}
            inputMode={f.type === "number" ? "decimal" : undefined}
            placeholder={f.placeholder ? `For example ${f.placeholder}` : undefined}
            className={cn(f.type === "text" && "font-mono placeholder:font-sans")}
            onChange={(e) => setDraft((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.value } }))}
          />
        </Field>
      ))}
    </div>
  );
}

function programmeFacts(p: Programme): string {
  const parts = [levelLabel(p.level)];
  if (p.duration_years) parts.push(`${p.duration_years} years`);
  if (p.core) parts.push("core");
  if (p.cs_allied) parts.push("computer science or allied");
  if (p.nba_accredited) parts.push("NBA accredited");
  return parts.join(", ");
}

/** Declared programmes as a plain table: code, name, approved and proposed seats, and the change. */
export function ProgrammesTable({ programmes }: { programmes: Programme[] }) {
  if (programmes.length === 0) return <p className="text-sm text-ink-3">No programmes declared.</p>;
  // Code and change columns step aside on phones; padding is set per column so the first visible one stays flush
  const th = "h-9 text-xs font-medium whitespace-nowrap text-ink-3";
  const td = "py-2.5 align-top";
  const col = {
    code: "hidden w-20 pr-3 text-left sm:table-cell",
    name: "pr-3 text-left sm:pl-3",
    approved: "px-3 text-right",
    proposed: "pl-3 text-right sm:pr-3",
    change: "hidden pl-3 text-right whitespace-nowrap sm:table-cell",
  };
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Declared programmes</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={cn(th, col.code)}>
              Code
            </th>
            <th scope="col" className={cn(th, col.name)}>
              Programme
            </th>
            <th scope="col" className={cn(th, col.approved)}>
              Approved
            </th>
            <th scope="col" className={cn(th, col.proposed)}>
              Proposed
            </th>
            <th scope="col" className={cn(th, col.change)}>
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {programmes.map((p, i) => (
            <tr key={`${p.code}-${i}`} className="border-b border-line last:border-b-0">
              <td className={cn(td, col.code, "font-mono text-ink-2")}>{p.code}</td>
              <td className={cn(td, col.name)}>
                <span className="block text-ink">
                  <span className="font-mono text-ink-2 sm:hidden">{p.code} </span>
                  {p.name}
                </span>
                <span className="block text-xs text-ink-3">{programmeFacts(p)}</span>
              </td>
              <td className={cn(td, col.approved, "text-ink")}>{fmtValue(p.approved_intake)}</td>
              <td className={cn(td, col.proposed, "text-ink")}>{fmtValue(p.proposed_intake)}</td>
              <td className={cn(td, col.change, "text-ink-2")}>{intakeChange(p.approved_intake, p.proposed_intake) || "Not given"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The declared scalar figures as a description list; empty values read "Not given". */
export function DeclaredFigures({ declared, columns = 3 }: { declared: Declared; columns?: 2 | 3 }) {
  return (
    <DescriptionList
      layout="stacked"
      columns={columns}
      items={DECLARED_FIELDS.map((f) => {
        const v = declared[f.key];
        const empty = v === undefined || v === null || v === "";
        return {
          label: f.label,
          value: empty ? null : f.unit ? `${fmtValue(v)} ${f.unit}` : fmtValue(v),
          mono: f.type === "text" && !empty,
        };
      })}
    />
  );
}

export function declaredProgrammes(declared: Declared): Programme[] {
  return Array.isArray(declared.programmes) ? declared.programmes : [];
}
