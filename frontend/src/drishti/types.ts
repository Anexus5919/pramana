// Wire types for Drishti, the assistant. The contract is docs/features/drishti-spec.md, section 5.

export type DrishtiKind = "answer" | "clarify" | "refuse" | "navigate" | "help" | "greeting";
export type DrishtiLanguage = "en" | "hi" | "hinglish";
/** How the message was understood; guardrail replies carry no source tag in the UI */
export type DrishtiSource = "guardrail" | "rules" | "model";
export type DrishtiItemType = "application" | "decision" | "finding" | "certificate" | "page" | "term";

/** One record behind an answer; `href` is an in-app route */
export interface DrishtiItem {
  type: DrishtiItemType;
  id: string;
  title: string;
  subtitle?: string | null;
  href?: string | null;
}

export interface DrishtiReply {
  kind: DrishtiKind;
  language: DrishtiLanguage;
  text: string;
  /** A count to show large; null when the answer is not a count */
  count?: number | null;
  /** At most 8; `more_href` points to the full list */
  items?: DrishtiItem[];
  more_href?: string | null;
  suggestions?: string[];
  source: DrishtiSource;
  /** The validated intent, for transparency */
  intent?: Record<string, unknown> | null;
}

export interface DrishtiContext {
  path: string;
  application_id: string | null;
}

export interface DrishtiAskBody {
  message: string;
  conversation_id: string | null;
  context: DrishtiContext;
}

export interface DrishtiAskResponse {
  conversation_id: string;
  reply: DrishtiReply;
}

/** Starter chips; the spec does not fix the shape, so a bare list or an object with an optional greeting both work */
export type DrishtiSuggestionsPayload = string[] | { greeting?: string | null; text?: string | null; suggestions?: string[] | null };

/** A message as the chat window shows and keeps it */
export type ChatMessage =
  | { id: string; from: "user"; text: string; at: number }
  | { id: string; from: "drishti"; reply: DrishtiReply; at: number };

/** A message has at most this many characters (spec section 4) */
export const MAX_MESSAGE_CHARS = 300;
