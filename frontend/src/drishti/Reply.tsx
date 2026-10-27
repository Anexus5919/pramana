import { ArrowRight, ChevronRight, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api";
import { Button, buttonStyles, cn } from "../ui2";
import type { DrishtiItem, DrishtiLanguage, DrishtiReply } from "./types";

const DEVANAGARI = /[ऀ-ॿ]/;

/** Language tag for text, so screen readers pick a Hindi voice for Devanagari. */
export function langOf(text: string, language?: DrishtiLanguage): string | undefined {
  if (language === "hi" || DEVANAGARI.test(text)) return "hi";
  if (language === "hinglish") return "hi-Latn";
  return undefined;
}

/** Spec hrefs are illustrative ("/app/..."); map them onto the app's real routes. */
export function appHref(href: string | null | undefined): string | null {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return null;
  if (href === "/app" || href.startsWith("/app/queue")) return "/dashboard" + href.slice(href.indexOf("?") >= 0 ? href.indexOf("?") : href.length);
  if (href.startsWith("/app/")) return href.slice(4);
  return href;
}

function ItemRow({ item, onNavigate }: { item: DrishtiItem; onNavigate: (to: string) => void }) {
  const to = appHref(item.href);
  const body = (
    <span className="min-w-0 flex-1">
      <span lang={langOf(item.title)} className="line-clamp-2 text-sm font-medium text-ink">
        {item.title}
      </span>
      {item.subtitle && (
        <span lang={langOf(item.subtitle)} className="block truncate text-xs text-ink-3">
          {item.subtitle}
        </span>
      )}
    </span>
  );
  if (!to) return <li className="flex items-center gap-3 px-3 py-2">{body}</li>;
  return (
    <li>
      <Link
        to={to}
        onClick={() => onNavigate(to)}
        className="group flex items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-offset-[-2px]"
      >
        {body}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-4 transition-colors duration-150 group-hover:text-ink-2" />
      </Link>
    </li>
  );
}

function ItemList({ items, onNavigate, className }: { items: DrishtiItem[]; onNavigate: (to: string) => void; className?: string }) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {items.map((it, i) => (
        <ItemRow key={`${it.type}-${it.id}-${i}`} item={it} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}

export function Chips({ chips, onPick, disabled }: { chips: string[]; onPick: (text: string) => void; disabled?: boolean }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggestions">
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          lang={langOf(c)}
          disabled={disabled}
          onClick={() => onPick(c)}
          className="min-h-7 rounded-control border border-line-2 bg-surface px-2.5 py-1 text-left text-sm leading-5 text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function SourceTag({ source }: { source: DrishtiReply["source"] }) {
  if (source === "guardrail") return null;
  const label = source === "model" ? "our model" : "rules";
  return (
    <span
      title={source === "model" ? "Understood by our own question model" : "Understood by Pramana's rules"}
      className="inline-flex h-5 items-center rounded-[4px] border border-line px-1.5 text-xs text-ink-3"
    >
      <span className="sr-only">Understood by </span>
      {label}
    </span>
  );
}

function Text({ reply, className }: { reply: DrishtiReply; className?: string }) {
  return (
    <p lang={langOf(reply.text, reply.language)} className={cn("text-base leading-6 break-words whitespace-pre-line text-ink", className)}>
      {reply.text}
    </p>
  );
}

/** One Drishti reply, laid out by its kind. Links navigate only when clicked. */
export function Reply({
  reply,
  latest,
  pending,
  onPick,
  onNavigate,
}: {
  reply: DrishtiReply;
  /** Suggestion chips show only under the latest reply */
  latest: boolean;
  pending: boolean;
  onPick: (text: string) => void;
  /** Called with the route as a link is followed */
  onNavigate: (to: string) => void;
}) {
  const items = reply.items ?? [];
  const more = appHref(reply.more_href);
  let body: ReactNode;

  if (reply.kind === "answer") {
    const hasCount = reply.count !== null && reply.count !== undefined;
    body = (
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="px-3 py-2.5">
          {hasCount && <div className="text-xl font-semibold text-ink">{reply.count}</div>}
          <Text reply={reply} className={hasCount ? "text-sm leading-6 text-ink-2" : undefined} />
        </div>
        {items.length > 0 && <ItemList items={items} onNavigate={onNavigate} className="border-t border-line" />}
        {more && (
          <Link
            to={more}
            onClick={() => onNavigate(more)}
            className="group flex items-center gap-1.5 border-t border-line px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-offset-[-2px]"
          >
            See all
            <ArrowRight aria-hidden className="size-4 text-ink-3 transition-colors duration-150 group-hover:text-ink" />
          </Link>
        )}
      </div>
    );
  } else if (reply.kind === "navigate") {
    const target = items.find((i) => appHref(i.href)) ?? null;
    const to = appHref(target?.href) ?? more;
    body = (
      <div className="space-y-2">
        <Text reply={reply} />
        {to && (
          <Link
            to={to}
            onClick={() => onNavigate(to)}
            aria-label={`Go to ${target?.title ?? "the page"}`}
            className="group flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 transition-colors duration-150 hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span lang={target ? langOf(target.title) : undefined} className="block truncate text-sm font-medium text-ink">
                {target?.title ?? to}
              </span>
              {target?.subtitle && <span className="block truncate text-xs text-ink-3">{target.subtitle}</span>}
            </span>
            <span aria-hidden className={buttonStyles("primary", "sm")}>
              Go
              <ArrowRight />
            </span>
          </Link>
        )}
      </div>
    );
  } else {
    // clarify, refuse, help and greeting: plain text, with any linked records below
    body = (
      <div className="space-y-2">
        <Text reply={reply} className={reply.kind === "refuse" ? "text-ink-2" : undefined} />
        {items.length > 0 && <ItemList items={items} onNavigate={onNavigate} className="overflow-hidden rounded-card border border-line bg-surface" />}
        {more && (
          <Link to={more} onClick={() => onNavigate(more)} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:underline">
            See all
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
    );
  }

  const chips = latest ? (reply.suggestions ?? []) : [];
  return (
    <div className="space-y-2">
      <span className="sr-only">Drishti: </span>
      {body}
      {reply.source !== "guardrail" && (
        <div className="flex items-center gap-2">
          <SourceTag source={reply.source} />
        </div>
      )}
      {chips.length > 0 && (
        <div className="pt-1">
          <Chips chips={chips} onPick={onPick} disabled={pending} />
        </div>
      )}
    </div>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div data-from="user" className="flex justify-end pl-10">
      <p lang={langOf(text)} className="rounded-card bg-surface-2 px-3 py-2 text-base leading-6 break-words whitespace-pre-wrap text-ink">
        <span className="sr-only">You: </span>
        {text}
      </p>
    </div>
  );
}

export function Thinking() {
  return (
    <p className="text-sm text-ink-3">
      Drishti is thinking
    </p>
  );
}

function failureText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Pramana could not be reached. Check the connection, then try again.";
    if (error.status === 429) return "That is a lot of questions in a minute. Wait a moment, then try again.";
    if (error.status === 404 || error.status === 501) return "Drishti is not available on this server yet.";
    if (error.status === 422) return "Drishti could not read that message. Try different words.";
  }
  return error ? "Drishti could not answer just now." : "No reply arrived for this message.";
}

export function RetryLine({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
      <span>{failureText(error)}</span>
      <Button variant="ghost" size="sm" leadingIcon={<RotateCcw aria-hidden />} onClick={onRetry} className="-ml-1">
        Try again
      </Button>
    </div>
  );
}
