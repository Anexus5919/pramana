import { AlertTriangle, Download } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CellComposer } from "../../../conversation/Composer";
import { useRoundThreads, type RoundThreads, type Thread } from "../../../conversation/api";
import { daysLeftText } from "../../../conversation/labels";
import { DueLine, ItemStatusBadge, ThreadEntries } from "../../../conversation/ThreadView";
import { fmtDate, pluralize } from "../../../lib/format";
import { workspacePath } from "../../../shell/nav";
import {
  Callout,
  DescriptionList,
  EmptyState,
  ErrorState,
  Panel,
  Select,
  Skeleton,
  StatusBadge,
  buttonStyles,
} from "../../../ui2";
import { officerApi } from "../officer/officerApi";
import { useWorkspace } from "../context";
import { useParam } from "../data";

/** Brings ?thread= (a notification or queue link) into view once the round has loaded, then drops the flag. */
function useThreadFocus(loaded: boolean) {
  const [sp, setSp] = useSearchParams();
  const target = sp.get("thread");
  useEffect(() => {
    if (!target || !loaded) return;
    const el = document.getElementById(`thread-${target}`);
    if (el) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    }
    const next = new URLSearchParams(sp);
    next.delete("thread");
    setSp(next, { replace: true });
  }, [target, loaded, sp, setSp]);
}

function ThreadPanel({ appId, data, t }: { appId: string; data: RoundThreads; t: Thread }) {
  const rectId = data.round?.rectification_id ?? "";
  const first = t.finding_ids?.[0];
  return (
    <Panel
      id={`thread-${t.id}`}
      tabIndex={-1}
      className="scroll-mt-20 outline-none"
      title={t.general ? "General thread" : `${t.item_no}. ${t.title}`}
      description={t.general ? "Messages about the round as a whole." : undefined}
      actions={
        <>
          {t.awaiting_reply && !t.pending_review && <StatusBadge tone="pending">Awaiting your reply</StatusBadge>}
          {!t.general && <ItemStatusBadge status={t.status} />}
        </>
      }
      footer={data.can_post ? <CellComposer appId={appId} rectificationId={rectId} thread={t} canSetStatus={data.can_set_status} /> : undefined}
    >
      <div className="space-y-3">
        {t.pending_review && (
          <p className="flex items-start gap-1.5 text-sm font-medium text-manual-fg">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            The institution thinks this item is not right. Reply, or mark it resolved or keep it open with a note, before recording an outcome.
          </p>
        )}
        {!t.general && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {t.status !== "resolved" && data.round?.status === "open" && <DueLine respondBy={t.respond_by} daysLeft={t.days_left} pastDue={t.past_due} />}
            {first && (
              <Link to={workspacePath(appId, "findings", { finding: first })} className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink">
                {t.finding_ids && t.finding_ids.length > 1 ? `Open the first of ${t.finding_ids.length} findings` : "Open the finding"}
              </Link>
            )}
          </div>
        )}
        {t.entries.length ? (
          <ThreadEntries entries={t.entries} official pendingReview={t.pending_review} />
        ) : (
          <p className="text-sm text-ink-3">No messages yet.</p>
        )}
      </div>
    </Panel>
  );
}

function RoundPanel({ data, onRound }: { data: RoundThreads; onRound: (id: string) => void }) {
  const r = data.round!;
  const items = data.threads.filter((t) => !t.general).length;
  const latest = data.rounds[data.rounds.length - 1]?.rectification_id;
  return (
    <Panel
      title={r.label}
      description={`Issued ${fmtDate(r.issued_at)} ${r.letter_id ? "with a deficiency letter" : "without a letter"}, ${pluralize(items, "item")}`}
      actions={
        <>
          {data.rounds.length > 1 && (
            <>
              <label htmlFor="round-pick" className="sr-only">
                Correction round
              </label>
              <Select id="round-pick" selectSize="sm" value={r.rectification_id} onChange={(e) => onRound(e.target.value)} className="w-52">
                {[...data.rounds].reverse().map((x) => (
                  <option key={x.rectification_id} value={x.rectification_id}>
                    {x.label}
                    {x.rectification_id === latest ? " (latest)" : ""}
                  </option>
                ))}
              </Select>
            </>
          )}
          {r.letter_id && (
            <a href={officerApi.letterPdfUrl(r.letter_id)} download className={buttonStyles("secondary", "sm")}>
              <Download aria-hidden />
              Letter PDF
            </a>
          )}
        </>
      }
    >
      <DescriptionList
        layout="stacked"
        columns={3}
        className="grid-cols-2"
        items={[
          {
            label: "Respond by",
            value: r.respond_by ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                {fmtDate(r.respond_by)}
                {r.past_due && <StatusBadge tone="mismatch">Past due</StatusBadge>}
              </span>
            ) : null,
            hint: r.respond_by && !r.past_due && r.status === "open" ? daysLeftText(r.days_left) : undefined,
          },
          { label: "Status", value: r.status === "open" ? "Waiting for the institution" : `Resubmitted ${fmtDate(r.responded_at)}` },
          { label: "Awaiting your reply", value: pluralize(data.counts.awaiting_reply, "thread") },
        ]}
      />
    </Panel>
  );
}

/** The correction round from the cell's side: each item's thread with a reply box, status decisions and review requests. */
export function RectificationSection() {
  const { app } = useWorkspace();
  const [roundParam, setRound] = useParam("round");
  const q = useRoundThreads(app.id, roundParam ?? undefined);
  useThreadFocus(!!q.data);

  if (q.isPending)
    return (
      <div role="status" className="space-y-6">
        <span className="sr-only">Loading the correction round</span>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  if (q.error || !q.data) return <ErrorState error={q.error} title="Could not load the correction round" onRetry={() => void q.refetch()} />;
  const d = q.data;
  if (!d.round)
    return (
      <Panel>
        <EmptyState
          size="sm"
          title="No correction round yet"
          description="Use Decide, then Request rectification. The institution's replies, questions and review requests appear here."
        />
      </Panel>
    );

  const pendingAll = d.counts.pending_reviews_all_rounds ?? 0;
  const pendingHere = d.counts.pending_reviews;
  return (
    <div className="space-y-6">
      {pendingAll > 0 && (
        <Callout tone="warning" role="status" title="Reply to the institution's review request first">
          {pluralize(pendingAll, "review request")} {pendingAll === 1 ? "is" : "are"} waiting for the cell
          {pendingHere < pendingAll ? `, ${pendingAll - pendingHere === 1 ? "one" : "some"} in an earlier round (pick it from the round list)` : ""}. The
          scrutiny outcome can be recorded once each has a reply, or a status decision with a note. Requesting another rectification stays possible.
        </Callout>
      )}
      <RoundPanel data={d} onRound={(id) => setRound(id === d.rounds[d.rounds.length - 1].rectification_id ? null : id)} />
      {!d.can_post && d.closed_reason && <p className="text-sm text-ink-3">{d.closed_reason}</p>}
      {d.threads.map((t) => (
        <ThreadPanel key={t.id} appId={app.id} data={d} t={t} />
      ))}
    </div>
  );
}
