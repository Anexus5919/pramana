import { CheckCircle2, CircleDot, Paperclip } from "lucide-react";
import { fmtBytes, fmtDate, fmtDateTime, fmtRelative } from "../lib/format";
import { StatusBadge, cn } from "../ui2";
import type { ItemStatus, MessageEntry, StatusEntry, ThreadEntry } from "./api";
import { ITEM_STATUS, daysLeftText } from "./labels";

export function ItemStatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const m = ITEM_STATUS[status] ?? ITEM_STATUS.open;
  return (
    <StatusBadge tone={m.tone} title={m.help} className={className}>
      {m.label}
    </StatusBadge>
  );
}

/** "Respond by 11 Nov 2026, 15 days left", with a Past due chip once the date has gone by. */
export function DueLine({
  respondBy,
  daysLeft,
  pastDue,
  className,
}: {
  respondBy: string | null;
  daysLeft: number | null;
  pastDue: boolean;
  className?: string;
}) {
  if (!respondBy) return null;
  const left = daysLeftText(daysLeft);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3", className)}>
      <span>
        Respond by <span className="font-medium text-ink-2">{fmtDate(respondBy)}</span>
        {left && !pastDue ? `, ${left.toLowerCase()}` : ""}
      </span>
      {pastDue && (
        <StatusBadge tone="mismatch" title={left ?? undefined}>
          Past due
        </StatusBadge>
      )}
    </p>
  );
}

/** Demo account names carry the institution in brackets; the thread already says whose round it is. */
function shortName(s: string): string {
  return s.replace(/\s*\(.*\)\s*$/, "");
}

const VERB: Record<MessageEntry["kind"], string> = {
  reply: "replied",
  question: "asked a question",
  review_request: "requested a review",
  cell_reply: "replied",
};

function When({ at }: { at: string }) {
  return (
    <time dateTime={at} title={fmtDateTime(at)}>
      {fmtRelative(at)}
    </time>
  );
}

function Message({ m, official, pending }: { m: MessageEntry; official: boolean; pending: boolean }) {
  const review = m.kind === "review_request";
  return (
    <li
      className={cn(
        "rounded-control border px-3 py-2.5",
        m.side === "cell" ? "border-line bg-surface-2" : "border-line bg-surface",
        review && pending && "border-l-2 border-l-manual-dot",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span className="text-sm font-medium text-ink">{shortName(m.author)}</span>
        {official && m.author_name && <span>({shortName(m.author_name)})</span>}
        <span>{VERB[m.kind]}</span>
        <span aria-hidden>·</span>
        <When at={m.created_at} />
        {review && (
          <StatusBadge tone="manual" className="ml-auto">
            {pending ? "Review request, awaiting reply" : "Review request"}
          </StatusBadge>
        )}
      </div>
      <p className="mt-1 text-sm break-words whitespace-pre-line text-ink-2 text-pretty">{m.body}</p>
      {m.attachment && (
        <a
          href={m.attachment.url}
          download
          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded text-sm text-ink underline-offset-2 hover:underline"
        >
          <Paperclip aria-hidden className="size-4 shrink-0 text-ink-3" />
          <span className="truncate">{m.attachment.name}</span>
          <span className="shrink-0 text-xs text-ink-3">{fmtBytes(m.attachment.size)}</span>
        </a>
      )}
    </li>
  );
}

function StatusLine({ s, official }: { s: StatusEntry; official: boolean }) {
  const done = s.to === "resolved";
  const Icon = done ? CheckCircle2 : CircleDot;
  return (
    <li className="flex gap-2.5 px-1 py-1">
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", done ? "text-verified-fg" : "text-expired-fg")} />
      <div className="min-w-0 text-sm text-ink-2">
        <p>
          <span className="font-medium text-ink">{s.author}</span>
          {official && s.author_name ? ` (${shortName(s.author_name)})` : ""} marked this item{" "}
          <span className="font-medium text-ink">{ITEM_STATUS[s.to]?.label.toLowerCase() ?? s.to}</span>
          <span className="text-xs text-ink-3">
            {" "}
            · <When at={s.created_at} />
          </span>
        </p>
        {s.note && <p className="mt-0.5 break-words whitespace-pre-line text-pretty">{s.note}</p>}
      </div>
    </li>
  );
}

/** The thread in time order: messages from both sides and the cell's status decisions with their notes. */
export function ThreadEntries({ entries, official, pendingReview }: { entries: ThreadEntry[]; official: boolean; pendingReview: boolean }) {
  if (entries.length === 0) return null;
  const lastReview = [...entries].reverse().find((e) => e.type === "message" && e.kind === "review_request")?.id;
  return (
    <ol className="space-y-2" aria-label="Messages">
      {entries.map((e) =>
        e.type === "message" ? (
          <Message key={e.id} m={e} official={official} pending={pendingReview && e.id === lastReview} />
        ) : (
          <StatusLine key={e.id} s={e} official={official} />
        ),
      )}
    </ol>
  );
}
