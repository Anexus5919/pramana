import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, qk } from "../../api";
import type { ChecklistSpec } from "../../types";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Field, Select } from "../../ui/Field";
import { PageHeader } from "../../ui/Layout";
import { dur, ease, spring } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { ErrorState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { DeclaredView, NumbersEditor, ProgrammesEditor } from "./DeclaredEditor";
import { fieldErrors, fromDraft, programmeErrors, toDraft, type DeclaredDraft } from "./declared";

const STEPS = [
  { key: "category", label: "Category and year" },
  { key: "programmes", label: "Programmes" },
  { key: "numbers", label: "Declared figures" },
  { key: "review", label: "Review" },
] as const;

const YEARS = ["2026-27", "2027-28"];

function Steps({ current, onJump }: { current: number; onJump: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
      {STEPS.map((s, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <li key={s.key} className="min-w-0">
            <button
              type="button"
              disabled={i > current}
              onClick={() => onJump(i)}
              aria-current={on ? "step" : undefined}
              className="group block w-full min-w-0 text-left disabled:cursor-default"
            >
              <span className="relative block h-2 overflow-hidden rounded-[3px] bg-surface-3">
                <motion.span
                  className="absolute inset-0 origin-left bg-brand-500"
                  initial={false}
                  animate={{ scaleX: done || on ? 1 : 0, opacity: on ? 0.55 : 1 }}
                  transition={{ duration: dur.panel, ease: ease.out }}
                />
              </span>
              <span className="mt-2 flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] font-mono text-[10px] font-semibold transition-colors duration-200",
                    done ? "bg-brand-500 text-white" : on ? "bg-brand-soft text-brand-ink ring-1 ring-brand-300" : "bg-surface-2 text-ink-4",
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("truncate text-xs", on ? "font-semibold text-ink" : done ? "font-medium text-ink-2 group-hover:text-ink" : "text-ink-4")}>
                  {s.label}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CategoryCard({
  code,
  spec,
  selected,
  onSelect,
}: {
  code: string;
  spec: ChecklistSpec;
  selected: boolean;
  onSelect: () => void;
}) {
  const src = spec.source && typeof spec.source === "object" ? (spec.source as { doc?: string; section?: string; page?: number }) : null;
  const req = spec.required?.length ?? 0;
  const opt = spec.optional?.length ?? 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
      }}
      className={cn(
        "group/card relative flex min-w-0 flex-col overflow-hidden rounded-card border bg-surface p-5 text-left transition-[border-color,box-shadow] duration-200",
        selected ? "border-brand-400 shadow-md" : "border-line shadow-xs hover:border-brand-200 hover:shadow-sm",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
        style={{ background: "radial-gradient(360px circle at var(--spot-x,50%) var(--spot-y,50%), color-mix(in oklab, var(--brand-400) 10%, transparent), transparent 60%)" }}
      />
      {selected && <motion.span layoutId="new-app-category" transition={spring.snappy} aria-hidden className="absolute inset-0 rounded-[inherit] ring-2 ring-brand-400 ring-inset" />}
      <span className="relative flex items-start justify-between gap-3">
        <span className="font-mono text-xs text-ink-3">{code}</span>
        <span
          aria-hidden
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full border transition-colors duration-200",
            selected ? "border-brand-solid bg-brand-solid text-white" : "border-line-2",
          )}
        >
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
      </span>
      <span className="relative mt-1 font-display text-md font-semibold tracking-title text-ink text-pretty">{spec.label ?? code}</span>
      <span className="relative mt-3 flex items-end gap-[3px]" aria-hidden>
        {Array.from({ length: req }, (_, i) => (
          <span key={`r${i}`} className={cn("block size-3 rounded-[3px] transition-colors duration-300", selected ? "bg-brand-500" : "bg-brand-300")} />
        ))}
        {Array.from({ length: opt }, (_, i) => (
          <span key={`o${i}`} className="block size-3 rounded-[3px] border border-dashed border-line-2" />
        ))}
      </span>
      <span className="relative mt-2 text-sm text-ink-2">
        {req} required documents, {opt} optional
      </span>
      {src && (
        <span className="relative mt-1 text-xs text-ink-3">
          Checklist from {src.doc} {src.section}
          {src.page ? `, page ${src.page}` : ""}
        </span>
      )}
    </button>
  );
}

export default function NewApplicationPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const rs = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [category, setCategory] = useState<string | null>(null);
  const [year, setYear] = useState("2027-28");
  const [draft, setDraft] = useState<DeclaredDraft>(() => toDraft(undefined));
  const [tried, setTried] = useState<Record<number, boolean>>({});

  const pErr = programmeErrors(draft);
  const fErr = fieldErrors(draft);
  const stepErrors = [category ? {} : { category: "Choose a category" }, pErr, fErr, {}][step];
  const blocked = Object.keys(stepErrors).length > 0;

  const create = useMutation({
    mutationFn: () => api.createApplication({ category: category as string, academic_year: year, declared: fromDraft(draft) }),
    onSuccess: async (app) => {
      await qc.invalidateQueries({ queryKey: qk.applications });
      toast.success("Draft application created", `${app.id}. Upload the documents next, then submit.`);
      nav(`/portal/applications/${encodeURIComponent(app.id)}`);
    },
  });

  function go(to: number) {
    if (to > step && blocked) {
      setTried((t) => ({ ...t, [step]: true }));
      return;
    }
    setDir(to > step ? 1 : -1);
    setStep(to);
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  const shown = tried[step] ? stepErrors : {};
  const checklists = rs.data ? Object.entries(rs.data.checklists) : [];
  const slide = reduce ? 0 : 36;

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/portal" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> My applications
      </Link>
      <PageHeader
        eyebrow="New application"
        title="Start an application"
        description="It is saved as a draft. You can upload documents and correct the figures before you submit it to AICTE."
      />
      <Steps current={step} onJump={(i) => i < step && go(i)} />
      <div className="relative mt-6 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * slide }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -slide }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: dur.ui, ease: ease.out }}
            aria-labelledby={`step-${step}-title`}
            className="rounded-panel border border-line bg-surface/80 p-5 shadow-sm sm:p-6"
          >
            <h2 id={`step-${step}-title`} className="font-display text-lg font-semibold tracking-title text-ink">
              {["What are you applying for?", "Programmes in this application", "Declared figures", "Check and create the draft"][step]}
            </h2>
            <p className="mt-1 mb-5 text-sm text-ink-3 text-pretty">
              {
                [
                  "The category decides which documents AICTE requires. The checklist comes from the active ruleset.",
                  "List each programme with its approved and proposed intake. Pramana compares these figures with your documents.",
                  "Figures you declare here are checked against the uploaded certificates and the faculty roster. Leave a field empty if it does not apply.",
                  "Nothing is sent to AICTE yet. The draft opens next, where you upload documents and submit.",
                ][step]
              }
            </p>

            {step === 0 && (
              <div className="space-y-6">
                {rs.isPending ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-[170px]" rounded="lg" />
                    <Skeleton className="h-[170px]" rounded="lg" />
                  </div>
                ) : rs.error ? (
                  <ErrorState error={rs.error} title="Could not load the categories" onRetry={() => void rs.refetch()} />
                ) : (
                  <div role="radiogroup" aria-label="Category" className="grid gap-4 sm:grid-cols-2">
                    {checklists.map(([code, spec]) => (
                      <CategoryCard key={code} code={code} spec={spec} selected={category === code} onSelect={() => setCategory(code)} />
                    ))}
                  </div>
                )}
                {shown.category && <p className="text-xs font-medium text-mismatch-fg">{shown.category}</p>}
                <Field label="Academic year" hint="The year the approval applies to" className="max-w-xs">
                  <Select value={year} onChange={(e) => setYear(e.target.value)}>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            {step === 1 && <ProgrammesEditor draft={draft} setDraft={setDraft} errors={shown} />}
            {step === 2 && <NumbersEditor draft={draft} setDraft={setDraft} errors={shown} />}
            {step === 3 && (
              <div className="space-y-5">
                <dl className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
                  <div className="bg-surface px-4 py-3">
                    <dt className="text-xs text-ink-3">Category</dt>
                    <dd className="mt-0.5 text-sm font-medium text-ink">{(category && rs.data?.checklists[category]?.label) ?? category}</dd>
                  </div>
                  <div className="bg-surface px-4 py-3">
                    <dt className="text-xs text-ink-3">Academic year</dt>
                    <dd className="mt-0.5 text-sm font-medium text-ink tabular">{year}</dd>
                  </div>
                </dl>
                <DeclaredView declared={fromDraft(draft)} />
                {create.error && <ErrorState error={create.error} title="The draft could not be created" />}
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="ghost" leadingIcon={<ArrowLeft />} onClick={() => go(step - 1)} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button trailingIcon={<ArrowRight />} onClick={() => go(step + 1)} aria-disabled={blocked && tried[step] ? true : undefined}>
            Continue
          </Button>
        ) : (
          <Button magnetic leadingIcon={<Check />} loading={create.isPending} onClick={() => create.mutate()}>
            Create draft
          </Button>
        )}
      </div>
    </div>
  );
}
