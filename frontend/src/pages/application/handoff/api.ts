import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, request } from "../../../api";

const enc = encodeURIComponent;

/** Ready: prepared and waiting to be forwarded. Forwarded: an official recorded the forwarding by hand. */
export type EcStatus = "ready" | "forwarded";

export interface EcForwarding {
  id: string;
  channel: "manual" | string;
  /** Always false while no connector to the AICTE portal is live: the official forwarded it, Pramana did not */
  sent_by_pramana: boolean;
  forwarded_on: string;
  reference: string;
  note: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

export interface EcReport {
  id: string;
  application_id: string;
  version: number;
  latest: boolean;
  superseded_by_version: number | null;
  status: EcStatus;
  status_label: string;
  round: number;
  outcome: { id: string; code: string; label: string; reason: string; round_label: string; recorded_at: string; recorded_by: { name: string } | null };
  prepared_at: string;
  report_sha256: string;
  pdf_sha256: string;
  pdf_size: number;
  pack: { pack_id: string; zip_sha256: string; manifest_sha256: string; size: number; public_key: string };
  summary: {
    findings: Record<"open" | "acknowledged" | "resolved" | "dismissed", number>;
    findings_total: number;
    provisions: number;
    documents: Record<string, number>;
    simulated_sources: boolean;
    correction_rounds: number;
    review_requests: number;
    review_requests_answered: number;
  };
  forwarding: EcForwarding | null;
  pdf_url: string;
  pack_url: string;
}

export interface EcChannel {
  name: string;
  label: string;
  available: boolean;
  sends: boolean;
}

export interface EcReports {
  application_id: string;
  latest: EcReport | null;
  versions: EcReport[];
  /** An outcome is recorded but its report could not be prepared; an officer can prepare it again */
  outcome_without_report: boolean;
  channels: EcChannel[];
}

export interface EcReadyItem {
  application_id: string;
  institution: string;
  report_id: string;
  version: number;
  outcome_label: string;
  prepared_at: string;
}

export interface EcQueue {
  ready: number;
  forwarded: number;
  items: EcReadyItem[];
}

export const ecKey = (appId: string) => ["application", appId, "ec-reports"] as const;

export const handoffApi = {
  reports: (appId: string) => request<EcReports>("GET", `/applications/${enc(appId)}/ec-reports`),
  prepare: (appId: string) => request<EcReports>("POST", `/applications/${enc(appId)}/ec-reports`, {}),
  recordForwarding: (reportId: string, body: { forwarded_on: string; reference: string; note: string | null }) =>
    request<EcReports>("POST", `/ec-reports/${enc(reportId)}/forwarding`, body),
};

export function useEcReports(appId: string, enabled = true) {
  return useQuery({ queryKey: ecKey(appId), queryFn: () => handoffApi.reports(appId), enabled: !!appId && enabled });
}

function useSettle(appId: string) {
  const qc = useQueryClient();
  return (data: EcReports) => {
    qc.setQueryData(ecKey(appId), data);
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: qk.audit });
  };
}

export function useRecordForwarding(appId: string) {
  const settle = useSettle(appId);
  return useMutation({
    mutationFn: ({ reportId, ...body }: { reportId: string; forwarded_on: string; reference: string; note: string | null }) =>
      handoffApi.recordForwarding(reportId, body),
    onSuccess: settle,
  });
}

export function usePrepareReport(appId: string) {
  const settle = useSettle(appId);
  return useMutation({ mutationFn: () => handoffApi.prepare(appId), onSuccess: settle });
}
