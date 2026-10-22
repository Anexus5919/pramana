import type { Tone } from "../../lib/labels";

export const toneClass: Record<Tone, { pill: string; dot: string; text: string; border: string }> = {
  verified: {
    pill: "bg-verified-bg text-verified-fg",
    dot: "bg-verified-dot",
    text: "text-verified-fg",
    border: "border-verified-dot",
  },
  mismatch: {
    pill: "bg-mismatch-bg text-mismatch-fg",
    dot: "bg-mismatch-dot",
    text: "text-mismatch-fg",
    border: "border-mismatch-dot",
  },
  expired: {
    pill: "bg-expired-bg text-expired-fg",
    dot: "bg-expired-dot",
    text: "text-expired-fg",
    border: "border-expired-dot",
  },
  pending: {
    pill: "bg-pending-bg text-pending-fg",
    dot: "bg-pending-dot",
    text: "text-pending-fg",
    border: "border-pending-dot",
  },
  unavail: {
    pill: "bg-unavail-bg text-unavail-fg",
    dot: "bg-unavail-dot",
    text: "text-unavail-fg",
    border: "border-unavail-dot",
  },
  manual: {
    pill: "bg-manual-bg text-manual-fg",
    dot: "bg-manual-dot",
    text: "text-manual-fg",
    border: "border-manual-dot",
  },
  unchecked: {
    pill: "bg-unchecked-bg text-unchecked-fg",
    dot: "bg-unchecked-dot",
    text: "text-unchecked-fg",
    border: "border-unchecked-dot",
  },
  primary: {
    pill: "bg-primary-soft text-primary-ink",
    dot: "bg-primary",
    text: "text-primary-ink",
    border: "border-primary",
  },
};

export const severityClass: Record<string, string> = {
  critical: "bg-sev-critical-bg text-sev-critical-fg",
  high: "bg-sev-high-bg text-sev-high-fg",
  medium: "bg-sev-medium-bg text-sev-medium-fg",
  low: "bg-sev-low-bg text-sev-low-fg",
  info: "bg-sev-info-bg text-sev-info-fg",
};

export const evidenceLevelClass: Record<number, string> = {
  1: "bg-ev-1-bg text-ev-1-fg border-transparent",
  2: "bg-ev-2-bg text-ev-2-fg border-transparent",
  3: "bg-ev-3-bg text-ev-3-fg border-transparent",
  4: "bg-ev-4-bg text-ev-4-fg border-transparent",
  5: "bg-ev-5-bg text-ev-5-fg border-ev-line",
  6: "bg-ev-6-bg text-ev-6-fg border-ev-line border-dashed",
  7: "bg-ev-7-bg text-ev-7-fg border-ev-line border-dotted",
};
