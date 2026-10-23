import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { api, qk } from "../../api";
import type { BBox, DocumentDetail, Evidence, Finding, ReviewAction } from "../../types";

export const TABS = ["overview", "documents", "findings", "checklist", "verification", "relationships", "runs", "audit"] as const;
export type WorkspaceTab = (typeof TABS)[number];

export function isTab(s: string | undefined): s is WorkspaceTab {
  return !!s && (TABS as readonly string[]).includes(s);
}

export function appPath(appId: string, tab?: WorkspaceTab, params?: Record<string, string | number | null | undefined>): string {
  const base = `/applications/${encodeURIComponent(appId)}${tab && tab !== "overview" ? `/${tab}` : ""}`;
  if (!params) return base;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
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

export function useManualVerification(appId: string) {
  const invalidate = useInvalidateApp(appId);
  return useMutation({
    mutationFn: ({ attemptId, status, note }: { attemptId: string; status: string; note: string }) =>
      api.manualVerification(attemptId, status, note),
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
  external?: boolean | null;
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
