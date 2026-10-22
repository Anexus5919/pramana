import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { api, qk } from "../../../api";
import { Pill, Tag } from "../../../components/ui/Badge";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Digest } from "../../../components/ui/Digest";
import { EmptyState, ErrorBanner, Skeleton } from "../../../components/ui/Feedback";
import { fmtDate, fmtDateTime, fmtMs } from "../../../lib/format";
import type { RunBrief } from "../../../types";
import { SeverityChips } from "../../shared/Summaries";

function duration(r: RunBrief) {
  if (!r.started_at || !r.finished_at) return null;
  return new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
}

export function RunsTab({ appId }: { appId: string }) {
  const q = useQuery({ queryKey: qk.runs(appId), queryFn: () => api.runs(appId) });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorBanner error={q.error} title="Could not load runs" />;
  if (!q.data.length) {
    return (
      <Card>
        <EmptyState icon={<Clock className="size-6" />} title="No runs yet" />
      </Card>
    );
  }
  const reports = new Map<string, number>();
  for (const r of q.data) if (r.report_digest) reports.set(r.report_digest, (reports.get(r.report_digest) ?? 0) + 1);

  return (
    <Card aria-labelledby="runs-title">
      <CardHeader
        id="runs-title"
        icon={<Clock className="size-4" />}
        title="Validation runs"
        subtitle="Each run pins its inputs, ruleset and as-of date by digest, so it can be replayed and compared."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle/60 text-left text-[11px] tracking-wider text-subtle-fg uppercase">
              <th scope="col" className="py-2 pr-2 pl-4 font-semibold">Run</th>
              <th scope="col" className="px-2 py-2 font-semibold">Started</th>
              <th scope="col" className="px-2 py-2 font-semibold">Triggered by</th>
              <th scope="col" className="px-2 py-2 font-semibold">Ruleset</th>
              <th scope="col" className="px-2 py-2 font-semibold">As of</th>
              <th scope="col" className="px-2 py-2 font-semibold">Input digest</th>
              <th scope="col" className="px-2 py-2 font-semibold">Report digest</th>
              <th scope="col" className="py-2 pr-4 pl-2 font-semibold">Findings</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((r, i) => {
              const d = duration(r);
              return (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="py-2.5 pr-2 pl-4">
                    <div className="font-mono text-xs text-fg">{r.id}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {i === 0 && <Pill tone="primary">Latest</Pill>}
                      {r.status !== "complete" && <Pill tone={r.status === "failed" ? "mismatch" : "pending"}>{r.status}</Pill>}
                      {r.replay_of && <Tag title={`Replay of ${r.replay_of}`}>Replay of {r.replay_of.slice(0, 12)}</Tag>}
                      <Tag>Round {r.round}</Tag>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-muted">
                    {fmtDateTime(r.started_at)}
                    {d !== null && <div className="text-subtle-fg">took {fmtMs(d)}</div>}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-fg">{r.triggered_by ?? "system"}</td>
                  <td className="px-2 py-2.5">
                    <div className="font-mono text-xs text-fg">{r.ruleset_id}</div>
                    <Digest value={r.ruleset_hash} length={10} label="ruleset hash" className="mt-0.5" />
                  </td>
                  <td className="px-2 py-2.5 text-xs text-fg">{fmtDate(r.as_of)}</td>
                  <td className="px-2 py-2.5">
                    <Digest value={r.input_digest} label="input digest" />
                  </td>
                  <td className="px-2 py-2.5">
                    <Digest value={r.report_digest} label="report digest" />
                    {r.report_digest && (reports.get(r.report_digest) ?? 0) > 1 && (
                      <div className="mt-0.5 text-[11px] text-verified-fg">Same report as another run</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 pl-2">
                    <div className="mb-1 text-xs text-fg">{r.findings ?? 0} findings</div>
                    <SeverityChips bySeverity={r.by_severity} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
