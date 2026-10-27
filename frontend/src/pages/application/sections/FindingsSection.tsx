import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CATEGORIES, categoryMeta, EVIDENCE_CLASSES, evidenceClassMeta, humanize, reviewStatusMeta, SEVERITIES, severityRank } from "../../../lib/labels";
import { workspacePath } from "../../../shell/nav";
import type { ChecklistEntry, Finding } from "../../../types";
import {
  Button,
  cn,
  Code,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  EvidenceClassLabel,
  MetaList,
  Panel,
  ReviewBadge,
  RuleOutcomeBadge,
  SearchInput,
  Section,
  SegmentedControl,
  Select,
  SeverityIndicator,
  Skeleton,
  Toolbar,
  type Column,
} from "../../../ui2";
import { useDocTypeLabel, useWorkspace } from "../context";
import { isOpenFinding, useParam, useSetParams } from "../data";
import { FindingActions, FindingDetail, RuleDetail } from "./findings/FindingDetail";

const WIDE = "(min-width: 1280px)";

/** Tracks a media query; the split layout needs 1280 px. */
function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}

/** Detail beside the list at 1280 px and wider, in a drawer below that. */
function DetailHost({
  wide,
  title,
  body,
  footer,
  empty,
  onClose,
}: {
  wide: boolean;
  title: string | null;
  body: ReactNode;
  footer?: ReactNode;
  empty: ReactNode;
  onClose: () => void;
}) {
  if (wide) {
    return (
      <Panel
        key={title ?? "none"}
        as="aside"
        aria-label="Detail"
        // Ends above Drishti's button, so the detail actions in its footer stay clear of it
        className="sticky top-20 flex max-h-[calc(100dvh-104px-var(--drishti-clear,0px))] flex-col"
        bodyClassName="min-h-0 flex-1 overflow-y-auto"
        footer={title && footer ? footer : undefined}
      >
        {title ? body : empty}
      </Panel>
    );
  }
  return (
    <Drawer open={!!title} onClose={onClose} title={title ?? ""} width={560} footer={footer ? <div className="flex w-full flex-wrap items-center justify-end gap-2">{footer}</div> : undefined}>
      {body}
    </Drawer>
  );
}

function ViewSwitch({ value, openCount, ruleCount }: { value: "findings" | "checklist"; openCount?: number; ruleCount?: number }) {
  const setParams = useSetParams();
  return (
    <SegmentedControl
      label="View"
      value={value}
      onChange={(v) =>
        setParams(
          v === "checklist" ? { view: "checklist", q: null, finding: null, sev: null, ev: null, status: null } : { view: null, q: null, rule: null, outcome: null },
        )
      }
      options={[
        { value: "findings", label: "Findings", count: openCount },
        { value: "checklist", label: "Checklist", count: ruleCount },
      ]}
    />
  );
}

/** Roving focus inside a list: Arrow Up and Down move between rows while focus is in the list. */
function onListKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-row]"));
  const at = rows.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
}

const STATUS_ALL = "all";

function FindingsView({ query }: { query: UseQueryResult<Finding[]> }) {
  const { app, docs, run } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const wide = useMedia(WIDE);
  const setParams = useSetParams();
  const [q, setQ] = useParam("q");
  const [sev, setSev] = useParam("sev");
  const [ev, setEv] = useParam("ev");
  const [status, setStatus] = useParam("status");
  const [selected, setSelected] = useParam("finding");
  const listRef = useRef<HTMLDivElement>(null);

  const all = query.data;
  const filtered = useMemo(() => {
    const needle = (q ?? "").trim().toLowerCase();
    return (all ?? [])
      .filter((f) => (status === STATUS_ALL ? true : status ? f.review_status === status : isOpenFinding(f)))
      .filter((f) => (!ev || f.evidence_class === ev) && (!sev || f.severity === sev))
      .filter((f) => !needle || `${f.title} ${f.message} ${f.code}`.toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
          (evidenceClassMeta[a.evidence_class]?.level ?? 9) - (evidenceClassMeta[b.evidence_class]?.level ?? 9),
      );
  }, [all, ev, sev, status, q]);

  const groups = useMemo(() => {
    const extra = [...new Set(filtered.map((f) => f.category))].filter((c) => !(CATEGORIES as readonly string[]).includes(c));
    return [...CATEGORIES, ...extra].map((c) => ({ cat: c, items: filtered.filter((f) => f.category === c) })).filter((g) => g.items.length);
  }, [filtered]);

  const current = (all ?? []).find((f) => f.id === selected) ?? null;

  // A deep link to a finding scrolls its row into view once the list renders
  useEffect(() => {
    if (!selected) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(selected)}"]`);
    const r = el?.getBoundingClientRect();
    if (el && r && (r.top < 80 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: "nearest" });
  }, [selected, groups.length]);

  const openCount = all ? all.filter(isOpenFinding).length : undefined;
  const filtersOn = !!(q || sev || ev || status);
  const clear = () => setParams({ q: null, sev: null, ev: null, status: null });

  const toolbar = (
    <Toolbar end={filtersOn ? <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button> : undefined}>
      <ViewSwitch value="findings" openCount={openCount} ruleCount={run?.checklist.length} />
      <SearchInput value={q ?? ""} onChange={(v) => setQ(v)} label="Search findings" placeholder="Search findings" className="sm:w-56" />
      <Select selectSize="sm" aria-label="Severity" value={sev ?? ""} onChange={(e) => setSev(e.target.value)} className="w-auto">
        <option value="">All severities</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {humanize(s)}
          </option>
        ))}
      </Select>
      <Select selectSize="sm" aria-label="Evidence class" value={ev ?? ""} onChange={(e) => setEv(e.target.value)} className="w-auto">
        <option value="">All evidence classes</option>
        {EVIDENCE_CLASSES.map((c) => (
          <option key={c} value={c}>
            E{evidenceClassMeta[c].level} {evidenceClassMeta[c].label}
          </option>
        ))}
      </Select>
      <Select selectSize="sm" aria-label="Review status" value={status ?? ""} onChange={(e) => setStatus(e.target.value)} className="w-auto">
        <option value="">Open</option>
        <option value={STATUS_ALL}>All statuses</option>
        {Object.entries(reviewStatusMeta).map(([k, m]) => (
          <option key={k} value={k}>
            {k === "open" ? "Not yet reviewed" : m.label}
          </option>
        ))}
      </Select>
    </Toolbar>
  );

  if (query.isPending)
    return (
      <div className="space-y-6" role="status">
        <span className="sr-only">Loading findings</span>
        <Skeleton className="h-8 w-[36rem] max-w-full" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="hidden h-[480px] xl:block" />
        </div>
      </div>
    );
  if (query.error || !all) return <ErrorState error={query.error} title="Could not load findings" onRetry={() => void query.refetch()} />;

  const docName = (f: Finding) => (f.document_id && docs[f.document_id] ? docLabel(docs[f.document_id].declared_type) : null);

  let list: ReactNode;
  if (!all.length) {
    list = (
      <Panel>
        <EmptyState
          size="sm"
          title={app.latest_run ? "No findings on the latest run" : "Not validated yet"}
          description={
            app.latest_run
              ? "Every rule was met or did not apply, and no indicators were raised. Record the scrutiny outcome when you are ready."
              : "Run validation from More actions to check this application."
          }
        />
      </Panel>
    );
  } else if (!groups.length) {
    const onlyDefault = !status && !q && !sev && !ev;
    list = (
      <Panel>
        <EmptyState
          size="sm"
          title={onlyDefault ? "No open findings" : "No findings match these filters"}
          description={onlyDefault ? "Every finding has been reviewed. Show all statuses to see them and their history." : "Change or clear the filters to see more findings."}
          action={
            onlyDefault ? (
              <Button size="sm" onClick={() => setStatus(STATUS_ALL)}>
                Show all statuses
              </Button>
            ) : (
              <Button size="sm" onClick={clear}>
                Clear filters
              </Button>
            )
          }
        />
      </Panel>
    );
  } else {
    list = (
      <div ref={listRef} className="min-w-0 space-y-6" onKeyDown={onListKeyDown}>
        {groups.map((g) => (
          <Section
            key={g.cat}
            level={3}
            title={
              <>
                {categoryMeta[g.cat]?.label ?? humanize(g.cat)} <span className="font-normal text-ink-3">{g.items.length}</span>
              </>
            }
          >
            <Panel padding="none" className="overflow-hidden">
              <ul className="divide-y divide-line">
                {g.items.map((f) => {
                  const on = f.id === selected;
                  const doc = docName(f);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        data-row={f.id}
                        aria-pressed={on}
                        onClick={() => setSelected(f.id)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-offset-[-2px]",
                          on ? "bg-brand-soft" : "hover:bg-surface-2",
                        )}
                      >
                        <span className="pt-1">
                          <SeverityIndicator severity={f.severity} showLabel={false} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm font-medium", on ? "text-brand-ink" : "text-ink")}>{f.title}</span>
                          <MetaList className="mt-0.5 text-xs text-ink-3" items={[doc, <EvidenceClassLabel key="ev" cls={f.evidence_class} showName={false} />]} />
                        </span>
                        {f.review_status !== "open" && <ReviewBadge status={f.review_status} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </Section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}
      <div className={cn("min-w-0", wide && "grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-6")}>
        {list}
        <DetailHost
          wide={wide}
          title={current?.title ?? null}
          onClose={() => setSelected(null)}
          body={current ? <FindingDetail finding={current} showTitle={wide} /> : null}
          footer={current ? <FindingActions finding={current} /> : undefined}
          empty={<EmptyState size="sm" title="Select a finding" description="Its rule, evidence, inputs and review history open here." />}
        />
      </div>
    </div>
  );
}

const OUTCOME_ORDER = ["fail", "insufficient_evidence", "error", "pass", "not_applicable"];
const outcomeRank = (o: string) => {
  const i = OUTCOME_ORDER.indexOf(o);
  return i < 0 ? 9 : i;
};

function ChecklistView() {
  const { app, run, runLoading, findings } = useWorkspace();
  const wide = useMedia(WIDE);
  const setParams = useSetParams();
  const [q, setQ] = useParam("q");
  const [outcome, setOutcome] = useParam("outcome");
  const [rule, setRule] = useParam("rule");

  const entries = useMemo(() => run?.checklist ?? [], [run]);
  const shown = useMemo(() => {
    const needle = (q ?? "").trim().toLowerCase();
    return entries
      .filter((e) => !outcome || e.outcome === outcome)
      .filter((e) => !needle || `${e.title} ${e.rule_id} ${e.message}`.toLowerCase().includes(needle));
  }, [entries, outcome, q]);
  const byRule = useMemo(() => {
    const m = new Map<string, Finding>();
    for (const f of findings ?? []) if (f.rule?.id) m.set(f.rule.id, f);
    return m;
  }, [findings]);
  const current = entries.find((e) => e.rule_id === rule) ?? null;
  const openCount = findings ? findings.filter(isOpenFinding).length : undefined;

  const columns: Column<ChecklistEntry>[] = [
    { id: "outcome", header: "Outcome", cell: (e) => <RuleOutcomeBadge outcome={e.outcome} />, sortValue: (e) => outcomeRank(e.outcome), width: "136px" },
    {
      id: "rule",
      header: "Rule",
      cell: (e) => (
        <span className="block min-w-0 py-1.5">
          <span className="block">{e.title}</span>
          <Code className="block text-xs font-normal text-ink-3">{e.rule_id}</Code>
        </span>
      ),
      sortValue: (e) => e.title,
    },
    {
      id: "category",
      header: "Category",
      cell: (e) => <span className="text-ink-2">{e.category ? (categoryMeta[e.category]?.label ?? humanize(e.category)) : "Not given"}</span>,
      sortValue: (e) => e.category ?? "",
      hideBelow: "2xl",
    },
    {
      id: "severity",
      header: "Severity",
      cell: (e) => (e.severity ? <SeverityIndicator severity={e.severity} showLabel={!wide} /> : <span className="text-ink-4">None</span>),
      sortValue: (e) => (e.severity ? (severityRank[e.severity] ?? 9) : 9),
    },
    {
      id: "finding",
      header: "Finding",
      cell: (e) => {
        const f = byRule.get(e.rule_id);
        return f ? (
          <Link to={workspacePath(app.id, "findings", { finding: f.id })} className="rounded text-ink underline-offset-2 hover:underline">
            Open<span className="sr-only"> the finding for {e.title}</span>
          </Link>
        ) : null;
      },
      width: "80px",
    },
  ];

  const toolbar = (
    <Toolbar end={q || outcome ? <Button variant="ghost" size="sm" onClick={() => setParams({ q: null, outcome: null })}>Clear filters</Button> : undefined}>
      <ViewSwitch value="checklist" openCount={openCount} ruleCount={run ? entries.length : undefined} />
      <SearchInput value={q ?? ""} onChange={(v) => setQ(v)} label="Search rules" placeholder="Search rules" className="sm:w-56" />
      <Select selectSize="sm" aria-label="Outcome" value={outcome ?? ""} onChange={(e) => setOutcome(e.target.value)} className="w-auto">
        <option value="">All outcomes</option>
        <option value="pass">Met</option>
        <option value="fail">Not met</option>
        <option value="insufficient_evidence">Could not decide</option>
        <option value="not_applicable">Not applicable</option>
      </Select>
    </Toolbar>
  );

  if (!app.latest_run)
    return (
      <div className="space-y-6">
        {toolbar}
        <Panel>
          <EmptyState size="sm" title="Not validated yet" description="Run validation from More actions to evaluate the checklist for this application." />
        </Panel>
      </div>
    );
  if (runLoading || !run)
    return (
      <div className="space-y-6" role="status">
        <span className="sr-only">Loading the checklist</span>
        <Skeleton className="h-8 w-[28rem] max-w-full" />
        <Skeleton className="h-[420px]" />
      </div>
    );

  return (
    <div className="space-y-6">
      {toolbar}
      <div className={cn("min-w-0", wide && "grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-6")}>
        <Panel padding="none" className="overflow-hidden">
          <DataTable
            rows={shown}
            columns={columns}
            rowKey={(e) => e.rule_id}
            label="Checklist rules and their outcomes"
            linkColumn="rule"
            onRowClick={(e) => setRule(e.rule_id)}
            selectedKey={rule}
            defaultSort={{ id: "outcome", dir: "asc" }}
            density="compact"
            empty={entries.length ? "No rules match these filters." : "The active ruleset has no rules for this category."}
          />
        </Panel>
        <DetailHost
          wide={wide}
          title={current?.title ?? null}
          onClose={() => setRule(null)}
          body={current ? <RuleDetail entry={current} showTitle={wide} /> : null}
          empty={<EmptyState size="sm" title="Select a rule" description="The clause it cites, the facts it used and its evidence open here." />}
        />
      </div>
    </div>
  );
}

/** Findings section: the findings list with a side detail, or the checklist of rule outcomes. */
export function FindingsSection({ query }: { query: UseQueryResult<Finding[]> }) {
  const [view] = useParam("view");
  return view === "checklist" ? <ChecklistView /> : <FindingsView query={query} />;
}
