import { Link } from "react-router-dom";
import { fmtDate, fmtValue, pluralize } from "../../../../lib/format";
import type { Tone } from "../../../../lib/labels";
import { workspacePath } from "../../../../shell/nav";
import {
  Button,
  ButtonLink,
  Code,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  EvidenceClassLabel,
  MetaList,
  Panel,
  PanelDivider,
  SeverityIndicator,
  Skeleton,
  StatusBadge,
  type Column,
} from "../../../../ui2";
import { useDocTypeLabel, useWorkspace } from "../../context";
import { validBox } from "../../data";
import { useSinceLastYear, type CertificateChange, type ProgrammeChange, type ScalarChange, type SinceLastYear, type YoyIndicator } from "../../history/api";
import { CautionNote, CitationCard } from "../../parts";

const CERT_STATUS: Record<CertificateChange["status"], { label: string; tone: Tone; tip: string }> = {
  unchanged: { label: "Same certificate", tone: "unchecked", tip: "Same number and validity as last year." },
  new_number: { label: "New number", tone: "verified", tip: "A different number from last year, as a renewal or a new document would have." },
  reused_new_validity: { label: "Same number, new validity", tone: "mismatch", tip: "The number is last year's, but the validity date differs." },
  not_read: { label: "Not read this year", tone: "manual", tip: "The number could not be read from this year's document, so it was not compared." },
  new: { label: "New this year", tone: "pending", tip: "Not part of last year's application." },
  missing: { label: "Not submitted this year", tone: "unchecked", tip: "Part of last year's application but not this one." },
};

function fmtNum(v: unknown, unit: string | null): string {
  if (v === null || v === undefined || v === "") return "Not declared";
  return `${fmtValue(v)}${unit ? ` ${unit}` : ""}`;
}

function deltaText(s: ScalarChange): string {
  if (s.delta === null) return "Not comparable";
  if (s.delta === 0) return "No change";
  const sign = s.delta > 0 ? "+" : "";
  return `${sign}${fmtValue(s.delta)}${s.unit ? ` ${s.unit}` : ""}${s.pct !== null ? ` (${sign}${s.pct}%)` : ""}`;
}

function IndicatorRow({ i }: { i: YoyIndicator }) {
  const { app, findings, openDoc } = useWorkspace();
  const f = (findings ?? []).find((x) => x.code === i.code && x.fingerprint === i.fingerprint) ?? (findings ?? []).find((x) => x.code === i.code);
  const region = i.evidence.find((e) => e.kind === "region");
  const target = region && region.kind === "region" && region.document_id ? region : null;
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <MetaList items={[<SeverityIndicator key="s" severity={i.severity} />, <EvidenceClassLabel key="e" cls={i.evidence_class} />]} />
          <h3 className="mt-1 text-sm font-medium text-ink text-pretty">{i.title}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {target && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openDoc({ docId: target.document_id!, page: target.page, bbox: validBox(target.bbox) ? target.bbox : null, label: target.label ?? null })}
            >
              Show on the page
            </Button>
          )}
          {f && (
            <ButtonLink size="sm" variant="ghost" to={workspacePath(app.id, "findings", { finding: f.id })}>
              Open finding
            </ButtonLink>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-2 text-pretty">{i.message}</p>
      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer items-center rounded text-sm font-medium text-ink-2 hover:text-ink">Rule and limitation</summary>
        <div className="mt-3 space-y-3">
          <CitationCard citation={i.rule.citation} ruleId={i.rule.citation.related_rule ?? i.rule.id} />
          {i.limitation && <CautionNote>{i.limitation}</CautionNote>}
        </div>
      </details>
    </li>
  );
}

function YearsCompared({ d }: { d: SinceLastYear }) {
  const { app } = useWorkspace();
  const p = d.previous!;
  return (
    <Panel title="Years compared">
      <DescriptionList
        layout="stacked"
        columns={2}
        items={[
          {
            label: "Last year",
            value: <span className="font-medium">AY {p.academic_year}</span>,
            hint: (
              <span className="block space-y-0.5">
                <MetaList items={[p.application_id ? <Code key="id" className="text-xs">{p.application_id}</Code> : null, p.submitted_on ? `submitted ${fmtDate(p.submitted_on)}` : null]} />
                <span className="block">{p.source}</span>
              </span>
            ),
          },
          {
            label: "This application",
            value: <span className="font-medium">AY {d.academic_year}</span>,
            hint: (
              <span className="block space-y-0.5">
                <MetaList items={[<Code key="id" className="text-xs">{app.id}</Code>, app.submitted_at ? `submitted ${fmtDate(app.submitted_at)}` : null]} />
                <span className="block">Declared values, the faculty roster and certificates read from the uploaded documents</span>
              </span>
            ),
          },
        ]}
      />
    </Panel>
  );
}

function Figures({ rows, flagged, prevYear }: { rows: ScalarChange[]; flagged: Set<string>; prevYear: string | undefined }) {
  const changed = rows.filter((s) => s.status !== "same").length;
  const columns: Column<ScalarChange>[] = [
    { id: "label", header: "Declared", cell: (s) => <span className="font-medium">{s.label}</span> },
    { id: "before", header: "Last year", align: "right", cell: (s) => <span className="whitespace-nowrap text-ink-3">{fmtNum(s.before, s.unit)}</span> },
    { id: "after", header: "This year", align: "right", cell: (s) => <span className="whitespace-nowrap">{fmtNum(s.after, s.unit)}</span> },
    {
      id: "change",
      header: "Change",
      cell: (s) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className={s.delta ? "whitespace-nowrap text-ink" : "whitespace-nowrap text-ink-3"}>{deltaText(s)}</span>
          {flagged.has(s.key) && <StatusBadge tone="mismatch">Indicator</StatusBadge>}
        </span>
      ),
    },
  ];
  return (
    <Panel title="Figures" description={`${pluralize(changed, "declared value")} changed since AY ${prevYear ?? "last year"}.`} padding="none">
      <div className="border-t border-line">
        <DataTable label="Declared figures, last year and this year" rows={rows} columns={columns} rowKey={(s) => s.key} density="compact" empty="No declared figures to compare." />
      </div>
    </Panel>
  );
}

function Programmes({ rows, jump }: { rows: ProgrammeChange[]; jump: boolean }) {
  const { app } = useWorkspace();
  const columns: Column<ProgrammeChange>[] = [
    {
      id: "name",
      header: "Programme",
      cell: (p) => (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span className="font-medium">{p.name}</span>
          <Code className="text-xs">{p.code}</Code>
          {p.status === "added" && <span className="text-xs text-ink-3">New</span>}
          {p.status === "removed" && <span className="text-xs text-ink-3">Dropped</span>}
        </span>
      ),
    },
    { id: "before", header: "Approved last year", align: "right", cell: (p) => <span className="text-ink-3">{p.before_approved ?? "None"}</span> },
    {
      id: "after",
      header: "Proposed now",
      align: "right",
      cell: (p) => (
        <span className="whitespace-nowrap">
          {p.after_proposed ?? "None"}
          {p.delta_proposed !== null && p.delta_proposed > 0 && <span className="ml-1.5 text-ink-3">+{p.delta_proposed} seats</span>}
        </span>
      ),
    },
    {
      id: "nba",
      header: "NBA claim",
      cell: (p) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-ink-2">
            {p.before_nba === p.after_nba ? (p.after_nba ? "Claimed both years" : "No") : p.after_nba ? "New claim this year" : "Dropped this year"}
          </span>
          {jump && app.category === "EOA" && p.delta_proposed !== null && p.delta_proposed > 0 && <StatusBadge tone="mismatch">Indicator</StatusBadge>}
        </span>
      ),
    },
  ];
  return (
    <Panel title="Programmes" description="Proposed intake against the intake approved last year." padding="none">
      <div className="border-t border-line">
        <DataTable label="Programmes, last year and this year" rows={rows} columns={columns} rowKey={(p) => p.code} density="compact" empty="No programmes to compare." />
      </div>
    </Panel>
  );
}

function IdList({ title, ids }: { title: string; ids: string[] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs text-ink-3">{title}</h3>
      {ids.length ? (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {ids.map((id) => (
            <li key={id}>
              <Code className="text-xs">{id}</Code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-3">None</p>
      )}
    </div>
  );
}

function Faculty({ d, flagged }: { d: SinceLastYear; flagged: boolean }) {
  const { app } = useWorkspace();
  const f = d.faculty;
  const replaced = f ? f.removed.length : 0;
  return (
    <Panel
      title="Faculty roster"
      description="Compared by faculty ID between last year's roster and this year's faculty list."
      actions={
        d.roster_document_id ? (
          <ButtonLink size="sm" variant="ghost" to={workspacePath(app.id, "documents", { doc: d.roster_document_id })}>
            Open this year's faculty list
          </ButtonLink>
        ) : undefined
      }
    >
      {!f ? (
        <p className="text-sm text-ink-3">No faculty list was uploaded this year, so the roster was not compared.</p>
      ) : (
        <>
          <DescriptionList
            layout="stacked"
            columns={4}
            items={[
              { label: "Last year", value: pluralize(f.before, "faculty ID") },
              { label: "This year", value: pluralize(f.after, "faculty ID") },
              { label: "On both rosters", value: String(f.retained) },
              {
                label: "Replaced",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {replaced} of {f.before} replaced{f.replaced_share !== null ? ` (${Math.round(f.replaced_share * 100)}%)` : ""}
                    {flagged && <StatusBadge tone="mismatch">Indicator</StatusBadge>}
                  </span>
                ),
                hint: "An indicator is raised above 50 percent",
              },
            ]}
          />
          {(f.removed.length > 0 || f.added.length > 0) && (
            <>
              <PanelDivider label="Faculty IDs that changed" />
              <div className="grid gap-4 sm:grid-cols-2">
                <IdList title="Gone this year" ids={f.removed} />
                <IdList title="New this year" ids={f.added} />
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function Labs({ labs }: { labs: SinceLastYear["labs"] }) {
  return (
    <Panel title="Labs" description={labs ? `${labs.before} last year, ${labs.after} this year.` : undefined}>
      {!labs ? (
        <p className="text-sm text-ink-3">No labs were declared this year.</p>
      ) : labs.added.length === 0 && labs.removed.length === 0 ? (
        <p className="text-sm text-ink-3">The same labs as last year.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { t: "Added", items: labs.added },
            { t: "No longer declared", items: labs.removed },
          ].map((g) => (
            <div key={g.t} className="min-w-0">
              <h3 className="text-xs text-ink-3">{g.t}</h3>
              {g.items.length ? (
                <ul className="mt-1 space-y-0.5 text-sm text-ink">
                  {g.items.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-3">None</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Certificates({ rows }: { rows: CertificateChange[] }) {
  const { app } = useWorkspace();
  const label = useDocTypeLabel();
  const num = (n: string | null, until: string | null, empty: string, strong: boolean) => (
    <span className="block min-w-0">
      <Code className={strong ? "block text-xs break-all text-ink" : "block text-xs break-all text-ink-3"}>{n ?? empty}</Code>
      {until && <span className="block text-xs text-ink-3">valid until {fmtDate(until)}</span>}
    </span>
  );
  const columns: Column<CertificateChange>[] = [
    {
      id: "doc",
      header: "Document",
      cell: (c) =>
        c.document_id ? (
          <Link to={workspacePath(app.id, "documents", { doc: c.document_id })} className="rounded font-medium text-ink hover:underline">
            {label(c.type)}
          </Link>
        ) : (
          <span className="font-medium">{label(c.type)}</span>
        ),
    },
    { id: "before", header: "Last year", cell: (c) => num(c.before_number, c.before_valid_until, "None", false) },
    { id: "after", header: "This year", cell: (c) => num(c.after_number, c.after_valid_until, "Not read", true) },
    {
      id: "status",
      header: "Comparison",
      cell: (c) => {
        const st = CERT_STATUS[c.status];
        return (
          <StatusBadge tone={st.tone} title={st.tip}>
            {st.label}
          </StatusBadge>
        );
      },
    },
  ];
  return (
    <Panel title="Certificates" description="Numbers read from this year's documents against the numbers in last year's application." padding="none">
      <div className="border-t border-line">
        <DataTable label="Certificate numbers, last year and this year" rows={rows} columns={columns} rowKey={(c) => c.type} density="compact" empty="No certificates to compare." />
      </div>
    </Panel>
  );
}

/** Last year's application against this one: indicators first, then the plain figures. */
export function SinceLastYearView() {
  const { app } = useWorkspace();
  const q = useSinceLastYear(app.id);
  const d = q.data;
  if (q.isPending) {
    return (
      <div role="status" className="space-y-6">
        <span className="sr-only">Loading the comparison with last year</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (q.error || !d) return <ErrorState error={q.error} title="Could not load the comparison" onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  if (!d.available) {
    return (
      <Panel>
        <EmptyState
          title="No earlier application to compare with"
          description="AICTE records hold no earlier application for this institution. Figures, the faculty roster and certificates are compared once one exists."
        />
      </Panel>
    );
  }

  const indicators = d.indicators ?? [];
  const codes = new Set(indicators.map((i) => i.code));
  const flaggedScalars = new Set([
    ...(codes.has("YOY-LAND-AREA-DECREASED") ? ["land_area_acres"] : []),
    ...(codes.has("YOY-BUILT-UP-AREA-DECREASED") ? ["built_up_area_sqm"] : []),
  ]);

  return (
    <div className="space-y-6">
      <YearsCompared d={d} />
      <Panel
        title="Indicators"
        description="Changes against AICTE records for an official to review. Ordinary changes appear in the panels below without findings."
        padding="none"
      >
        {indicators.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {indicators.map((i) => (
              <IndicatorRow key={i.fingerprint} i={i} />
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-3">
            Every difference from last year falls within ordinary change: faculty moving, upgrades and renewals under new numbers.
          </p>
        )}
      </Panel>
      <Figures rows={d.scalars ?? []} flagged={flaggedScalars} prevYear={d.previous?.academic_year} />
      <Programmes rows={d.programmes ?? []} jump={codes.has("YOY-INTAKE-JUMP")} />
      <Faculty d={d} flagged={codes.has("YOY-FACULTY-TURNOVER")} />
      <Labs labs={d.labs} />
      <Certificates rows={d.certificates ?? []} />
    </div>
  );
}
