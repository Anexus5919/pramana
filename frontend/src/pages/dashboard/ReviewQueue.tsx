import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Info, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { pluralize } from "../../lib/format";
import { appStatusMeta, humanize, SEVERITIES, severityRank, VERIFICATION_STATUSES, verificationMeta } from "../../lib/labels";
import type { DashboardRow, Finding } from "../../types";
import { CubeStrip, EvidenceClassChip, SeverityMeter, StatusCube, StatusPill } from "../../ui/Blocks";
import { Input } from "../../ui/Field";
import { dur, ease, fadeUp, stagger } from "../../ui/motion";
import { appTitleLayoutId, type AppNavState } from "../../ui/shared";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState } from "../../ui/States";
import { Tooltip } from "../../ui/Tooltip";
import { appStatusTone } from "../../ui/tone";

export function useCategoryLabel() {
  const { data } = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  return useCallback(
    (code: string) => {
      const l = data?.checklists[code]?.label ?? humanize(code);
      return { full: l, short: l.replace(/\s*\(.*\)$/, "") };
    },
    [data],
  );
}

const OPEN = new Set(["open", "acknowledged", "evidence_requested"]);

function topSeverity(bySeverity: Record<string, number>): string | null {
  return SEVERITIES.find((s) => bySeverity[s]) ?? null;
}

function SeveritySummary({ bySeverity }: { bySeverity: Record<string, number> }) {
  const top = topSeverity(bySeverity);
  if (!top) return <span className="text-xs text-ink-3">No findings</span>;
  const parts = SEVERITIES.filter((s) => bySeverity[s]).map((s) => `${bySeverity[s]} ${s}`);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <SeverityMeter severity={top} />
      <span className="truncate text-xs text-ink-2">{parts.join(", ")}</span>
    </span>
  );
}

function FindingsPreview({ row, anchor }: { row: DashboardRow; anchor: DOMRect }) {
  const q = useQuery({ queryKey: qk.findings(row.id), queryFn: () => api.findings(row.id), staleTime: 60_000 });
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  const top = useMemo(
    () =>
      (q.data ?? [])
        .filter((f: Finding) => OPEN.has(f.review_status))
        .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9))
        .slice(0, 4),
    [q.data],
  );

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 200;
    const w = 420;
    const left = Math.min(window.innerWidth - w - 16, Math.max(16, anchor.left + anchor.width * 0.42));
    const below = anchor.bottom + 8;
    const topPos = below + h > window.innerHeight - 12 ? anchor.top - h - 8 : below;
    setPos({ left, top: topPos });
  }, [anchor, q.data]);

  return createPortal(
    <motion.div
      ref={ref}
      role="tooltip"
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: dur.micro } }}
      transition={{ duration: dur.ui, ease: ease.out }}
      style={pos}
      className="pointer-events-none fixed z-[60] w-[420px] max-w-[calc(100vw-32px)] rounded-card border border-line bg-surface p-4 shadow-lg"
    >
      <div className="eyebrow">Top open findings</div>
      {q.isPending ? (
        <div className="mt-3 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5" rounded="sm" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">No open findings on the latest run.</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {top.map((f) => (
            <li key={f.id} className="flex items-start gap-2.5">
              <SeverityMeter severity={f.severity} className="mt-0.5" />
              <span className="min-w-0 flex-1 text-sm leading-snug text-ink">{f.title}</span>
              <EvidenceClassChip cls={f.evidence_class} showName={false} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 border-t border-line pt-2.5 text-xs text-ink-3">
        {pluralize(row.open_findings, "open finding")}. Open the workspace for evidence and review actions.
      </div>
    </motion.div>,
    document.body,
  );
}

function QueueRow({ row, index, onPreview }: { row: DashboardRow; index: number; onPreview: (r: DashboardRow | null, el?: HTMLElement) => void }) {
  const category = useCategoryLabel()(row.category);
  const run = row.latest_run;
  const docStatuses = Object.values(run?.document_status ?? {});
  const timer = useRef<number | undefined>(undefined);

  const start = (el: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onPreview(row, el), 280);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    onPreview(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <motion.li variants={fadeUp}>
      <Link
        to={`/applications/${encodeURIComponent(row.id)}`}
        state={{ institution: row.institution.name, from: "/dashboard" } satisfies AppNavState}
        onPointerEnter={(e) => start(e.currentTarget)}
        onPointerLeave={stop}
        onFocus={(e) => start(e.currentTarget)}
        onBlur={stop}
        onClick={stop}
        className="group/row relative grid grid-cols-[40px_minmax(0,1fr)_24px] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors duration-200 hover:bg-brand-soft/50 focus-visible:bg-brand-soft/50 focus-visible:outline-offset-[-2px] lg:grid-cols-[40px_minmax(0,2.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.15fr)_20px]"
      >
        <span className="flex flex-col items-start">
          <span className="font-display text-lg leading-none font-semibold text-ink tabular">{index + 1}</span>
          {run?.review_priority != null && (
            <span className="mt-1 font-mono text-[10px] text-ink-3" title="Sort key">
              key {run.review_priority}
            </span>
          )}
        </span>

        <span className="min-w-0">
          <motion.span
            layoutId={appTitleLayoutId(row.id)}
            className="block truncate text-[15px] font-semibold text-ink group-hover/row:text-brand-ink"
          >
            {row.institution.name}
          </motion.span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ink-3">
            <span className="font-mono">{row.institution.aicte_id}</span>
            <span aria-hidden className="text-ink-4">/</span>
            <span className="truncate">
              {row.institution.district}, {row.institution.state}
            </span>
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:hidden">
            <span className="text-xs text-ink-2">
              {category.short}, AY {row.academic_year}
            </span>
            <StatusPill status={row.status} tone={appStatusTone(row.status)} label={appStatusMeta[row.status]?.label} explain={false} />
            {run && <SeveritySummary bySeverity={run.by_severity} />}
            <CubeStrip statuses={docStatuses} />
          </span>
        </span>

        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-sm text-ink" title={category.full}>
            {category.short}
          </span>
          <span className="text-xs text-ink-3">AY {row.academic_year}, round {row.round}</span>
        </span>

        <span className="hidden min-w-0 lg:block">
          <StatusPill status={row.status} tone={appStatusTone(row.status)} label={appStatusMeta[row.status]?.label ?? humanize(row.status)} explain={false} />
          <span className="mt-1 block text-xs text-ink-3">{pluralize(row.open_findings, "open finding")}</span>
        </span>

        <span className="hidden min-w-0 lg:block">
          {run ? <SeveritySummary bySeverity={run.by_severity} /> : <span className="text-xs text-ink-3">Not validated</span>}
        </span>

        <span className="hidden min-w-0 lg:block">
          <CubeStrip statuses={docStatuses} max={10} />
        </span>

        <ChevronRight
          aria-hidden
          className="size-4 text-ink-4 transition-transform duration-200 group-hover/row:translate-x-0.5 group-hover/row:text-brand-500"
        />
      </Link>
    </motion.li>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-3">
      <span className="font-medium text-ink-2">Document verification</span>
      {VERIFICATION_STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <StatusCube status={s} size={10} />
          {verificationMeta[s].label}
        </span>
      ))}
    </div>
  );
}

export function ReviewQueue({ rows }: { rows: DashboardRow[] }) {
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<{ row: DashboardRow; rect: DOMRect } | null>(null);
  const label = useCategoryLabel();
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.institution.name, r.institution.aicte_id, r.id, r.category, label(r.category).full, r.academic_year, r.status, r.institution.district, r.institution.state]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q, label]);

  const onPreview = useCallback((r: DashboardRow | null, el?: HTMLElement) => {
    setPreview(r && el ? { row: r, rect: el.getBoundingClientRect() } : null);
  }, []);

  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [preview]);

  return (
    <section aria-labelledby="queue-title" className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-4 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h2 id="queue-title" className="font-display text-lg font-semibold tracking-title">
            Review queue
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-3">
            Ordered by a severity-weighted sort key. The order ranks the queue for attention and decides nothing. Hover a row to
            preview its top findings.
          </p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by institution, ID, place"
          aria-label="Filter applications"
          leadingIcon={<Search />}
          inputSize="sm"
          className="w-full sm:w-72"
        />
      </header>

      <div
        className="hidden grid-cols-[40px_minmax(0,2.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.15fr)_20px] gap-x-4 border-y border-line bg-surface-2/60 px-5 py-2 lg:grid"
        aria-hidden
      >
        <Tooltip content="Position in the queue. Sorted by a severity-weighted key; it is not a score.">
          <span className="eyebrow inline-flex items-center gap-1">
            Order <Info className="size-3" />
          </span>
        </Tooltip>
        <span className="eyebrow">Institution</span>
        <span className="eyebrow">Category</span>
        <span className="eyebrow">Status</span>
        <span className="eyebrow">Findings by severity</span>
        <span className="eyebrow">Documents</span>
        <span />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact={rows.length > 0}
          title={rows.length ? "No applications match the filter" : "The queue is empty"}
          description={rows.length ? "Clear the filter to see the full queue." : "Applications appear here once institutions submit them."}
        />
      ) : (
        <motion.ul
          variants={stagger(0.035, 0.15)}
          initial="hidden"
          animate="show"
          className="divide-y divide-line border-t border-line lg:border-t-0"
        >
          {filtered.map((r) => (
            <QueueRow key={r.id} row={r} index={rows.indexOf(r)} onPreview={onPreview} />
          ))}
        </motion.ul>
      )}

      <footer className="border-t border-line bg-surface-2/40 px-5 py-3">
        <Legend />
      </footer>

      <AnimatePresence>{preview && <FindingsPreview key={preview.row.id} row={preview.row} anchor={preview.rect} />}</AnimatePresence>
    </section>
  );
}
