import { ArrowUpRight, Clock, ServerOff, ShieldAlert, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { categoryMeta, humanize } from "../../lib/labels";
import type { DashboardAlert } from "../../types";
import { SeverityMeter } from "../../ui/Blocks";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";
import type { AppNavState } from "../../ui/shared";
import { EmptyState } from "../../ui/States";
import { Segmented } from "../../ui/Tabs";

const KIND: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  high_severity_finding: { label: "Finding", icon: ShieldAlert, className: "bg-mismatch-bg text-mismatch-fg" },
  source_unavailable: { label: "Source unavailable", icon: ServerOff, className: "bg-unavail-bg text-unavail-fg" },
  verification_pending: { label: "Verification pending", icon: Clock, className: "bg-pending-bg text-pending-fg" },
};

type Filter = "all" | "findings" | "verification";

export function alertLink(a: DashboardAlert): string {
  const base = `/applications/${encodeURIComponent(a.application_id)}`;
  if (a.finding_id) return `${base}/findings?finding=${encodeURIComponent(a.finding_id)}`;
  return `${base}/verification${a.attempt_id ? `?attempt=${encodeURIComponent(a.attempt_id)}` : ""}`;
}

function alertKey(a: DashboardAlert, i: number) {
  return `${a.application_id}-${a.finding_id ?? a.attempt_id ?? i}`;
}

export function AlertsFeed({ alerts }: { alerts: DashboardAlert[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const isFinding = (a: DashboardAlert) => a.kind === "high_severity_finding";
  const findings = alerts.filter(isFinding).length;
  const shown = alerts.filter((a) => (filter === "all" ? true : filter === "findings" ? isFinding(a) : !isFinding(a)));

  return (
    <section aria-labelledby="alerts-title" className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <h2 id="alerts-title" className="font-display text-lg font-semibold tracking-title">
            Alerts
          </h2>
          <p className="mt-0.5 text-sm text-ink-3">Open high-severity findings and unresolved verification sources.</p>
        </div>
        <Segmented<Filter>
          label="Filter alerts"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: alerts.length },
            { value: "findings", label: "Findings", count: findings },
            { value: "verification", label: "Verification", count: alerts.length - findings },
          ]}
        />
      </header>
      {shown.length === 0 ? (
        <EmptyState compact title="Nothing to flag" description="No open high-severity findings or unresolved verification sources." />
      ) : (
        <ul className="max-h-[520px] min-h-0 flex-1 overflow-y-auto border-t border-line">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((a, i) => {
              const k = KIND[a.kind] ?? KIND.high_severity_finding;
              const Icon = k.icon;
              return (
                <motion.li
                  key={alertKey(a, i)}
                  layout="position"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0, transition: { duration: dur.panel, ease: ease.out } }}
                  exit={{ opacity: 0, transition: { duration: dur.micro } }}
                  className="border-b border-line last:border-b-0"
                >
                  <Link
                    to={alertLink(a)}
                    state={{ institution: a.institution, from: "/dashboard" } satisfies AppNavState}
                    className="group/alert flex items-start gap-3 px-5 py-3 transition-colors duration-200 hover:bg-surface-2/70 focus-visible:outline-offset-[-2px]"
                  >
                    <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[9px]", k.className)}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug font-medium text-ink group-hover/alert:text-brand-ink">{a.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3">{a.institution}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                        <SeverityMeter severity={a.severity} label />
                        <span>{k.label}</span>
                        <span>{categoryMeta[a.category]?.short ?? humanize(a.category)}</span>
                      </span>
                    </span>
                    <ArrowUpRight
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-ink-4 transition-transform duration-200 group-hover/alert:translate-x-0.5 group-hover/alert:-translate-y-0.5 group-hover/alert:text-brand-500"
                    />
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
