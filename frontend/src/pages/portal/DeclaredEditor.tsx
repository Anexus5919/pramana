import { Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Dispatch, SetStateAction } from "react";
import { fmtValue } from "../../lib/format";
import type { Declared, Programme } from "../../types";
import { Badge } from "../../ui/Badge";
import { Button, IconButton } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Checkbox, Field, Input, Select } from "../../ui/Field";
import { dur, ease, spring } from "../../ui/motion";
import {
  DECLARED_FIELDS,
  LEVELS,
  emptyProgramme,
  levelLabel,
  type DeclaredDraft,
  type DraftErrors,
  type ProgrammeDraft,
} from "./declared";

type SetDraft = Dispatch<SetStateAction<DeclaredDraft>>;

function IntakeDelta({ approved, proposed }: { approved: number; proposed: number }) {
  if (!Number.isFinite(approved) || !Number.isFinite(proposed)) return null;
  const d = proposed - approved;
  if (d === 0) return <Badge>No change in intake</Badge>;
  return (
    <motion.span key={d} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.ui }}>
      <Badge tone={d > 0 ? "pending" : "manual"} variant="soft">
        {d > 0 ? `Increase of ${d} seats` : `Reduction of ${-d} seats`}
      </Badge>
    </motion.span>
  );
}

function ProgrammeCard({
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
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-brand-soft font-mono text-[11px] font-semibold text-brand-ink">
            {index + 1}
          </span>
          <span className="truncate text-sm font-semibold text-ink">{p.name.trim() || "New programme"}</span>
          <IntakeDelta approved={Number(p.approved_intake)} proposed={Number(p.proposed_intake)} />
        </div>
        <IconButton label={`Remove programme ${index + 1}`} icon={<Trash2 />} size="sm" onClick={onRemove} disabled={!canRemove} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)] md:grid-cols-[120px_minmax(0,1fr)_200px]">
        <Field label="Code" error={err("code")}>
          <Input value={p.code} onChange={(e) => onChange({ code: e.target.value.toUpperCase() })} placeholder="CE" className="font-mono" maxLength={12} />
        </Field>
        <Field label="Programme name" error={err("name")}>
          <Input value={p.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="B.Tech Computer Engineering" />
        </Field>
        <Field label="Level" className="sm:col-span-2 md:col-span-1">
          <Select value={p.level} onChange={(e) => onChange({ level: e.target.value })}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Duration" error={err("duration_years")}>
          <Input inputMode="numeric" value={p.duration_years} onChange={(e) => onChange({ duration_years: e.target.value })} trailing={<Unit>years</Unit>} />
        </Field>
        <Field label="Approved intake" error={err("approved_intake")}>
          <Input inputMode="numeric" value={p.approved_intake} onChange={(e) => onChange({ approved_intake: e.target.value })} trailing={<Unit>seats</Unit>} />
        </Field>
        <Field label="Proposed intake" error={err("proposed_intake")}>
          <Input inputMode="numeric" value={p.proposed_intake} onChange={(e) => onChange({ proposed_intake: e.target.value })} trailing={<Unit>seats</Unit>} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        <Checkbox checked={p.core} onChange={(v) => onChange({ core: v })} label="Core programme" />
        <Checkbox checked={p.cs_allied} onChange={(v) => onChange({ cs_allied: v })} label="Computer science or allied" />
        <Checkbox checked={p.nba_accredited} onChange={(v) => onChange({ nba_accredited: v })} label="NBA accredited" description="Attach the NBA letter in documents" />
      </div>
    </div>
  );
}

function Unit({ children }: { children: string }) {
  return <span className="pointer-events-none pr-1 text-xs text-ink-3">{children}</span>;
}

export function ProgrammesEditor({ draft, setDraft, errors }: { draft: DeclaredDraft; setDraft: SetDraft; errors: DraftErrors }) {
  const update = (key: string, patch: Partial<ProgrammeDraft>) =>
    setDraft((d) => ({ ...d, programmes: d.programmes.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {draft.programmes.map((p, i) => (
          <motion.div
            key={p.key}
            layout
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: dur.micro } }}
            transition={{ layout: spring.soft, duration: dur.ui, ease: ease.out }}
          >
            <ProgrammeCard
              p={p}
              index={i}
              errors={errors}
              canRemove={draft.programmes.length > 1}
              onChange={(patch) => update(p.key, patch)}
              onRemove={() => setDraft((d) => ({ ...d, programmes: d.programmes.filter((x) => x.key !== p.key) }))}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      <motion.div layout transition={spring.soft} className="flex flex-wrap items-center gap-3">
        <Button
          variant="soft"
          leadingIcon={<Plus />}
          onClick={() => setDraft((d) => ({ ...d, programmes: [...d.programmes, { ...emptyProgramme(), core: false }] }))}
        >
          Add programme
        </Button>
        {errors.programmes && <span className="text-xs font-medium text-mismatch-fg">{errors.programmes}</span>}
      </motion.div>
    </div>
  );
}

export function NumbersEditor({ draft, setDraft, errors }: { draft: DeclaredDraft; setDraft: SetDraft; errors: DraftErrors }) {
  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {DECLARED_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
          <Input
            value={draft.fields[f.key] ?? ""}
            inputMode={f.type === "number" ? "decimal" : undefined}
            placeholder={f.placeholder ? `e.g. ${f.placeholder}` : undefined}
            className={cn(f.type === "text" && "font-mono")}
            onChange={(e) => setDraft((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.value } }))}
            trailing={f.unit ? <Unit>{f.unit}</Unit> : undefined}
          />
        </Field>
      ))}
    </div>
  );
}

function Flag({ on, children }: { on?: boolean; children: string }) {
  if (!on) return null;
  return <Badge variant="outline">{children}</Badge>;
}

/** Read-only view of what the institution declared. */
export function DeclaredView({ declared }: { declared: Declared }) {
  const progs: Programme[] = Array.isArray(declared.programmes) ? declared.programmes : [];
  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow mb-2">Programmes</div>
        {progs.length === 0 ? (
          <p className="text-sm text-ink-3">No programmes declared.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line">
            {progs.map((p, i) => {
              const delta = Number(p.proposed_intake) - Number(p.approved_intake);
              return (
                <li key={`${p.code}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="w-14 shrink-0 font-mono text-[13px] font-semibold text-ink">{p.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{p.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                      {levelLabel(p.level)}
                      {p.duration_years ? `, ${p.duration_years} years` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Flag on={p.core}>Core</Flag>
                    <Flag on={p.cs_allied}>CS allied</Flag>
                    <Flag on={p.nba_accredited}>NBA</Flag>
                  </span>
                  <span className="w-full text-right text-sm text-ink-2 tabular sm:w-auto">
                    <span className="text-ink-3">Intake </span>
                    {fmtValue(p.approved_intake)}
                    {delta !== 0 && Number.isFinite(delta) && (
                      <span className={cn("ml-1.5 font-medium", delta > 0 ? "text-pending-fg" : "text-manual-fg")}>
                        to {fmtValue(p.proposed_intake)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <div className="eyebrow mb-2">Declared figures</div>
        <dl className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
          {DECLARED_FIELDS.map((f) => {
            const v = declared[f.key];
            const empty = v === undefined || v === null || v === "";
            return (
              <div key={f.key} className="min-w-0 bg-surface px-4 py-3">
                <dt className="text-xs text-ink-3">{f.label}</dt>
                <dd className={cn("mt-0.5 truncate text-sm", empty ? "text-ink-4" : "font-medium text-ink", f.type === "text" && !empty && "font-mono text-[13px]")}>
                  {empty ? "Not declared" : fmtValue(v)}
                  {!empty && f.unit && <span className="ml-1 text-xs font-normal text-ink-3">{f.unit}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}
