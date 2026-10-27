import { en, type T } from "../i18n";
import type { Tone } from "../lib/labels";
import type { ItemStatus, MessageKind } from "./api";

export const CELL_NAME = "AICTE Scrutiny Cell";
export const MAX_BODY = 2000;
export const MIN_REASON = 10;
export const ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const ATTACH_MAX_MB = 15;

/** Item status: a chip label, its tone and a plain sentence for the institution. */
export const ITEM_STATUS: Record<ItemStatus, { label: string; tone: Tone; help: string }> = {
  open: { label: "Open", tone: "unchecked", help: "Not answered yet." },
  responded: { label: "Responded", tone: "pending", help: "You replied. The AICTE Scrutiny Cell reads it next." },
  resolved: { label: "Resolved", tone: "verified", help: "The AICTE Scrutiny Cell marked this item as done." },
  still_open: { label: "Still open", tone: "expired", help: "The AICTE Scrutiny Cell needs more on this item. Read its note." },
  review_requested: {
    label: "Review requested",
    tone: "manual",
    help: "You asked the AICTE Scrutiny Cell to look again. It replies before any outcome is recorded.",
  },
};

export const KIND_LABEL: Record<MessageKind, string> = {
  reply: "Reply",
  question: "Question",
  review_request: "Review request",
  cell_reply: "Reply",
};

/** What each institution action does, in words a college office can act on. */
export const KIND_HELP: Record<Exclude<MessageKind, "cell_reply">, string> = {
  reply: "Say what you did or are sending. To replace a document in your application, use its upload slot below; a file attached here is for reference only.",
  question: "Ask if something in this item is unclear. The AICTE Scrutiny Cell answers here.",
  review_request: "If you think this item is not right, say why. The AICTE Scrutiny Cell must reply before it records an outcome.",
};

// Words that describe how an indicator was found; the cell should say what to submit instead
const DETECTION = /\b(revisions?|edited after signing|overlays?|annotations?|forensics?|metadata)\b/gi;

export function detectionWords(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(DETECTION), (m) => m[0].toLowerCase())));
}

/** "15 days left", "Due today", "2 days past the date". */
export function daysLeftText(days: number | null, t: T = en): string | null {
  if (days === null) return null;
  if (days === 0) return t("Due today");
  if (days === 1) return t("1 day left");
  if (days > 1) return t("{n} days left", { n: days });
  return days === -1 ? t("1 day past the date") : t("{n} days past the date", { n: -days });
}
