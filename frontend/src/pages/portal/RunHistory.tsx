import { useQuery } from "@tanstack/react-query";
import { api, qk } from "../../api";
import { useDateTimeFormat, useT, type T } from "../../i18n";
import { roundLabel } from "../../lib/labels";
import type { RunBrief } from "../../types";
import { ErrorState, Panel, Skeleton, StatusBadge, cn } from "../../ui2";

function RunStatus({ status }: { status: string }) {
  const t = useT();
  if (status === "complete") return <StatusBadge tone="verified">{t("Complete")}</StatusBadge>;
  if (status === "failed" || status === "interrupted") return <StatusBadge tone="mismatch">{t("Failed")}</StatusBadge>;
  return <StatusBadge tone="pending">{t("Running")}</StatusBadge>;
}

function duration(r: RunBrief, t: T): string {
  if (!r.started_at || !r.finished_at) return "";
  const s = (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  return s < 60 ? t("{s} s", { s: s.toFixed(1) }) : t("{m} min {s} s", { m: Math.floor(s / 60), s: Math.round(s % 60) });
}

/** One line per automatic check: round, status, when it finished and how long it took. No ruleset or counts. */
export function RunHistoryPanel({ appId }: { appId: string }) {
  const q = useQuery({ queryKey: qk.runs(appId), queryFn: () => api.runs(appId) });
  const t = useT();
  const dateTime = useDateTimeFormat();
  // Replays are an officer's reproducibility check, not a check of the institution's submission
  const runs = (q.data ?? []).filter((r) => !r.replay_of);
  if (q.isSuccess && runs.length === 0) return null;
  const th = "h-9 px-3 text-xs font-medium whitespace-nowrap text-ink-3 first:pl-0 last:pr-0";
  const td = "h-11 px-3 align-middle first:pl-0 last:pr-0";
  return (
    <Panel title={t("Automatic check")} description={t("Pramana reads your documents and checks them against the handbook after each submission.")}>
      {q.isPending ? (
        <div role="status">
          <span className="sr-only">{t("Loading the check history")}</span>
          <Skeleton className="h-24" />
        </div>
      ) : q.error ? (
        <ErrorState compact error={q.error} title={t("Could not load the check history")} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t("Automatic check history")}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={cn(th, "text-left")}>
                  {t("Round")}
                </th>
                <th scope="col" className={cn(th, "text-left")}>
                  {t("Status")}
                </th>
                <th scope="col" className={cn(th, "text-left")}>
                  {t("Finished")}
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  {t("Duration")}
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className={cn(td, "text-ink")}>{roundLabel(r.round, t)}</td>
                  <td className={td}>
                    <RunStatus status={r.status} />
                  </td>
                  <td className={cn(td, "text-ink-2")}>{r.finished_at ? dateTime(r.finished_at) : t("Not finished")}</td>
                  <td className={cn(td, "text-right text-ink-2")}>{duration(r, t) || t("Not finished")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
