import { reviewActionLabel } from "../../lib/labels";
import type { AuditEvent } from "../../types";

export const GENESIS = "0".repeat(64);

/** Same canonical form as the backend: sorted keys, no spaces, non-ASCII kept as is. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type LinkState = "ok" | "hash" | "link";

export interface Recomputed {
  seq: number;
  /** ok: hash and link match; hash: the stored hash differs from the recomputed one; link: prev_hash does not point at the previous event */
  state: LinkState;
  computed: string;
}

/** Recomputes every loaded event's hash in ascending order and checks each link to the one before. */
export async function recompute(events: AuditEvent[]): Promise<Recomputed[]> {
  const asc = [...events].sort((a, b) => a.seq - b.seq);
  const out: Recomputed[] = [];
  let prev: AuditEvent | null = null;
  for (const e of asc) {
    const body = {
      seq: e.seq,
      ts: e.ts,
      actor: e.actor,
      actor_role: e.actor_role,
      action: e.action,
      object_type: e.object_type,
      object_id: e.object_id,
      application_id: e.application_id,
      details: e.details,
    };
    const computed = await sha256(e.prev_hash + canonical(body));
    const linkOk = prev ? (prev.seq === e.seq - 1 ? e.prev_hash === prev.hash : true) : e.seq === 1 ? e.prev_hash === GENESIS : true;
    out.push({ seq: e.seq, computed, state: computed !== e.hash ? "hash" : linkOk ? "ok" : "link" });
    prev = e;
  }
  return out;
}

export const FAMILIES = [
  { id: "auth", label: "Sign-in" },
  { id: "application", label: "Applications" },
  { id: "document", label: "Documents" },
  { id: "validation", label: "Validation" },
  { id: "finding", label: "Findings" },
  { id: "rectification", label: "Rectification" },
  { id: "verification", label: "Verification" },
  { id: "tool", label: "Tools" },
  { id: "sim", label: "Simulator" },
  { id: "system", label: "System" },
] as const;

export function family(action: string): string {
  return action.split(".")[0] ?? action;
}

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.login_failed": "Sign-in failed",
  "application.created": "Application created",
  "application.submitted": "Application submitted",
  "application.declared_updated": "Declared data updated",
  "document.uploaded": "Document uploaded",
  "document.rejected": "Upload rejected",
  "document.downloaded": "Document downloaded",
  "validation.completed": "Validation completed",
  "validation.failed": "Validation failed",
  "rectification.requested": "Rectification requested",
  "verification.manual_recorded": "Manual verification recorded",
  "tool.verify_pdf": "PDF checked with the verify tool",
  "sim.availability_changed": "Issuer availability changed",
  "system.seeded": "Demo data seeded",
  "audit.checkpoint": "Signed checkpoint created",
};

export function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  const [fam, rest = ""] = action.split(".");
  if (fam === "finding") return `Finding ${(reviewActionLabel[rest] ?? rest.replace(/_/g, " ")).toLowerCase()}`;
  const s = action.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
