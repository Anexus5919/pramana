import { CheckCircle2, CircleDot, Paperclip } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useDateFormat, useDateTimeFormat, useRelativeTime, useT } from "../i18n";
import { fmtBytes } from "../lib/format";
import { StatusBadge, cn } from "../ui2";
import type { ItemStatus, MessageEntry, StatusEntry, ThreadEntry } from "./api";
import { ITEM_STATUS, daysLeftText } from "./labels";

/** A translated sentence with styled parts: "{author} marked this item {status}" with nodes for the placeholders. */
function sentence(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{key && key in nodes ? nodes[key] : part}</Fragment>;
  });
}

export function ItemStatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const t = useT();
  const m = ITEM_STATUS[status] ?? ITEM_STATUS.open;
  return (
    <StatusBadge tone={m.tone} title={t(m.help)} className={className}>
      {t(m.label)}
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
  const t = useT();
  const date = useDateFormat();
  if (!respondBy) return null;
  const left = daysLeftText(daysLeft, t);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3", className)}>
      <span>
        {sentence(t("Respond by {date}"), { date: <span className="font-medium text-ink-2">{date(respondBy)}</span> })}
        {left && !pastDue ? `, ${left.toLowerCase()}` : ""}
      </span>
      {pastDue && (
        <StatusBadge tone="mismatch" title={left ?? undefined}>
          {t("Past due")}
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
  const dateTime = useDateTimeFormat();
  const relative = useRelativeTime();
  return (
    <time dateTime={at} title={dateTime(at)}>
      {relative(at)}
    </time>
  );
}

function Message({ m, official, pending }: { m: MessageEntry; official: boolean; pending: boolean }) {
  const t = useT();
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
        <span className="text-sm font-medium text-ink">{t(shortName(m.author))}</span>
        {official && m.author_name && <span>({shortName(m.author_name)})</span>}
        <span>{t(VERB[m.kind])}</span>
        <span aria-hidden>·</span>
        <When at={m.created_at} />
        {review && (
          <StatusBadge tone="manual" className="ml-auto">
            {pending ? t("Review request, awaiting reply") : t("Review request")}
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
  const t = useT();
  const done = s.to === "resolved";
  const label = ITEM_STATUS[s.to]?.label;
  const Icon = done ? CheckCircle2 : CircleDot;
  return (
    <li className="flex gap-2.5 px-1 py-1">
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", done ? "text-verified-fg" : "text-expired-fg")} />
      <div className="min-w-0 text-sm text-ink-2">
        <p>
          {sentence(t("{author} marked this item {status}"), {
            author: (
              <>
                <span className="font-medium text-ink">{t(s.author)}</span>
                {official && s.author_name ? ` (${shortName(s.author_name)})` : ""}
              </>
            ),
            status: <span className="font-medium text-ink">{label ? t(label).toLowerCase() : s.to}</span>,
          })}
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
  const t = useT();
  if (entries.length === 0) return null;
  const lastReview = [...entries].reverse().find((e) => e.type === "message" && e.kind === "review_request")?.id;
  return (
    <ol className="space-y-2" aria-label={t("Messages")}>
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
