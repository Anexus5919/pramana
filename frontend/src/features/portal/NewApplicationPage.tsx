import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, qk } from "../../api";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ErrorBanner, PageLoading } from "../../components/ui/Feedback";
import { Input, Label, Select } from "../../components/ui/Field";
import { PageHeader } from "../shared/Summaries";
import { useRuleset } from "../shared/useRuleset";
import { DeclaredForm, type DeclaredDraft, draftErrors, fromDraft, toDraft } from "./DeclaredForm";

export function NewApplicationPage() {
  const rs = useRuleset();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("2026-27");
  const [draft, setDraft] = useState<DeclaredDraft>(() => toDraft(undefined));
  const [touched, setTouched] = useState(false);
  const create = useMutation({
    mutationFn: api.createApplication,
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: qk.applications });
      navigate(`/portal/applications/${encodeURIComponent(a.id)}`);
    },
  });

  if (rs.isPending) return <PageLoading label="Loading categories" />;
  if (rs.error) return <ErrorBanner error={rs.error} title="Could not load application categories" />;

  const categories = Object.entries(rs.data.checklists);
  const chosen = category || categories[0]?.[0] || "";
  const yearOk = /^\d{4}-\d{2}$/.test(year) && Number(year.slice(5)) === (Number(year.slice(2, 4)) + 1) % 100;
  const errors = [...(yearOk ? [] : ["Academic year must look like 2026-27."]), ...draftErrors(draft)];

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.length) return;
    create.mutate({ category: chosen, academic_year: year, declared: fromDraft(draft) });
  }

  const cl = rs.data.checklists[chosen];

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title="New application"
        subtitle="Choose the approval category, then declare the facts the scrutiny rules will check. You can edit these until you submit."
      />
      <div className="space-y-5">
        <Card aria-labelledby="basics-title">
          <CardHeader id="basics-title" title="Application" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category" required>
                Category
              </Label>
              <Select id="category" value={chosen} onChange={(e) => setCategory(e.target.value)}>
                {categories.map(([code, c]) => (
                  <option key={code} value={code}>
                    {c.label ?? code}
                  </option>
                ))}
              </Select>
              {cl && (
                <p className="mt-1.5 text-xs text-muted">
                  {(cl.required ?? []).length} required documents
                  {(cl.optional ?? []).length ? `, ${(cl.optional ?? []).length} optional` : ""}.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="ay" required hint="(for example 2026-27)">
                Academic year
              </Label>
              <Input
                id="ay"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                aria-invalid={touched && !yearOk ? true : undefined}
                pattern="\d{4}-\d{2}"
              />
            </div>
          </div>
        </Card>
        <Card aria-labelledby="declared-form-title">
          <CardHeader
            id="declared-form-title"
            title="Declared data"
            subtitle="What your institution states. Scrutiny compares these values with your documents and with AICTE records."
          />
          <div className="p-4">
            <DeclaredForm value={draft} onChange={setDraft} />
          </div>
        </Card>
        {touched && errors.length > 0 && (
          <div role="alert" className="rounded-md border border-mismatch-dot/35 bg-mismatch-bg px-3 py-2.5 text-sm text-mismatch-fg">
            <p className="font-semibold">Please correct the following</p>
            <ul className="mt-1 list-disc pl-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {!!create.error && <ErrorBanner error={create.error} title="Could not create the application" />}
        <div className="flex justify-end gap-2">
          <ButtonLink to="/portal">Cancel</ButtonLink>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create application
          </Button>
        </div>
      </div>
    </form>
  );
}
