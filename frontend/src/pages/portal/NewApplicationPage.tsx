import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage, qk } from "../../api";
import type { ChecklistSpec } from "../../types";
import {
  Button,
  Callout,
  Code,
  DescriptionList,
  ErrorState,
  Field,
  FieldError,
  Page,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  Stepper,
  cn,
  useToast,
  type Step,
} from "../../ui2";
import { DeclaredFigures, INTAKE_HELP, NumbersEditor, ProgrammesEditor, ProgrammesTable } from "./DeclaredEditor";
import { fieldErrors, fromDraft, programmeErrors, toDraft, type DeclaredDraft, type DraftErrors } from "./declared";
import { checklistSourceText } from "./progress";

const STEPS = [
  { id: "category", label: "Category and year", description: "The category decides which documents AICTE asks for." },
  { id: "programmes", label: "Programmes", description: INTAKE_HELP },
  {
    id: "figures",
    label: "Declared figures",
    description: "Pramana compares these figures with your documents. Leave a field empty if it does not apply to you.",
  },
  { id: "review", label: "Review", description: "Nothing is sent to AICTE yet. The draft opens next, where you upload documents and then submit." },
] as const;

const YEARS = ["2026-27", "2027-28"];

/** Plain-language meaning of each application category, shown under its handbook name. */
const CATEGORY_HELP: Record<string, string> = {
  EOA: "Extension of Approval (EoA): the yearly renewal to keep running your approved programmes.",
  INCREASE_INTAKE: "Increase in intake: ask for more seats in an approved programme, or add a new course.",
};

function CategoryOption({
  code,
  spec,
  selected,
  onSelect,
  describedBy,
}: {
  code: string;
  spec: ChecklistSpec;
  selected: boolean;
  onSelect: () => void;
  describedBy?: string;
}) {
  const req = spec.required?.length ?? 0;
  const opt = spec.optional?.length ?? 0;
  const source = checklistSourceText(spec.source);
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-card border px-4 py-3.5 transition-colors duration-150",
        selected ? "border-brand-solid bg-brand-soft" : "border-line-2 bg-surface hover:bg-surface-2",
      )}
    >
      <input
        type="radio"
        name="category"
        value={code}
        checked={selected}
        onChange={onSelect}
        aria-describedby={describedBy}
        className="mt-0.5 size-4 shrink-0 accent-brand-solid"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-ink">{spec.label ?? code}</span>
          <Code>{code}</Code>
        </span>
        {CATEGORY_HELP[code] && <span className="mt-0.5 block text-sm text-ink-2 text-pretty">{CATEGORY_HELP[code]}</span>}
        <span className="mt-1 block text-xs text-ink-3">
          {req} required, {opt} optional documents{source ? `. ${source}` : ""}
        </span>
      </span>
    </label>
  );
}

function ReviewGroup({ title, onChange, children }: { title: string; onChange: () => void; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-ink-3">{title}</h3>
        <Button size="sm" variant="ghost" onClick={onChange} aria-label={`Change ${title.toLowerCase()}`}>
          Change
        </Button>
      </div>
      {children}
    </section>
  );
}

export default function NewApplicationPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const rs = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [year, setYear] = useState("2027-28");
  const [draft, setDraft] = useState<DeclaredDraft>(() => toDraft(undefined));
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const heading = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const errorsFor = (i: number): DraftErrors =>
    [category ? {} : { category: "Choose what you are applying for" }, programmeErrors(draft), fieldErrors(draft), {}][i] ?? {};
  const stepErrors = errorsFor(step);
  const blocked = Object.keys(stepErrors).length > 0;
  const shown = tried[step] ? stepErrors : {};

  const create = useMutation({
    mutationFn: () => api.createApplication({ category: category as string, academic_year: year, declared: fromDraft(draft) }),
    onSuccess: async (app) => {
      await qc.invalidateQueries({ queryKey: qk.applications });
      toast.success("Draft created", `${app.id}. Upload the documents on the checklist next, then submit.`);
      nav(`/portal/applications/${encodeURIComponent(app.id)}`);
    },
  });

  // After a step change, start reading at the new step's title
  useEffect(() => {
    if (!moved.current) return;
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  function go(to: number) {
    if (to > step && blocked) {
      setTried((t) => ({ ...t, [step]: true }));
      // Take the keyboard to the first field that needs a fix
      requestAnimationFrame(() => body.current?.querySelector<HTMLElement>("[aria-invalid='true'], input[name='category']")?.focus());
      return;
    }
    moved.current = true;
    setStep(to);
  }

  const checklists = rs.data ? Object.entries(rs.data.checklists) : [];
  const steps: Step[] = STEPS.map((s, i) => ({
    id: s.id,
    label: s.label,
    status: i < step ? "complete" : i === step ? "current" : "upcoming",
  }));
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const categoryName = (category && rs.data?.checklists[category]?.label) ?? category;

  return (
    <Page width="narrow">
      <PageHeader
        back={{ to: "/portal", label: "Applications" }}
        title="New application"
        context="Four short steps. You can upload documents after the draft is created."
      />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0">
          <div className="hidden lg:sticky lg:top-20 lg:block">
            <Stepper orientation="vertical" label="New application steps" steps={steps} />
          </div>
          <div className="lg:hidden">
            <Stepper label="New application steps" steps={steps} />
          </div>
        </div>
        <div ref={body} className="min-w-0">
          <Panel
            aria-labelledby="wizard-step-title"
            title={
              <span ref={heading} id="wizard-step-title" tabIndex={-1} className="outline-none">
                {current.label}
              </span>
            }
            description={current.description}
            footer={
              <>
                {step > 0 && (
                  <Button variant="ghost" size="lg" leadingIcon={<ArrowLeft aria-hidden />} onClick={() => go(step - 1)} className="mr-auto">
                    Back
                  </Button>
                )}
                {last ? (
                  <Button variant="primary" size="lg" leadingIcon={<Check aria-hidden />} loading={create.isPending} onClick={() => create.mutate()}>
                    Create draft
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" trailingIcon={<ArrowRight aria-hidden />} onClick={() => go(step + 1)}>
                    Continue
                  </Button>
                )}
              </>
            }
          >
            {step === 0 && (
              <div className="space-y-6">
                {rs.isPending ? (
                  <div role="status" className="space-y-3">
                    <span className="sr-only">Loading the categories</span>
                    <Skeleton className="h-24" rounded="lg" />
                    <Skeleton className="h-24" rounded="lg" />
                  </div>
                ) : rs.error ? (
                  <ErrorState error={rs.error} title="Could not load the categories" onRetry={() => void rs.refetch()} retrying={rs.isFetching} />
                ) : (
                  <fieldset aria-describedby={shown.category ? "category-error" : undefined}>
                    <legend className="mb-2 text-sm font-medium text-ink-2">What are you applying for?</legend>
                    <div className="space-y-3">
                      {checklists.map(([code, spec]) => (
                        <CategoryOption key={code} code={code} spec={spec} selected={category === code} onSelect={() => setCategory(code)} />
                      ))}
                    </div>
                    <FieldError id="category-error">{shown.category}</FieldError>
                  </fieldset>
                )}
                <Field label="Academic year" hint="The year the approval is for. AY in AICTE letters means academic year." className="max-w-xs">
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
                <ReviewGroup title="Category and year" onChange={() => go(0)}>
                  <DescriptionList
                    layout="stacked"
                    columns={2}
                    items={[
                      { label: "Category", value: categoryName },
                      { label: "Academic year", value: year },
                    ]}
                  />
                </ReviewGroup>
                <ReviewGroup title="Programmes" onChange={() => go(1)}>
                  <ProgrammesTable programmes={fromDraft(draft).programmes ?? []} />
                </ReviewGroup>
                <ReviewGroup title="Declared figures" onChange={() => go(2)}>
                  <DeclaredFigures declared={fromDraft(draft)} columns={2} />
                </ReviewGroup>
                {create.error && (
                  <Callout tone="danger" role="alert" title="The draft could not be created">
                    {errorMessage(create.error)}
                  </Callout>
                )}
              </div>
            )}
            {tried[step] && blocked && step > 0 && (
              <p role="alert" className="mt-5 text-sm font-medium text-mismatch-fg">
                Some entries need a fix before you continue. They are marked above.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
