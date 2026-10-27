import { Bell, Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/session";
import { useMarkAllRead, useMarkRead, useNotifications } from "../conversation/api";
import { fmtDateTime, fmtRelative } from "../lib/format";
import { Button, EmptyState, ErrorState, IconButton, Skeleton, cn } from "../ui2";

/**
 * The bell in the top bar: unread count and the latest notifications, each a link to its thread or panel.
 * Officers and administrators hear from institutions; institutions hear from the AICTE Scrutiny Cell.
 * The list opens under the bar and stops short of the bottom of the screen, clear of Drishti's button.
 */
export function NotificationBell() {
  const { role } = useAuth();
  const enabled = role === "institution" || role === "officer" || role === "admin";
  const q = useNotifications(enabled);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    void q.refetch();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // refetch once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!enabled) return null;
  const unread = q.data?.unread ?? 0;
  const items = q.data?.items ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-9 items-center justify-center rounded-control text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
      >
        <Bell aria-hidden className="size-[18px]" />
        <span className="sr-only">{unread ? `Notifications, ${unread} unread` : "Notifications"}</span>
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-xs leading-none font-medium text-surface tabular-nums"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-2 top-16 z-50 overflow-hidden rounded-card border border-line bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line py-2 pr-2 pl-4">
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
            <Button size="sm" variant="ghost" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all as read
            </Button>
          </div>
          {q.isPending ? (
            <div role="status" className="space-y-2 p-4">
              <span className="sr-only">Loading notifications</span>
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : q.error ? (
            <ErrorState compact error={q.error} title="Could not load notifications" onRetry={() => void q.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState size="sm" title="No notifications" description="Letters, replies, review requests and outcomes appear here." />
          ) : (
            <ul className="max-h-[min(28rem,calc(100dvh-10rem))] divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="flex items-start gap-1 px-2 py-1">
                  <Link
                    to={n.link}
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 gap-2.5 rounded-control px-2 py-2 transition-colors duration-150 hover:bg-surface-2"
                  >
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-pending-dot")} />
                    <span className="min-w-0">
                      <span className={cn("block text-sm text-pretty", n.read ? "text-ink-2" : "font-medium text-ink")}>
                        {n.title}
                        {!n.read && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && <span className="mt-0.5 block text-xs text-ink-3 text-pretty">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-ink-3" title={fmtDateTime(n.created_at)}>
                        {fmtRelative(n.created_at)}
                      </span>
                    </span>
                  </Link>
                  {!n.read && (
                    <IconButton size="sm" label={`Mark "${n.title}" as read`} icon={<Check />} className="mt-1.5" onClick={() => markRead.mutate(n.id)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
