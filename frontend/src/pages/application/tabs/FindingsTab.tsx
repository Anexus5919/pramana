import type { UseQueryResult } from "@tanstack/react-query";
import { FileText, Search, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { pluralize } from "../../../lib/format";
import { CATEGORIES, categoryMeta, EVIDENCE_CLASSES, evidenceClassMeta, humanize, reviewStatusMeta, SEVERITIES, severityRank } from "../../../lib/labels";
import type { Finding } from "../../../types";
import { Kbd } from "../../../ui/Badge";
import { EvidenceClassChip, SeverityMeter } from "../../../ui/Blocks";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { Input, Select } from "../../../ui/Field";
import { dur, ease, fadeUp, spring, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { useToast } from "../../../ui/Toast";
import { useDocTypeLabel, useWorkspace } from "../context";
import { useReview, useWidth } from "../data";
import { FindingDetail, ReviewPill } from "./FindingDetail";

const SPLIT_AT = 880;

function useFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v) n.set(k, v);
            else n.delete(k);
          }
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { ev: get("ev"), sev: get("sev"), status: get("status"), q: get("q"), selected: get("finding"), set };
}

function Row({
  f,
  selected,
  active,
  split,
  onSelect,
  docName,
}: {
  f: Finding;
  selected: boolean;
  active: boolean;
  split: boolean;
  onSelect: () => void;
  docName: string | null;
}) {
  return (
    <button
      type="button"
      data-finding={f.id}
      onClick={onSelect}
      aria-expanded={split ? undefined : selected}
      aria-current={split && selected ? "true" : undefined}
      className={cn(
        "group/row relative grid w-full grid-cols-[30px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-offset-[-2px]",
        selected ? "bg-brand-soft/70" : "hover:bg-surface-2/70",
        active && !selected && "bg-surface-2/70",
      )}
    >
      {selected && (
        <motion.span layoutId="fnd-selected-bar" transition={spring.snappy} aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brand-500" />
      )}
      <span className="pt-0.5">
        <SeverityMeter severity={f.severity} />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm leading-snug transition-colors duration-200", selected ? "font-semibold text-brand-ink" : "font-medium text-ink group-hover/row:text-brand-ink")}>{f.title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <EvidenceClassChip cls={f.evidence_class} showName={false} />
          <ReviewPill status={f.review_status} />
          {docName && (
            <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-3">
              <FileText aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{docName}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function FindingsTab({ query, onRectify }: { query: UseQueryResult<Finding[]>; onRectify?: (ids: string[]) => void }) {
  const { app, docs, role } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const { ev, sev, status, q, selected, set } = useFilters();
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const split = width >= SPLIT_AT;
  const canReview = role === "officer" || role === "verifier";
  const review = useReview(app.id);
  const toast = useToast();
  const cursor = useRef<string | null>(null);

  const all = query.data;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (all ?? [])
      .filter((f) => (!ev || f.evidence_class === ev) && (!sev || f.severity === sev) && (!status || f.review_status === status))
      .filter((f) => !needle || `${f.title} ${f.message} ${f.code}`.toLowerCase().includes(needle))
      .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || (evidenceClassMeta[a.evidence_class]?.level ?? 9) - (evidenceClassMeta[b.evidence_class]?.level ?? 9));
  }, [all, ev, sev, status, q]);

  const groups = useMemo(() => {
    const order = [...CATEGORIES, ...new Set(filtered.map((f) => f.category).filter((c) => !(CATEGORIES as readonly string[]).includes(c)))];
    return order.map((c) => ({ cat: c, items: filtered.filter((f) => f.category === c) })).filter((g) => g.items.length);
  }, [filtered]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = flat.find((f) => f.id === selected) ?? (all ?? []).find((f) => f.id === selected) ?? null;

  const select = useCallback((id: string | null) => set({ finding: id }), [set]);

  // In split view, open the first finding so the detail pane is never empty
  useEffect(() => {
    if (split && !selected && flat.length) select(flat[0].id);
  }, [split, selected, flat, select]);

  useEffect(() => {
    if (!selected) return;
    cursor.current = selected;
    const el = wrap.current?.querySelector<HTMLElement>(`[data-finding="${CSS.escape(selected)}"]`);
    const r = el?.getBoundingClientRect();
    if (el && r && (r.top < 120 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  // j and k move, Enter opens, a acknowledges
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable='true']") || t.closest("[role='dialog']"))) return;
      if (!flat.length) return;
      const idx = Math.max(0, flat.findIndex((f) => f.id === (cursor.current ?? selected)));
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = flat[Math.min(flat.length - 1, Math.max(0, idx + (e.key === "j" ? 1 : -1)))];
        cursor.current = next.id;
        if (split) select(next.id);
        else wrap.current?.querySelector<HTMLElement>(`[data-finding="${CSS.escape(next.id)}"]`)?.focus();
      } else if (e.key === "Enter" && !split && t?.dataset.finding === undefined) {
        const id = cursor.current;
        if (id) select(selected === id ? null : id);
      } else if (e.key === "a" && canReview) {
        const f = flat.find((x) => x.id === (cursor.current ?? selected));
        if (!f || f.review_status !== "open" || review.isPending) return;
        e.preventDefault();
        review.mutate(
          { findingId: f.id, action: "acknowledge", note: null },
          { onSuccess: (n) => toast.success(`Acknowledged: ${n.title}`, "Status changed from Open to Acknowledged.") },
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, selected, split, select, canReview, review, toast]);

  if (query.isPending)
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" role="status">
        <span className="sr-only">Loading findings</span>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-[480px]" rounded="lg" />
      </div>
    );
  if (query.error || !all) return <ErrorState error={query.error} title="Could not load findings" onRetry={() => void query.refetch()} />;
  if (!all.length)
    return <EmptyState sky title="No findings on the latest run" description={app.latest_run ? "Every rule passed or did not apply, and no indicators were raised." : "This application has not been validated yet."} />;

  const filtersOn = !!(ev || sev || status || q);
  const docName = (f: Finding) => (f.document_id && docs[f.document_id] ? docLabel(docs[f.document_id].declared_type) : null);

  const list = (
    <LayoutGroup id="findings">
      <div className="space-y-4">
        {groups.length === 0 && (
          <EmptyState compact title="No findings match these filters" action={<Button size="sm" variant="ghost" onClick={() => set({ ev: null, sev: null, status: null, q: null })}>Clear filters</Button>} />
        )}
        <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-4">
          {groups.map((g) => (
            <motion.section key={g.cat} variants={fadeUp} aria-labelledby={`cat-${g.cat}`} className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
              <header className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-2/50 px-4 py-2.5">
                <h3 id={`cat-${g.cat}`} className="text-sm font-semibold text-ink">
                  {categoryMeta[g.cat]?.label ?? humanize(g.cat)}
                  <span className="ml-2 font-normal text-ink-3 tabular">{g.items.length}</span>
                </h3>
                <span className="hidden truncate text-xs text-ink-3 sm:block">{categoryMeta[g.cat]?.meaning}</span>
              </header>
              <ul className="divide-y divide-line">
                {g.items.map((f) => (
                  <li key={f.id}>
                    <Row f={f} selected={f.id === selected} active={false} split={split} onSelect={() => select(split || f.id !== selected ? f.id : null)} docName={docName(f)} />
                    {!split && (
                      <AnimatePresence initial={false}>
                        {f.id === selected && (
                          <motion.div
                            key="detail"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: dur.panel, ease: ease.out }}
                            className="overflow-hidden border-t border-line bg-canvas/40"
                          >
                            <div className="p-4 sm:p-5">
                              <FindingDetail finding={f} canReview={canReview} onRectify={onRectify} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </li>
                ))}
              </ul>
            </motion.section>
          ))}
        </motion.div>
      </div>
      {split && (
        <aside aria-label="Finding detail" className="sticky top-[128px] max-h-[calc(100dvh-148px)] min-w-0 overflow-y-auto rounded-panel border border-line bg-surface p-5 shadow-sm">
          <AnimatePresence mode="wait" initial={false}>
            {current ? (
              <motion.div key={current.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: dur.micro } }} transition={{ duration: dur.panel, ease: ease.out }}>
                <FindingDetail finding={current} canReview={canReview} onRectify={onRectify} />
              </motion.div>
            ) : (
              <EmptyState compact title="Select a finding" description="Its evidence, rule and review history open here." />
            )}
          </AnimatePresence>
        </aside>
      )}
    </LayoutGroup>
  );

  return (
    <div ref={wrap} className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          inputSize="sm"
          leadingIcon={<Search />}
          placeholder="Search findings"
          aria-label="Search findings"
          value={q}
          onChange={(e) => set({ q: e.target.value || null })}
          className="w-full sm:w-56"
        />
        <Select selectSize="sm" aria-label="Evidence class" value={ev} onChange={(e) => set({ ev: e.target.value || null })} className="w-[170px]">
          <option value="">All evidence classes</option>
          {EVIDENCE_CLASSES.map((c) => (
            <option key={c} value={c}>
              E{evidenceClassMeta[c].level} {evidenceClassMeta[c].label}
            </option>
          ))}
        </Select>
        <Select selectSize="sm" aria-label="Severity" value={sev} onChange={(e) => set({ sev: e.target.value || null })} className="w-[140px]">
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select selectSize="sm" aria-label="Review status" value={status} onChange={(e) => set({ status: e.target.value || null })} className="w-[170px]">
          <option value="">Any review status</option>
          {Object.entries(reviewStatusMeta).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </Select>
        {filtersOn && (
          <Button size="sm" variant="ghost" leadingIcon={<X />} onClick={() => set({ ev: null, sev: null, status: null, q: null })}>
            Clear
          </Button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-3" aria-hidden>
          <Kbd>j</Kbd>
          <Kbd>k</Kbd> move
          {!split && (
            <>
              <Kbd className="ml-1.5">Enter</Kbd> open
            </>
          )}
          {canReview && (
            <>
              <Kbd className="ml-1.5">a</Kbd> acknowledge
            </>
          )}
        </span>
      </div>
      {ev && (
        <div className="mb-3 flex items-center gap-2 text-sm text-ink-3">
          Showing <EvidenceClassChip cls={ev} /> {pluralize(filtered.length, "finding")}
        </div>
      )}
      <div className={cn("min-w-0", split && "grid items-start gap-5 grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>{list}</div>
    </div>
  );
}
