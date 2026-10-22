import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qk } from "../../api";
import type { ReviewAction } from "../../types";

export function useApplication(appId: string) {
  return useQuery({ queryKey: qk.application(appId), queryFn: () => api.application(appId) });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: qk.run(runId ?? "none"),
    queryFn: () => api.run(runId!),
    enabled: !!runId,
    staleTime: 5 * 60_000,
  });
}

export function useFindings(appId: string, enabled = true) {
  return useQuery({ queryKey: qk.findings(appId), queryFn: () => api.findings(appId), enabled });
}

export function useVerifications(appId: string, enabled = true) {
  return useQuery({ queryKey: qk.verifications(appId), queryFn: () => api.verifications(appId), enabled });
}

export function useInvalidateApplication(appId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["application", appId] });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: qk.applications });
    void qc.invalidateQueries({ queryKey: qk.audit });
    void qc.invalidateQueries({ queryKey: ["document"] });
  };
}

export function useValidate(appId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateApplication(appId);
  return useMutation({
    mutationFn: () => api.validate(appId),
    onSuccess: (run) => {
      qc.setQueryData(qk.run(run.id), run);
      invalidate();
      void qc.invalidateQueries({ queryKey: qk.metrics });
    },
  });
}

export function useReplay(appId: string) {
  const invalidate = useInvalidateApplication(appId);
  return useMutation({
    mutationFn: (runId: string) => api.replay(runId),
    onSuccess: () => invalidate(),
  });
}

export function useReview(appId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateApplication(appId);
  return useMutation({
    mutationFn: ({ findingId, action, note }: { findingId: string; action: ReviewAction; note: string | null }) =>
      api.reviewFinding(findingId, action, note),
    onSuccess: (f) => {
      void qc.invalidateQueries({ queryKey: qk.history(f.id) });
      invalidate();
    },
  });
}

export function useManualVerification(appId: string) {
  const invalidate = useInvalidateApplication(appId);
  return useMutation({
    mutationFn: ({ attemptId, status, note }: { attemptId: string; status: string; note: string }) =>
      api.manualVerification(attemptId, status, note),
    onSuccess: () => invalidate(),
  });
}

export function useRectification(appId: string) {
  const invalidate = useInvalidateApplication(appId);
  return useMutation({
    mutationFn: ({ findingIds, message }: { findingIds: string[]; message: string | null }) =>
      api.requestRectification(appId, findingIds, message),
    onSuccess: () => invalidate(),
  });
}
