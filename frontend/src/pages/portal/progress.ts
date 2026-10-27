import { en, type T } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { correctionRound, humanize, roundPhrase } from "../../lib/labels";
import type { ApplicationDetail, ChecklistSlot, DocumentSummary, Rectification } from "../../types";
import type { Step } from "../../ui2";

/** Statuses in which the institution can still change documents and figures. */
export const EDITABLE = new Set(["draft", "rectification_requested"]);

/** The newest upload per document type, ignoring superseded files. */
export function currentDocs(docs: DocumentSummary[]): Map<string, DocumentSummary> {
  const m = new Map<string, DocumentSummary>();
  for (const d of docs) {
    if (d.superseded) continue;
    const prev = m.get(d.declared_type);
    if (!prev || (d.uploaded_at ?? "") > (prev.uploaded_at ?? "")) m.set(d.declared_type, d);
  }
  return m;
}

export function missingRequired(app: ApplicationDetail, docs: Map<string, DocumentSummary>): ChecklistSlot[] {
  return app.document_checklist.filter((s) => s.required && !(docs.has(s.doc_type) || s.uploaded));
}

/** The rectification the institution is answering now, if any. */
export function openRectification(app: ApplicationDetail): Rectification | undefined {
  return [...app.rectifications].filter((r) => r.status === "open").sort((a, b) => b.round - a.round)[0];
}

/** The latest correction round, open or answered: its conversation stays on the page after a resubmission. */
export function latestRectification(app: ApplicationDetail): Rectification | undefined {
  return [...app.rectifications].sort((a, b) => b.round - a.round || b.created_at.localeCompare(a.created_at))[0];
}

/** The rectification most recently answered, for "Resubmitted on" sentences. */
export function lastResponded(app: ApplicationDetail): Rectification | undefined {
  return [...app.rectifications]
    .filter((r) => r.responded_at)
    .sort((a, b) => (b.responded_at ?? "").localeCompare(a.responded_at ?? ""))[0];
}

/**
 * Where the application stands for the institution. Every server status maps to one stage;
 * anything unknown stays "unknown" and is never shown as a draft.
 */
export type PortalStage =
  | "draft-missing"
  | "draft-ready"
  | "checking"
  | "check-failed"
  | "under-review"
  | "rectification"
  | "rectified"
  | "closed"
  | "withdrawn"
  | "unknown";

export function portalStage(app: ApplicationDetail, missing: number, following: boolean): PortalStage {
  switch (app.status) {
    case "draft":
      return missing > 0 ? "draft-missing" : "draft-ready";
    case "submitted":
    case "validating":
      // A run that failed and is not being followed has nothing left to show progress for
      return !following && app.latest_run?.status === "failed" ? "check-failed" : "checking";
    case "under_review":
      return "under-review";
    case "rectification_requested":
      return "rectification";
    case "rectified":
      return following ? "checking" : "rectified";
    case "closed":
      return "closed";
    case "withdrawn":
      return "withdrawn";
    default:
      return "unknown";
  }
}

const LABELS = {
  details: "Details",
  documents: "Documents",
  submitted: "Submitted",
  review: "AICTE review",
  decision: "Decision",
} as const;

type StepId = keyof typeof LABELS;
type StepSpec = [Step["status"], string?];

function buildSteps(spec: Record<StepId, StepSpec>, t: T): Step[] {
  return (Object.keys(LABELS) as StepId[]).map((id) => ({
    id,
    label: t(LABELS[id]),
    status: spec[id][0],
    description: spec[id][1],
  }));
}

/**
 * The five-step application stepper for every status, including repeated rounds, closed and withdrawn.
 * The portal passes its translator and date format; the defaults are English.
 */
export function progressSteps(app: ApplicationDetail, missing: number, t: T = en, date: (v: string) => string = fmtDate): Step[] {
  const rect = openRectification(app);
  const submittedOn = app.submitted_at ? date(app.submitted_at) : undefined;
  const resubmitted = t("Resubmitted, {round}", { round: roundPhrase(app.round, t) });
  const sent: StepSpec = ["complete", app.round > 1 ? resubmitted : submittedOn];
  const build = (spec: Record<StepId, StepSpec>) => buildSteps(spec, t);
  switch (app.status) {
    case "draft":
      return missing > 0
        ? build({
            details: ["complete"],
            documents: ["current", t("{n} missing", { n: missing })],
            submitted: ["upcoming"],
            review: ["upcoming"],
            decision: ["upcoming"],
          })
        : build({
            details: ["complete"],
            documents: ["complete"],
            submitted: ["current", t("Ready to submit")],
            review: ["upcoming"],
            decision: ["upcoming"],
          });
    case "submitted":
    case "validating":
      return build({
        details: ["complete"],
        documents: ["complete"],
        submitted: ["current", t("Being checked")],
        review: ["upcoming"],
        decision: ["upcoming"],
      });
    case "under_review":
      return build({ details: ["complete"], documents: ["complete"], submitted: sent, review: ["current"], decision: ["upcoming"] });
    case "rectification_requested":
      return build({
        details: ["complete"],
        documents: ["attention", t("{round} requested", { round: correctionRound(rect ? rect.round : app.round, t) })],
        submitted: ["complete", submittedOn],
        review: ["upcoming"],
        decision: ["upcoming"],
      });
    case "rectified":
      return build({
        details: ["complete"],
        documents: ["complete"],
        submitted: ["complete", resubmitted],
        review: ["current"],
        decision: ["upcoming"],
      });
    case "closed":
      return build({
        details: ["complete"],
        documents: ["complete"],
        submitted: ["complete", submittedOn],
        review: ["complete"],
        decision: ["complete", t("Closed")],
      });
    case "withdrawn":
      return build({
        details: ["complete"],
        documents: ["complete"],
        submitted: ["upcoming"],
        review: ["upcoming"],
        decision: ["complete", t("Withdrawn")],
      });
    default:
      return build({
        details: ["upcoming", t("Status: {status}", { status: humanize(app.status).toLowerCase() })],
        documents: ["upcoming"],
        submitted: ["upcoming"],
        review: ["upcoming"],
        decision: ["upcoming"],
      });
  }
}

/** One plain sentence per status for the applications list, which has no checklist detail. */
export function listNextStep(status: string, t: T = en): string {
  switch (status) {
    case "draft":
      return t("Upload the required documents, then submit.");
    case "submitted":
    case "validating":
      return t("Being checked. Nothing to do now.");
    case "under_review":
      return t("AICTE is reviewing it. Nothing to do now.");
    case "rectification_requested":
      return t("Correct the items AICTE asked about, then resubmit.");
    case "rectified":
      return t("Resubmitted. AICTE is reviewing the corrections.");
    case "closed":
      return t("Closed. No further action.");
    case "withdrawn":
      return t("Withdrawn. No further action.");
    default:
      return t("Open it to see where it stands.");
  }
}

const SOURCE_NAME: Record<string, string> = {
  APH: "the Approval Process Handbook",
  ADD26: "the 2026-27 addendum to the handbook",
};

/** "Checklist from the Approval Process Handbook, Annexure 2.1, page 97", or null without a source. */
export function checklistSourceText(src: unknown, t: T = en): string | null {
  if (!src || typeof src !== "object") return null;
  const s = src as { doc?: unknown; section?: unknown; page?: unknown };
  const known = s.doc ? SOURCE_NAME[String(s.doc)] : undefined;
  const doc = s.doc ? (known ? t(known) : String(s.doc)) : null;
  const parts = [doc, s.section ? String(s.section) : null, s.page ? t("page {n}", { n: String(s.page) }) : null].filter(Boolean);
  return parts.length ? t("Checklist from {source}", { source: parts.join(", ") }) : null;
}
