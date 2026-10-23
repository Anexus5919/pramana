import { useQuery } from "@tanstack/react-query";
import { RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtDate, pluralize } from "../../lib/format";
import { CATEGORIES, categoryMeta, humanize } from "../../lib/labels";
import type { ActiveRuleset, Rule } from "../../types";
import {
  Button,
  Callout,
  Code,
  DescriptionList,
  Digest,
  EmptyState,
  ErrorState,
  IconButton,
  MetaList,
  Page,
  PageHeader,
  Panel,
  SearchInput,
  Section,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
  Toolbar,
} from "../../ui2";
import { Checklists } from "./Checklists";
import { Impact } from "./Impact";
import { RuleRow, ruleDocs, ruleExpr } from "./RuleRow";

type TabId = "rules" | "checklists" | "impact";

function matches(rule: Rule, q: string): boolean {
  if (!q) return true;
  const hay = [rule.id, rule.title, ruleExpr(rule), rule.source?.quote, rule.source?.section, ...Object.values(rule.messages ?? {})]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function Sources({ rs }: { rs: ActiveRuleset }) {
  return (
    <Panel title="Sources" description="The regulations the rules cite. Every rule links to its clause and page.">
      <DescriptionList
        labelWidth={120}
        items={rs.sources.map((s) => ({
          label: <code className="font-mono text-xs text-ink-2">{s.id}</code>,
          value: s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer" className="text-ink underline-offset-2 hover:underline">
              {s.title ?? s.id}
            </a>
          ) : (
            (s.title ?? s.id)
          ),
          hint:
            s.id === "CONFIG"
              ? "Configuration, not a regulation"
              : typeof s.published === "string"
                ? `Published ${fmtDate(s.published)}`
                : undefined,
        }))}
      />
    </Panel>
  );
}

function RulesTab({ rs, docFilter, onClearDoc }: { rs: ActiveRuleset; docFilter: string | null; onClearDoc: () => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const present = CATEGORIES.filter((c) => rs.rules.some((r) => r.category === c));
  const base = rs.rules.filter((r) => matches(r, query.trim()) && (!docFilter || ruleDocs(r).includes(docFilter)));
  const shown = base.filter((r) => cat === "all" || r.category === cat);
  const groups = present.map((c) => ({ c, rules: shown.filter((r) => r.category === c) })).filter((g) => g.rules.length);
  const allOpen = shown.length > 0 && shown.every((r) => open.has(r.id));

  function setOne(id: string, isOpen: boolean) {
    setOpen((s) => {
      if (s.has(id) === isOpen) return s;
      const n = new Set(s);
      if (isOpen) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  return (
    <div className="space-y-8">
      <Callout tone="neutral">
        {rs.title}. Rules are data, not code paths, each with the clause it comes from. Every run records the ruleset hash, so a past result
        can be replayed against the exact rules it used.
      </Callout>

      <div className="space-y-6">
        <Toolbar
          end={
            <Button variant="ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((r) => r.id)))} disabled={!shown.length}>
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          }
        >
          <SearchInput value={query} onChange={setQuery} label="Search rules" placeholder="Search rules, clauses, fields" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" selectSize="sm" className="w-full sm:w-56">
            <option value="all">All categories ({base.length})</option>
            {present.map((c) => (
              <option key={c} value={c}>
                {categoryMeta[c]?.label ?? humanize(c)} ({base.filter((r) => r.category === c).length})
              </option>
            ))}
          </Select>
          {docFilter && (
            <span className="inline-flex items-center gap-1">
              <StatusBadge tone="primary">Reads: {rs.document_types[docFilter]?.label ?? humanize(docFilter)}</StatusBadge>
              <IconButton size="sm" label="Remove the document filter" icon={<X />} onClick={onClearDoc} />
            </span>
          )}
        </Toolbar>

        {groups.length === 0 ? (
          <Panel>
            <EmptyState
              title="No rule matches"
              description="Try a rule ID such as APH-617I-FIRE-VALID, a field such as valid_until, or clear the filters."
              action={
                <Button
                  onClick={() => {
                    setQuery("");
                    setCat("all");
                    onClearDoc();
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </Panel>
        ) : (
          groups.map((g) => (
            <Section
              key={g.c}
              title={
                <>
                  {categoryMeta[g.c]?.label ?? humanize(g.c)} <span className="font-normal text-ink-3">{g.rules.length}</span>
                </>
              }
              description={categoryMeta[g.c]?.meaning}
            >
              <Panel padding="none">
                <ul className="divide-y divide-line">
                  {g.rules.map((r) => (
                    <li key={r.id}>
                      <RuleRow rule={r} rs={rs} open={open.has(r.id)} onOpenChange={(o) => setOne(r.id, o)} />
                    </li>
                  ))}
                </ul>
              </Panel>
            </Section>
          ))
        )}
      </div>

      <Sources rs={rs} />
    </div>
  );
}

function RulesSkeleton() {
  return (
    <Page role="status" aria-live="polite">
      <span className="sr-only">Loading the active ruleset</span>
      <Skeleton className="h-12 w-96" />
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-12" rounded="lg" />
      <Skeleton className="h-96" rounded="lg" />
    </Page>
  );
}

export default function RulesPage() {
  const { is } = useAuth();
  const canImpact = is("officer", "admin");
  const q = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = raw === "checklists" || (raw === "impact" && canImpact) ? raw : "rules";
  const docFilter = params.get("doc");
  const impact = useQuery({ queryKey: qk.impact, queryFn: api.ruleImpact, enabled: tab === "impact" });

  const hrefFor = useMemo(
    () => (next: TabId) => {
      const p = new URLSearchParams(params);
      if (next === "rules") p.delete("tab");
      else p.set("tab", next);
      const s = p.toString();
      return s ? `/rules?${s}` : "/rules";
    },
    [params],
  );

  function go(next: TabId, doc?: string | null) {
    const p = new URLSearchParams(params);
    if (next === "rules") p.delete("tab");
    else p.set("tab", next);
    if (doc === null) p.delete("doc");
    else if (doc) p.set("doc", doc);
    setParams(p, { replace: true });
  }

  if (q.isPending) return <RulesSkeleton />;
  if (q.error)
    return (
      <Page>
        <PageHeader title="Rules" />
        <ErrorState error={q.error} title="Could not load the active ruleset" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </Page>
    );

  const rs = q.data;

  return (
    <Page>
      <PageHeader
        title="Rules"
        context={
          <MetaList
            items={[
              <Code key="id">
                {rs.id}@{rs.version}
              </Code>,
              pluralize(rs.rules.length, "rule"),
              <Digest key="sha" value={rs.sha256} label="Ruleset SHA-256" head={10} tail={8} />,
            ]}
          />
        }
        primary={
          tab === "impact" && canImpact ? (
            <Button variant="primary" leadingIcon={<RotateCcw />} loading={impact.isFetching} onClick={() => void impact.refetch()}>
              Recheck applications
            </Button>
          ) : undefined
        }
      >
        <Tabs
          label="Ruleset views"
          value={tab}
          items={[
            { id: "rules", label: "Rules", href: hrefFor("rules") },
            { id: "checklists", label: "Checklists", href: hrefFor("checklists") },
            ...(canImpact ? [{ id: "impact", label: "Change impact", href: hrefFor("impact") }] : []),
          ]}
        />
      </PageHeader>

      {tab === "rules" && <RulesTab rs={rs} docFilter={docFilter} onClearDoc={() => go("rules", null)} />}
      {tab === "checklists" && <Checklists rs={rs} onShowRules={(d) => go("rules", d)} />}
      {tab === "impact" && canImpact && <Impact q={impact} />}
    </Page>
  );
}
