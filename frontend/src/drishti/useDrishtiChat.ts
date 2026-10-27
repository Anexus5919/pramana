import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchPath, useLocation } from "react-router-dom";
import type { Role } from "../types";
import { askDrishti } from "./client";
import { MAX_MESSAGE_CHARS } from "./types";
import { loadChat, messageId, saveChat, type StoredChat } from "./store";
import type { DrishtiAskBody, DrishtiAskResponse, DrishtiContext, DrishtiReply } from "./types";

/** Where the user is: the path, and the application when inside a workspace or a portal application. */
export function contextFor(pathname: string): DrishtiContext {
  const m = matchPath("/applications/:appId/:tab?", pathname) ?? matchPath("/portal/applications/:appId", pathname);
  return { path: pathname, application_id: m?.params.appId ?? null };
}

/** Fills optional fields so rendering never trips over a sparse reply; rejects anything without text. */
function normalize(res: DrishtiAskResponse | null | undefined): DrishtiAskResponse {
  const r = res?.reply as Partial<DrishtiReply> | undefined;
  if (!r || typeof r.text !== "string") throw new Error("Drishti sent a reply this window cannot read");
  const reply: DrishtiReply = {
    kind: r.kind ?? "answer",
    language: r.language ?? "en",
    text: r.text,
    count: typeof r.count === "number" ? r.count : null,
    items: Array.isArray(r.items) ? r.items.filter((i) => i && typeof i.title === "string") : [],
    more_href: r.more_href ?? null,
    suggestions: Array.isArray(r.suggestions) ? r.suggestions.filter((s) => typeof s === "string" && s.trim()) : [],
    source: r.source ?? "rules",
    intent: r.intent ?? null,
  };
  return { conversation_id: res?.conversation_id ?? "", reply };
}

/**
 * The conversation: kept per user in sessionStorage, sent with the current page as context.
 * New chat starts a fresh epoch, so a reply still in flight for the old conversation is dropped.
 */
export function useDrishtiChat({ user, role, onReply }: { user: string; role: Role | undefined; onReply: () => void }) {
  const location = useLocation();
  const [chat, setChat] = useState<StoredChat>(() => loadChat(user));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const epoch = useRef(0);
  const latest = useRef({ chat, path: location.pathname, onReply });
  latest.current = { chat, path: location.pathname, onReply };

  const mutation = useMutation({ mutationFn: (body: DrishtiAskBody) => askDrishti(body, role) });
  const mutate = useRef(mutation.mutateAsync);
  mutate.current = mutation.mutateAsync;

  useEffect(() => saveChat(user, chat), [user, chat]);

  const request = useCallback(async (message: string) => {
    const e = epoch.current;
    setPending(true);
    setError(null);
    try {
      const res = normalize(
        await mutate.current({ message, conversation_id: latest.current.chat.conversationId, context: contextFor(latest.current.path) }),
      );
      if (e !== epoch.current) return;
      setChat((c) => ({
        conversationId: res.conversation_id || c.conversationId,
        messages: [...c.messages, { id: messageId(), from: "drishti", reply: res.reply, at: Date.now() }],
      }));
      latest.current.onReply();
    } catch (err) {
      if (e === epoch.current) setError(err);
    } finally {
      if (e === epoch.current) setPending(false);
    }
  }, []);

  const send = useCallback(
    (text: string): boolean => {
      const message = text.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!message || pending) return false;
      setChat((c) => ({ ...c, messages: [...c.messages, { id: messageId(), from: "user", text: message, at: Date.now() }] }));
      void request(message);
      return true;
    },
    [pending, request],
  );

  const last = chat.messages[chat.messages.length - 1];
  const failed = !pending && last?.from === "user";

  const retry = useCallback(() => {
    if (!pending && last?.from === "user") void request(last.text);
  }, [pending, last, request]);

  const reset = useCallback(() => {
    epoch.current += 1;
    setPending(false);
    setError(null);
    setChat({ conversationId: null, messages: [] });
  }, []);

  return { messages: chat.messages, pending, failed, error, send, retry, reset };
}
