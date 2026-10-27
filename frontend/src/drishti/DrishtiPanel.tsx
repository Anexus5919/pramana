import { ArrowUp, SquarePen, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { EyeMark } from "../brand/EyeMark";
import { Button, IconButton, cn, dur2, ease2 } from "../ui2";
import { Chips, Reply, RetryLine, Thinking, UserBubble, langOf } from "./Reply";
import { MAX_MESSAGE_CHARS, type ChatMessage } from "./types";

/** The counter appears once a message gets this close to the limit */
const COUNTER_FROM = 240;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface DrishtiPanelProps {
  id: string;
  /** Full-height sheet under 640 px */
  phone: boolean;
  greeting: string;
  starters: string[];
  messages: ChatMessage[];
  pending: boolean;
  /** Set when the last message went unanswered */
  failed: boolean;
  error: unknown;
  draft: string;
  onDraft: (text: string) => void;
  /** False when the message was not sent (empty, or a reply is pending) */
  onSend: (text: string) => boolean;
  onRetry: () => void;
  onNewChat: () => void;
  onClose: () => void;
  onNavigate: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

/** The chat window: header, the conversation as a live log, and the composer. */
export function DrishtiPanel({
  id,
  phone,
  greeting,
  starters,
  messages,
  pending,
  failed,
  error,
  draft,
  onDraft,
  onSend,
  onRetry,
  onNewChat,
  onClose,
  onNavigate,
  inputRef,
}: DrishtiPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const lastDrishti = messages.findLastIndex((m) => m.from === "drishti");

  // Newest message in view, at once on open. When a reply lands, its question moves to the top instead,
  // so a long answer reads from its start rather than from its last row
  const seen = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const first = seen.current === null;
    const grew = !first && messages.length > (seen.current ?? 0);
    seen.current = messages.length;
    let top = el.scrollHeight;
    if (grew && messages[messages.length - 1]?.from === "drishti") {
      const asks = el.querySelectorAll<HTMLElement>("[data-from='user']");
      const ask = asks[asks.length - 1];
      if (ask) top = Math.min(top, ask.offsetTop - 16);
    }
    el.scrollTo({ top, behavior: first || reduce ? "auto" : "smooth" });
    // messages.length is the trigger; the array itself changes identity on every keep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, pending, failed, reduce]);

  // The composer grows with its text, up to about four lines
  useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
  }, [draft, inputRef]);

  // A full-height sheet owns the screen: the page behind must not scroll
  useEffect(() => {
    if (!phone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phone]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    // Tab stays inside the window while it is open
    if (e.key !== "Tab" || !panel.current) return;
    const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function submit() {
    if (onSend(draft)) onDraft("");
  }

  const length = draft.length;
  const canSend = !!draft.trim() && !pending;

  return (
    <motion.div
      ref={panel}
      id={id}
      role="dialog"
      aria-modal={phone || undefined}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: phone ? 16 : 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: dur2.base, ease: ease2 } }}
      exit={{ opacity: 0, y: phone ? 16 : 4, transition: { duration: dur2.fast, ease: ease2 } }}
      className={cn(
        "fixed z-[61] flex flex-col overflow-hidden bg-surface",
        phone
          ? "inset-0 h-dvh"
          : "right-4 bottom-[88px] h-[min(560px,calc(100dvh-160px))] w-[380px] rounded-card border border-line shadow-lg",
      )}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line py-2.5 pr-2 pl-4">
        <EyeMark size={26} />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="flex items-baseline gap-2 text-base font-semibold text-ink">
            Drishti
            <span lang="hi" className="text-sm font-normal text-ink-3">
              दृष्टि
            </span>
          </h2>
          <p id={`${id}-desc`} className="truncate text-xs text-ink-3">
            Your scrutiny assistant
          </p>
        </div>
        <Button variant="ghost" size="sm" leadingIcon={<SquarePen aria-hidden />} onClick={onNewChat} disabled={!messages.length && !pending}>
          New chat
        </Button>
        <IconButton label="Close Drishti" icon={<X aria-hidden />} size="sm" onClick={onClose} />
      </header>

      <div
        ref={list}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation with Drishti"
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <p lang={langOf(greeting)} className="text-base leading-6 text-ink">
              {greeting}
            </p>
            {messages.length === 0 && <Chips chips={starters} onPick={onSend} disabled={pending} />}
          </div>
          {messages.map((m, i) =>
            m.from === "user" ? (
              <UserBubble key={m.id} text={m.text} />
            ) : (
              <Reply
                key={m.id}
                reply={m.reply}
                latest={i === lastDrishti && i === messages.length - 1}
                pending={pending}
                onPick={onSend}
                onNavigate={onNavigate}
              />
            ),
          )}
          {pending && <Thinking />}
          {failed && <RetryLine error={error} onRetry={onRetry} />}
        </div>
      </div>

      <form
        className={cn("shrink-0 border-t border-line px-3 pt-3", phone ? "pb-[max(12px,env(safe-area-inset-bottom))]" : "pb-2.5")}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-control border border-line-2 bg-surface py-1.5 pr-1.5 pl-3 shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-400/20">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={MAX_MESSAGE_CHARS}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask in English, हिंदी or Hinglish"
            aria-label="Message Drishti"
            aria-describedby={`${id}-hint`}
            className="max-h-28 min-h-7 flex-1 resize-none bg-transparent py-0.5 text-base leading-6 text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none"
          />
          <IconButton
            type="submit"
            label="Send"
            icon={<ArrowUp aria-hidden />}
            size="sm"
            disabled={!canSend}
            className={cn(canSend && "text-brand-ink hover:text-brand-ink")}
          />
        </div>
        <div id={`${id}-hint`} className="mt-1.5 flex items-center justify-between gap-3 text-xs text-ink-3">
          <span className={cn(phone && "sr-only")}>Enter to send, Shift+Enter for a new line</span>
          {length >= COUNTER_FROM && (
            <span className={cn("ml-auto tabular-nums", length >= MAX_MESSAGE_CHARS && "text-mismatch-fg")}>
              {length}/{MAX_MESSAGE_CHARS}
              <span className="sr-only"> characters</span>
            </span>
          )}
        </div>
      </form>
    </motion.div>
  );
}
