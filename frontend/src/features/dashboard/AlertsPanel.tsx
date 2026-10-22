import clsx from "clsx";
import { Clock, ServerOff, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { SeverityChip } from "../../components/ui/Badge";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/Feedback";
import { Segmented } from "../../components/ui/Tabs";
import type { DashboardAlert } from "../../types";

const KIND: Record<string, { label: string; icon: typeof ShieldAlert; className: string }> = {
  high_severity_finding: { label: "High-severity finding", icon: ShieldAlert, className: "text-sev-high-bg" },
  source_unavailable: { label: "Source unavailable", icon: ServerOff, className: "text-unavail-fg" },
  verification_pending: { label: "Verification pending", icon: Clock, className: "text-pending-fg" },
};

type Filter = "all" | "findings" | "verification";

function alertLink(a: DashboardAlert): string {
  const base = `/applications/${encodeURIComponent(a.application_id)}`;
  if (a.finding_id) return `${base}/findings?finding=${encodeURIComponent(a.finding_id)}`;
  return `${base}/verification${a.attempt_id ? `?attempt=${encodeURIComponent(a.attempt_id)}` : ""}`;
}

export function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = alerts.filter((a) =>
    filter === "all" ? true : filter === "findings" ? a.kind === "high_severity_finding" : a.kind !== "high_severity_finding",
  );
  return (
    <Card aria-labelledby="alerts-title" className="xl:sticky xl:top-20">
      <CardHeader id="alerts-title" title="Alerts" subtitle={`${alerts.length} needing attention`} />
      <div className="border-b border-line px-4 py-2">
        <Segmented<Filter>
          label="Filter alerts"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "findings", label: "Findings" },
            { value: "verification", label: "Verification" },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nothing to flag" className="py-8">
          No open high-severity findings or unresolved verification sources.
        </EmptyState>
      ) : (
        <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
          {shown.map((a, i) => {
            const k = KIND[a.kind] ?? KIND.high_severity_finding;
            const Icon = k.icon;
            return (
              <li key={`${a.application_id}-${a.finding_id ?? a.attempt_id ?? i}`}>
                <Link to={alertLink(a)} className="flex gap-2.5 px-4 py-2.5 hover:bg-subtle/60">
                  <Icon aria-hidden className={clsx("mt-0.5 size-4 shrink-0", k.className)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-medium text-fg">{a.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-subtle-fg">{a.institution}</span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <SeverityChip severity={a.severity} />
                      <span className="text-[11px] text-muted">{k.label}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
