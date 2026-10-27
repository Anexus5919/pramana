import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import { api, qk } from "../../api";
import type { WorkspaceSection } from "../../shell/nav";
import type { BBox, DocumentDetail, Evidence, Finding, ReviewAction } from "../../types";

/** Section ids that appear in the URL path; Summary is the bare /applications/:id. */
const PATH_SECTIONS: readonly WorkspaceSection[] = ["findings", "documents", "comparisons", "rectification", "activity"];

export function isPathSection(s: string | undefined): s is WorkspaceSection {
  return !!s && (PATH_SECTIONS as readonly string[]).includes(s);
}

/** The one definition of an open finding: still waiting for an official's review. */
export const OPEN_REVIEW = new Set(["open", "acknowledged", "evidence_requested"]);

export function isOpenFinding(f: Pick<Finding, "review_status">): boolean {
  return OPEN_REVIEW.has(f.review_status);
}

/**
 * Finding categories that may go to an institution in a rectification request. Forensic,
 * cross-application (consistency) and issuer-verification findings stay with officials;
 * the server refuses them too.
 */
export const RECTIFIABLE_CATEGORIES = new Set(["completeness", "compliance", "validity"]);

export function isRectifiable(f: Pick<Finding, "category">): boolean {
  return RECTIFIABLE_CATEGORIES.has(f.category);
}

/**
 * One URL search parameter as state. Setting it replaces the history entry and keeps
 * every other parameter; null or "" removes it.
 */
export function useParam(name: string): [string | null, (v: string | null) => void] {
  const [sp, setSp] = useSearchParams();
  const set = useCallback(
    (v: string | null) =>
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (v === null || v === "") n.delete(name);
          else n.set(name, v);
          return n;
        },
        { replace: true },
      ),
    [setSp, name],
  );
  return [sp.get(name), set];
}

/** Patch several search parameters at once (null removes). Replaces the history entry unless push is set. */
export function useSetParams() {
  const [, setSp] = useSearchParams();
  return useCallback(
    (patch: Record<string, string | number | null | undefined>, opts?: { push?: boolean }) =>
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === "") n.delete(k);
            else n.set(k, String(v));
          }
          return n;
        },
        { replace: !opts?.push },
      ),
    [setSp],
  );
}

export function bboxParam(b: BBox | null | undefined): string | null {
  return b && b.length === 4 ? b.map((v) => Math.round(v * 100) / 100).join(",") : null;
}

export function parseBBox(s: string | null): BBox | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isFinite(n)) ? (parts as BBox) : null;
}

export function validBox(b: unknown): b is BBox {
  return Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && Number.isFinite(n));
}

export function useApplication(appId: string) {
  return useQuery({ queryKey: qk.application(appId), queryFn: () => api.application(appId), enabled: !!appId });
}

export function useRun(runId: string | null | undefined) {
  return useQuery({ queryKey: qk.run(runId ?? "none"), queryFn: () => api.run(runId!), enabled: !!runId, staleTime: 5 * 60_000 });
}

export function useFindings(appId: string, enabled = true) {
  return useQuery({ queryKey: qk.findings(appId), queryFn: () => api.findings(appId), enabled });
}

export function useVerifications(appId: string, enabled = true) {
  return useQuery({ queryKey: qk.verifications(appId), queryFn: () => api.verifications(appId), enabled });
}

export function useDocument(docId: string | null | undefined) {
  return useQuery({ queryKey: qk.document(docId ?? "none"), queryFn: () => api.document(docId!), enabled: !!docId, staleTime: 60_000 });
}

export function useInvalidateApp(appId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["application", appId] });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: qk.applications });
    void qc.invalidateQueries({ queryKey: qk.audit });
    void qc.invalidateQueries({ queryKey: ["document"] });
  }, [qc, appId]);
}

export function useReview(appId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateApp(appId);
  return useMutation({
    mutationFn: ({ findingId, action, note }: { findingId: string; action: ReviewAction; note: string | null }) =>
      api.reviewFinding(findingId, action, note),
    onSuccess: (f) => {
      // Patch the cached list so the status pill morphs before the refetch lands
      qc.setQueryData<Finding[]>(qk.findings(appId), (xs) => xs?.map((x) => (x.id === f.id ? { ...x, ...f } : x)));
      void qc.invalidateQueries({ queryKey: qk.history(f.id) });
      invalidate();
    },
  });
}

/**
 * After a confirmation or review: the application, its runs (each run's document_status is the effective one,
 * cached under ["run", id] for minutes), the document and the review queue all read the new status.
 */
function useInvalidateVerification(appId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateApp(appId);
  return useCallback(() => {
    invalidate();
    void qc.invalidateQueries({ queryKey: ["run"] });
  }, [qc, invalidate]);
}

export function useManualVerification(appId: string) {
  const invalidate = useInvalidateVerification(appId);
  return useMutation({
    mutationFn: ({ attemptId, status, note }: { attemptId: string; status: string; note: string }) =>
      api.manualVerification(attemptId, status, note),
    onSuccess: () => invalidate(),
  });
}

export function useOfficerReview(appId: string) {
  const invalidate = useInvalidateVerification(appId);
  return useMutation({
    mutationFn: ({ docId, note }: { docId: string; note: string }) => api.officerReview(docId, note),
    onSuccess: () => invalidate(),
  });
}

export function useRectification(appId: string) {
  const invalidate = useInvalidateApp(appId);
  return useMutation({
    mutationFn: ({ findingIds, message }: { findingIds: string[]; message: string | null }) =>
      api.requestRectification(appId, findingIds, message),
    onSuccess: () => invalidate(),
  });
}

/** Width of an element, tracked with a ResizeObserver. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  const [el, setEl] = useState<HTMLElement | null>(null);
  // The element can mount after the first render (after a loading state), so pick it up on every render
  useEffect(() => {
    if (ref.current !== el) setEl(ref.current);
  });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

/** Report of the model-assisted extraction step; the API may expose it on the document as `llm` or `analysis.llm`. */
export interface LlmReport {
  asked: string[];
  accepted: { field: string; value: string; alignment: number }[];
  rejected: { field: string; proposed: string; reason: string }[];
  errors?: string[];
  provider?: string | null;
  model?: string | null;
}

export function llmReportOf(doc: DocumentDetail): LlmReport | null {
  const d = doc as DocumentDetail & { llm?: LlmReport; analysis?: { llm?: LlmReport } };
  const r = d.llm ?? d.analysis?.llm ?? null;
  return r && Array.isArray(r.asked) ? r : null;
}

export function isLlmMethod(method: string | null | undefined): boolean {
  return !!method && method.startsWith("llm:");
}

/** Plain-English reading of an extraction method string. */
export function methodLabel(method: string | null | undefined): string {
  if (!method) return "Unknown method";
  if (isLlmMethod(method)) {
    const m = method.match(/grounded\((\d+)\)/);
    return `AI-extracted, grounded on the page${m ? ` (${m[1]}% alignment)` : ""}`;
  }
  const parts: Record<string, string> = {
    "text-layer": "PDF text layer",
    pattern: "pattern match",
    ocr: "OCR",
    table: "table parser",
    qr: "signed QR",
  };
  return method
    .split("+")
    .map((p) => parts[p] ?? p.replace(/[-_]/g, " "))
    .join(" + ");
}

export function evidenceDocId(e: Evidence, fallback: string | null): string | null {
  return ("document_id" in e && typeof e.document_id === "string" && e.document_id) || fallback;
}

export function docLabel(declaredType: string, label: (c: string) => string): string {
  return label(declaredType);
}
