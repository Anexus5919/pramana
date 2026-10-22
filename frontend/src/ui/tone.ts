import type { Tone } from "../lib/labels";
import { appStatusMeta, reviewStatusMeta, verificationMeta } from "../lib/labels";

export type { Tone };

export interface ToneClasses {
  fg: string;
  bg: string;
  dot: string;
  border: string;
  /** CSS colour for SVG fills, as a var() reference */
  color: string;
}

export const toneClass: Record<Tone, ToneClasses> = {
  verified: {
    fg: "text-verified-fg",
    bg: "bg-verified-bg",
    dot: "bg-verified-dot",
    border: "border-verified-dot/30",
    color: "var(--verified-dot)",
  },
  mismatch: {
    fg: "text-mismatch-fg",
    bg: "bg-mismatch-bg",
    dot: "bg-mismatch-dot",
    border: "border-mismatch-dot/30",
    color: "var(--mismatch-dot)",
  },
  expired: {
    fg: "text-expired-fg",
    bg: "bg-expired-bg",
    dot: "bg-expired-dot",
    border: "border-expired-dot/30",
    color: "var(--expired-dot)",
  },
  pending: {
    fg: "text-pending-fg",
    bg: "bg-pending-bg",
    dot: "bg-pending-dot",
    border: "border-pending-dot/30",
    color: "var(--pending-dot)",
  },
  unavail: {
    fg: "text-unavail-fg",
    bg: "bg-unavail-bg",
    dot: "bg-unavail-dot",
    border: "border-unavail-dot/30",
    color: "var(--unavail-dot)",
  },
  manual: {
    fg: "text-manual-fg",
    bg: "bg-manual-bg",
    dot: "bg-manual-dot",
    border: "border-manual-dot/30",
    color: "var(--manual-dot)",
  },
  unchecked: {
    fg: "text-unchecked-fg",
    bg: "bg-unchecked-bg",
    dot: "bg-unchecked-dot",
    border: "border-unchecked-dot/40",
    color: "var(--unchecked-dot)",
  },
  primary: {
    fg: "text-brand-ink",
    bg: "bg-brand-soft",
    dot: "bg-brand-500",
    border: "border-brand-300/50",
    color: "var(--brand-500)",
  },
};

export function verificationTone(status: string | null | undefined): Tone {
  return (status && verificationMeta[status]?.tone) || "unchecked";
}

export function appStatusTone(status: string | null | undefined): Tone {
  return (status && appStatusMeta[status]?.tone) || "unchecked";
}

export function reviewTone(status: string | null | undefined): Tone {
  return (status && reviewStatusMeta[status]?.tone) || "unchecked";
}
