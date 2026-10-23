import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, ListChecks, Search, SearchX, Shuffle, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtDate } from "../../lib/format";
import { CATEGORIES, categoryMeta, humanize } from "../../lib/labels";
import type { ActiveRuleset, Rule } from "../../types";
import { Tag } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Digest } from "../../ui/Digest";
import { Input } from "../../ui/Field";
import { PageHeader } from "../../ui/Layout";
import { dur, ease } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../ui/States";
import { Segmented, TabPanel, Tabs } from "../../ui/Tabs";
import { Checklists } from "./Checklists";
import { NamespaceLegend } from "./Expr";
import { Impact } from "./Impact";
import { RuleCard, ruleDocs, ruleExpr } from "./RuleCard";

type TabId = "rules" | "checklists" | "impact";
const TABS_ID = "rules-tabs";

function RulesetCard({ rs }: { rs: ActiveRuleset }) {
  const stats = [
    { n: rs.rules.length, label: "rules" },
    { n: Object.keys(rs.document_types).length, label: "document types" },
    { n: Object.keys(rs.checklists).length, label: "checklists" },
  ];
  return (
    <section className="relative mb-6 overflow-hidden rounded-panel border border-white/50 bg-sky-soft shadow-sm dark:border-white/5">
      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-8">
        <div className="min-w-0">
          <div className="eyebrow mb-2">Active ruleset</div>
          <h2 className="font-display text-xl font-semibold tracking-title text-ink text-balance">{rs.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="font-mono text-[13px] text-ink-2">
              {rs.id}
              <span className="text-ink-4">@</span>
              {rs.version}
            </span>
            <Digest value={rs.sha256} label="Ruleset SHA-256" head={10} tail={8} />
          </div>
          <p className="mt-2 max-w-2xl text-sm text-ink-3 text-pretty">
            Rules are data, not code paths. Every run records this hash, so a past result can be replayed against the exact rules it used.
          </p>
        </div>
        <dl className="flex items-start gap-8 xl:pt-6">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col-reverse">
              <dt className="text-xs text-ink-3">{s.label}</dt>
              <dd className="font-display text-2xl font-semibold tracking-title text-ink tabular xl:text-3xl xl:tracking-display">{s.n}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="border-t border-line/70 bg-surface/60 px-5 py-4 backdrop-blur-sm sm:px-6">
        <div className="eyebrow mb-2.5">Sources</div>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rs.sources.map((s) => (
            <li key={s.id} className="flex min-w-0 items-start gap-2.5">
              <Tag variant={s.id === "CONFIG" ? "neutral" : "brand"} className="mt-0.5 shrink-0">
                {s.id}
              </Tag>
              <div className="min-w-0 text-sm">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="group text-ink-2 hover:text-brand-ink">
                    <span className="group-hover:underline">{s.title ?? s.id}</span>
                    <ExternalLink className="ml-1 inline size-3 align-[-1px] text-ink-4 group-hover:text-brand-ink" aria-hidden />
                  </a>
                ) : (
                  <span className="text-ink-2">{s.title ?? s.id}</span>
                )}
                {typeof s.published === "string" && <div className="text-xs text-ink-4">Published {fmtDate(s.published)}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

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

function RulesTab({ rs, docFilter, onClearDoc }: { rs: ActiveRuleset; docFilter: string | null; onClearDoc: () => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const present = CATEGORIES.filter((c) => rs.rules.some((r) => r.category === c));
  const base = rs.rules.filter((r) => matches(r, query.trim()) && (!docFilter || ruleDocs(r).includes(docFilter)));
  const shown = base.filter((r) => cat === "all" || r.category === cat);
  const groups = present.map((c) => ({ c, rules: shown.filter((r) => r.category === c) })).filter((g) => g.rules.length);
  const allOpen = shown.length > 0 && shown.every((r) => open.has(r.id));

  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto scrollbar-none">
          <Segmented
            label="Category"
            value={cat}
            onChange={setCat}
            options={[
              { value: "all", label: "All", count: base.length },
              ...present.map((c) => ({ value: c, label: categoryMeta[c]?.short ?? humanize(c), count: base.filter((r) => r.category === c).length })),
            ]}
          />
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rules, clauses, fields"
          leadingIcon={<Search />}
          trailing={
            query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-6 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X className="size-3.5" />
              </button>
            ) : undefined
          }
          className="w-full sm:w-80"
          aria-label="Search rules"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NamespaceLegend />
        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence>
            {docFilter && (
              <motion.button
                type="button"
                onClick={onClearDoc}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: dur.ui, ease: ease.out }}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand-300 bg-brand-soft pr-2 pl-2.5 text-xs font-medium text-brand-ink hover:border-brand-400"
              >
                <FileText className="size-3.5" aria-hidden />
                Reads {rs.document_types[docFilter]?.label ?? humanize(docFilter)}
                <X className="size-3.5" aria-label="Remove filter" />
              </motion.button>
            )}
          </AnimatePresence>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((r) => r.id)))}
            disabled={!shown.length}
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-8 text-ink-4" />}
          title="No rule matches"
          description="Try a rule ID such as APH-617I-FIRE-VALID, a field such as valid_until, or clear the filters."
          action={
            <Button
              size="sm"
              variant="soft"
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
      ) : (
        <LayoutGroup>
          <div className="space-y-8">
            {groups.map((g) => (
              <motion.section key={g.c} layout="position" aria-labelledby={`cat-${g.c}`} transition={{ duration: dur.panel, ease: ease.out }}>
                <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 id={`cat-${g.c}`} className="font-display text-lg font-semibold tracking-title text-ink">
                    {categoryMeta[g.c]?.label ?? humanize(g.c)}
                  </h3>
                  <span className="text-sm text-ink-3 tabular">{g.rules.length}</span>
                  <span className="text-sm text-ink-3">{categoryMeta[g.c]?.meaning}</span>
                </header>
                <div className="grid items-start gap-3 2xl:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {g.rules.map((r) => (
                      <motion.div
                        key={r.id}
                        layout="position"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: dur.ui, ease: ease.out }}
                        className="min-w-0"
                      >
                        <RuleCard rule={r} rs={rs} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.section>
            ))}
          </div>
        </LayoutGroup>
      )}
    </div>
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

  const counts = useMemo(() => {
    const rs = q.data;
    return { rules: rs?.rules.length ?? null, checklists: rs ? Object.keys(rs.checklists).length : null };
  }, [q.data]);

  function go(next: TabId, doc?: string | null) {
    const p = new URLSearchParams(params);
    if (next === "rules") p.delete("tab");
    else p.set("tab", next);
    if (doc === null) p.delete("doc");
    else if (doc) p.set("doc", doc);
    setParams(p, { replace: true });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Ruleset"
        title="Rules"
        description="Every check Pramana runs, written as data with the clause it comes from. The same ruleset and the same inputs always give the same result."
      />
      {q.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" rounded="lg" />
          <Skeleton className="h-10 w-80" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full" rounded="lg" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} title="Could not load the active ruleset" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <>
          <RulesetCard rs={q.data} />
          <Tabs<TabId>
            id={TABS_ID}
            label="Ruleset views"
            value={tab}
            onChange={(t) => go(t)}
            items={[
              { id: "rules", label: "Rules", count: counts.rules, icon: <ListChecks /> },
              { id: "checklists", label: "Checklists", count: counts.checklists, icon: <FileText /> },
              ...(canImpact ? [{ id: "impact" as const, label: "Change impact", icon: <Shuffle /> }] : []),
            ]}
            className="mb-5"
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: dur.ui, ease: ease.out }}
            >
              <TabPanel tabsId={TABS_ID} value={tab}>
                {tab === "rules" && <RulesTab rs={q.data} docFilter={docFilter} onClearDoc={() => go("rules", null)} />}
                {tab === "checklists" && <Checklists rs={q.data} onShowRules={(d) => go("rules", d)} />}
                {tab === "impact" && canImpact && <Impact />}
              </TabPanel>
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
