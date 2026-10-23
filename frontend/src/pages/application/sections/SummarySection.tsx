import { ChevronRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtDateTime, fmtRelative, fmtValue, pluralize } from "../../../lib/format";
import { categoryMeta, evidenceClassMeta, humanize, severityRank } from "../../../lib/labels";
import { workspacePath } from "../../../shell/nav";
import type { Programme, VerificationAttempt } from "../../../types";
import {
  ButtonLink,
  Code,
  DataTable,
  DescriptionList,
  EmptyState,
  MetaList,
  Panel,
  SeverityIndicator,
  SimulatedTag,
  Skeleton,
  type Column,
} from "../../../ui2";
import { useDocTypeLabel, useWorkspace } from "../context";
import { isOpenFinding, useVerifications } from "../data";
import { useSinceLastYear } from "../history/api";
import { WatchCard } from "../history/WatchCard";

const RULE_ORDER: [string, string][] = [
  ["pass", "met"],
  ["fail", "not met"],
  ["insufficient_evidence", "could not decide"],
  ["not_applicable", "not applicable"],
  ["error", "with an error"],
];

/** Plain-text breakdown such as "8 verified, 1 mismatch, 2 awaiting manual confirmation". */
export function verificationBreakdown(attempts: VerificationAttempt[]): string {
  const n = (pred: (a: VerificationAttempt) => boolean) => attempts.filter(pred).length;
  const parts: [number, string][] = [
    [n((a) => a.status === "verified"), "verified"],
    [n((a) => a.status === "mismatch_detected"), "mismatch"],
    [n((a) => a.status === "expired"), "expired"],
    [n((a) => a.status === "verification_pending"), "pending with the issuer"],
    [n((a) => a.status === "source_unavailable" || a.status === "manual_review_required"), "awaiting manual confirmation"],
  ];
  const shown = parts.filter(([c]) => c > 0).map(([c, l]) => `${c} ${l}`);
  return shown.length ? shown.join(", ") : "No checks applied";
}

function RowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" className="space-y-3 px-5 py-4">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}

function NeedsAttention() {
  const { app, findings, docs } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const top = useMemo(
    () =>
      (findings ?? [])
        .filter(isOpenFinding)
        .sort(
          (a, b) =>
            (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
            (evidenceClassMeta[a.evidence_class]?.level ?? 9) - (evidenceClassMeta[b.evidence_class]?.level ?? 9),
        )
        .slice(0, 5),
    [findings],
  );
  return (
    <Panel
      title="Needs attention"
      padding="none"
      actions={
        <ButtonLink size="sm" variant="ghost" to={workspacePath(app.id, "findings")}>
          All findings
        </ButtonLink>
      }
    >
      {!findings ? (
        <RowSkeleton rows={4} />
      ) : top.length === 0 ? (
        <EmptyState size="sm" title="No open findings" description="Record the scrutiny outcome when you are ready." />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {top.map((f) => {
            const doc = f.document_id ? docs[f.document_id] : undefined;
            return (
              <li key={f.id}>
                <Link
                  to={workspacePath(app.id, "findings", { finding: f.id })}
                  className="flex min-w-0 items-start gap-4 px-5 py-3 transition-colors duration-150 hover:bg-surface-2"
                >
                  <SeverityIndicator severity={f.severity} className="mt-0.5 w-24 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{f.title}</span>
                    <MetaList
                      className="mt-0.5 text-xs text-ink-3"
                      items={[doc ? docLabel(doc.declared_type) : null, categoryMeta[f.category]?.label ?? humanize(f.category)]}
                    />
                  </span>
                  <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function CheckRow({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex min-w-0 items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-surface-2">
        <span className="w-28 shrink-0 text-sm font-medium text-ink">{label}</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-ink-2">{children}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-4" />
      </Link>
    </li>
  );
}

function Checks() {
  const { app, run, runLoading } = useWorkspace();
  const ver = useVerifications(app.id);
  const latest = app.latest_run;
  const attempts = (ver.data ?? []).filter((a) => a.run_id === latest?.id);
  const simulated = attempts.some((a) => a.simulated);
  const current = app.documents.filter((d) => !d.superseded);
  const read = current.filter((d) => d.processing_status === "processed").length;
  const failed = current.filter((d) => d.processing_status === "failed").length;
  const waiting = current.length - read - failed;

  const outcomes: Record<string, number> = {};
  for (const c of run?.checklist ?? []) outcomes[c.outcome] = (outcomes[c.outcome] ?? 0) + 1;
  const rules = RULE_ORDER.filter(([k]) => outcomes[k]).map(([k, l]) => `${outcomes[k]} ${l}`);

  return (
    <div className="space-y-2">
      <Panel title="Checks" padding="none">
        {!latest ? (
          <EmptyState size="sm" title="Not validated yet" description="Run validation from More actions to check the documents against the handbook." />
        ) : runLoading || !run ? (
          <RowSkeleton />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            <CheckRow to={workspacePath(app.id, "findings", { view: "checklist" })} label="Rules">
              {rules.length ? rules.join(", ") : "No rules evaluated"}
            </CheckRow>
            <CheckRow to={workspacePath(app.id, "documents", { view: "verification" })} label="Verification">
              {ver.isPending ? <Skeleton className="h-4 w-48" /> : verificationBreakdown(attempts)}
              {simulated && <SimulatedTag />}
            </CheckRow>
            <CheckRow to={workspacePath(app.id, "documents")} label="Documents">
              {`${read} read, ${failed} failed${waiting > 0 ? `, ${waiting} waiting` : ""}`}
            </CheckRow>
          </ul>
        )}
      </Panel>
      {latest && (
        <p className="text-xs text-ink-3">
          Last validated{" "}
          <span title={fmtDateTime(latest.finished_at ?? latest.started_at)}>{fmtRelative(latest.finished_at ?? latest.started_at)}</span> against ruleset{" "}
          <Code className="text-xs">{latest.ruleset_id}</Code>. Details in{" "}
          <Link to={workspacePath(app.id, "activity")} className="text-ink-2 underline underline-offset-2 hover:text-ink">
            Activity
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function SinceLastYearLine() {
  const { app } = useWorkspace();
  const q = useSinceLastYear(app.id);
  if (!q.data?.available) return null;
  const n = q.data.indicators?.length ?? 0;
  return (
    <Panel padding="none">
      <Link
        to={workspacePath(app.id, "comparisons")}
        className="flex items-center gap-4 rounded-card px-5 py-3.5 text-sm text-ink transition-colors duration-150 hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          {n > 0
            ? `${pluralize(n, "change")} since last year ${n === 1 ? "needs" : "need"} a look`
            : `Compared with ${q.data.previous?.academic_year ?? "last year"}: no change needs a look`}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-4" />
      </Link>
    </Panel>
  );
}

function InstitutionPanel() {
  const { app } = useWorkspace();
  const i = app.institution;
  return (
    <Panel title="Institution">
      <DescriptionList
        labelWidth={112}
        items={[
          { label: "Name", value: i.name },
          { label: "AICTE ID", value: i.aicte_id, mono: true },
          { label: "AISHE code", value: i.aishe_code, mono: !!i.aishe_code },
          { label: "Type", value: humanize(i.institution_type) },
          { label: "Women only", value: i.women_only ? "Yes" : "No" },
          { label: "Society", value: i.society_name },
          { label: "Established", value: i.established_year ? String(i.established_year) : null },
          { label: "Address", value: [i.address, `${i.district}, ${i.state}${i.pincode ? ` ${i.pincode}` : ""}`].filter(Boolean).join(", ") },
        ]}
      />
    </Panel>
  );
}

const UNITS: Record<string, string> = { sqm: "sq m", acres: "acres", mbps: "Mbps" };

function declaredLabel(k: string): { label: string; unit?: string } {
  const m = k.match(/_(sqm|acres|mbps)$/);
  return { label: humanize(m ? k.slice(0, -m[0].length) : k), unit: m ? UNITS[m[1]] : undefined };
}

const PROGRAMME_COLUMNS: Column<Programme>[] = [
  { id: "code", header: "Code", cell: (p) => <Code className="text-xs">{p.code}</Code> },
  { id: "name", header: "Programme", cell: (p) => p.name },
  { id: "approved", header: "Approved", align: "right", cell: (p) => p.approved_intake },
  {
    id: "proposed",
    header: "Proposed",
    align: "right",
    cell: (p) => (
      <span className={p.proposed_intake > p.approved_intake ? "font-medium" : undefined}>
        {p.proposed_intake}
        {p.proposed_intake > p.approved_intake && <span className="ml-1 text-xs text-ink-3">+{p.proposed_intake - p.approved_intake}</span>}
      </span>
    ),
  },
  { id: "nba", header: "NBA", cell: (p) => (p.nba_accredited ? "Yes" : "No") },
];

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group mt-4 border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-ink-3 transition-transform duration-150 group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function DeclaredPanel() {
  const { app } = useWorkspace();
  const { programmes = [], labs, ...rest } = app.declared as Record<string, unknown> & { programmes?: Programme[]; labs?: unknown };
  const items = Object.entries(rest).map(([k, v]) => {
    const { label, unit } = declaredLabel(k);
    const mono = /number|_id$|transaction/.test(k);
    const value = Array.isArray(v) ? v.map((x) => fmtValue(x)).join(", ") : v == null || v === "" ? null : `${fmtValue(v)}${unit ? ` ${unit}` : ""}`;
    return { label, value, mono };
  });
  const labList = Array.isArray(labs) ? labs.map((l) => fmtValue(l)) : [];
  return (
    <Panel title="Declared figures" description="What the institution entered in the form.">
      <DescriptionList labelWidth={140} items={items} />
      <Disclosure summary={`Programmes (${programmes.length})`}>
        {programmes.length ? (
          <div className="-mx-5 border-t border-line">
            <DataTable rows={programmes} columns={PROGRAMME_COLUMNS} rowKey={(p) => p.code} label="Declared programmes" density="compact" />
          </div>
        ) : (
          <p className="text-sm text-ink-3">No programmes declared.</p>
        )}
      </Disclosure>
      {labList.length > 0 && (
        <Disclosure summary={`Labs (${labList.length})`}>
          <ul className="space-y-1 text-sm text-ink-2">
            {labList.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Disclosure>
      )}
    </Panel>
  );
}

/** What needs attention and what state the application is in. */
export function SummarySection() {
  return (
    <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <NeedsAttention />
        <Checks />
        <SinceLastYearLine />
        <WatchCard />
      </div>
      <aside className="min-w-0 space-y-6" aria-label="Institution and declared figures">
        <InstitutionPanel />
        <DeclaredPanel />
      </aside>
    </div>
  );
}
