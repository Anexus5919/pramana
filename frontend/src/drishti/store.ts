import type { ChatMessage } from "./types";

// The conversation lives in sessionStorage, per user, so it survives page changes and reloads in this tab only
const PREFIX = "pramana-drishti:";
/** Enough for a long session; older messages drop off the top */
const MAX_MESSAGES = 60;

export interface StoredChat {
  conversationId: string | null;
  messages: ChatMessage[];
}

const EMPTY: StoredChat = { conversationId: null, messages: [] };

function isMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== "object") return false;
  const x = m as { id?: unknown; from?: unknown; text?: unknown; reply?: unknown };
  if (typeof x.id !== "string") return false;
  if (x.from === "user") return typeof x.text === "string";
  if (x.from === "drishti") return !!x.reply && typeof (x.reply as { text?: unknown }).text === "string";
  return false;
}

export function loadChat(user: string): StoredChat {
  try {
    const raw = sessionStorage.getItem(PREFIX + user);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<StoredChat>;
    return {
      conversationId: typeof v.conversationId === "string" ? v.conversationId : null,
      messages: Array.isArray(v.messages) ? v.messages.filter(isMessage).slice(-MAX_MESSAGES) : [],
    };
  } catch {
    return EMPTY;
  }
}

export function saveChat(user: string, chat: StoredChat): void {
  try {
    if (!chat.conversationId && chat.messages.length === 0) sessionStorage.removeItem(PREFIX + user);
    else sessionStorage.setItem(PREFIX + user, JSON.stringify({ ...chat, messages: chat.messages.slice(-MAX_MESSAGES) }));
  } catch {
    // storage may be full or blocked; the chat still works for this page view
  }
}

/** Drops every kept conversation in this tab; called on sign-out. */
export function forgetChats(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // nothing kept, nothing to drop
  }
}

let seq = 0;
export function messageId(): string {
  seq += 1;
  return `m${Date.now().toString(36)}${seq}`;
}
