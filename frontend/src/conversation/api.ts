import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, request } from "../api";

const enc = encodeURIComponent;

export type ItemStatus = "open" | "responded" | "resolved" | "still_open" | "review_requested";
export type MessageKind = "reply" | "question" | "review_request" | "cell_reply";

export interface Attachment {
  name: string;
  mime: string;
  size: number;
  sha256: string;
  url: string;
}

export interface MessageEntry {
  type: "message";
  id: string;
  side: "institution" | "cell";
  kind: MessageKind;
  body: string;
  created_at: string;
  attachment: Attachment | null;
  /** "AICTE Scrutiny Cell" for the cell, the user's name for the institution */
  author: string;
  /** Officials only: which colleague wrote for the cell */
  author_name?: string | null;
}

export interface StatusEntry {
  type: "status";
  id: string;
  side: "cell";
  from: ItemStatus;
  to: ItemStatus;
  note: string | null;
  created_at: string;
  author: string;
  author_name?: string | null;
}

export type ThreadEntry = MessageEntry | StatusEntry;

export interface Thread {
  id: string;
  item_no: number;
  general: boolean;
  title: string;
  status: ItemStatus;
  status_note: string | null;
  status_at: string | null;
  respond_by: string | null;
  days_left: number | null;
  past_due: boolean;
  /** The institution wrote last and the cell has not answered */
  awaiting_reply: boolean;
  /** A review request without a cell reply; it holds up the scrutiny outcome */
  pending_review: boolean;
  last_activity_at: string;
  entries: ThreadEntry[];
  /** Officials only */
  finding_ids?: string[];
}

export interface RoundSummary {
  rectification_id: string;
  round: number;
  label: string;
  status: string;
  created_at: string;
}

export interface RoundThreads {
  application_id: string;
  rounds: RoundSummary[];
  round: {
    rectification_id: string;
    round: number;
    label: string;
    status: string;
    latest: boolean;
    issued_at: string;
    responded_at: string | null;
    letter_id: string | null;
    respond_by: string | null;
    days_left: number | null;
    past_due: boolean;
  } | null;
  can_post: boolean;
  can_set_status: boolean;
  closed_reason: string | null;
  counts: { awaiting_reply: number; pending_reviews: number; pending_reviews_all_rounds: number | null };
  threads: Thread[];
}

export interface OutcomeView {
  outcome: string;
  label: string;
  reasons: string;
  recorded_at: string;
  round: number;
  round_label: string;
  what_next: string;
  recorded_by?: string | null;
}

export interface AwaitingItem {
  application_id: string;
  institution: string;
  thread_id: string;
  rectification_id: string;
  round_label: string;
  item_no: number;
  title: string;
  kind: MessageKind;
  pending_review: boolean;
  last_at: string;
}

export interface Notification {
  id: string;
  event: string;
  title: string;
  body: string;
  link: string;
  application_id: string | null;
  thread_id: string | null;
  created_at: string;
  read: boolean;
}

export const conversationApi = {
  threads: (appId: string, rectificationId?: string) =>
    request<RoundThreads>(
      "GET",
      `/applications/${enc(appId)}/rectification/threads${rectificationId ? `?rectification_id=${enc(rectificationId)}` : ""}`,
    ),
  post: (threadId: string, body: string, kind: MessageKind | null, file: File | null) => {
    const fd = new FormData();
    fd.append("body", body);
    if (kind) fd.append("kind", kind);
    if (file) fd.append("file", file, file.name);
    return request<RoundThreads & { message_id: string }>("POST", `/rectification-threads/${enc(threadId)}/messages`, fd);
  },
  setStatus: (threadId: string, status: "resolved" | "still_open", note: string) =>
    request<RoundThreads>("POST", `/rectification-threads/${enc(threadId)}/status`, { status, note }),
  outcome: (appId: string) => request<{ application_id: string; outcome: OutcomeView | null }>("GET", `/applications/${enc(appId)}/outcome`),
  awaiting: () => request<{ awaiting: number; pending_reviews: number; items: AwaitingItem[] }>("GET", "/rectification/awaiting"),
  notifications: () => request<{ unread: number; items: Notification[] }>("GET", "/notifications?limit=20"),
  markRead: (id: string) => request<Notification>("POST", `/notifications/${enc(id)}/read`, {}),
  markAllRead: () => request<{ marked: number }>("POST", "/notifications/read-all", {}),
};

export const ck = {
  threads: (appId: string, rectificationId?: string) => ["application", appId, "threads", rectificationId ?? "latest"] as const,
  outcome: (appId: string) => ["application", appId, "outcome"] as const,
  awaiting: ["rectification-awaiting"] as const,
  notifications: ["notifications"] as const,
};

export function useRoundThreads(appId: string, rectificationId?: string, enabled = true) {
  return useQuery({
    queryKey: ck.threads(appId, rectificationId),
    queryFn: () => conversationApi.threads(appId, rectificationId),
    enabled: !!appId && enabled,
  });
}

/** After a post or a status change: the round as returned, plus everything that counts or lists threads. */
function useRefresh(appId: string, rectificationId?: string) {
  const qc = useQueryClient();
  return (data: RoundThreads) => {
    qc.setQueryData(ck.threads(appId, rectificationId), data);
    void qc.invalidateQueries({ queryKey: ["application", appId, "threads"] });
    void qc.invalidateQueries({ queryKey: ck.awaiting });
    void qc.invalidateQueries({ queryKey: ck.notifications });
    void qc.invalidateQueries({ queryKey: qk.appAudit(appId) });
  };
}

export function usePostMessage(appId: string, rectificationId?: string) {
  const refresh = useRefresh(appId, rectificationId);
  return useMutation({
    mutationFn: (v: { threadId: string; body: string; kind: MessageKind | null; file: File | null }) =>
      conversationApi.post(v.threadId, v.body, v.kind, v.file),
    onSuccess: refresh,
  });
}

export function useSetStatus(appId: string, rectificationId?: string) {
  const refresh = useRefresh(appId, rectificationId);
  return useMutation({
    mutationFn: (v: { threadId: string; status: "resolved" | "still_open"; note: string }) => conversationApi.setStatus(v.threadId, v.status, v.note),
    onSuccess: refresh,
  });
}

export function useOutcomeView(appId: string, enabled = true) {
  return useQuery({ queryKey: ck.outcome(appId), queryFn: () => conversationApi.outcome(appId), enabled: !!appId && enabled });
}

export function useAwaiting(enabled = true) {
  return useQuery({ queryKey: ck.awaiting, queryFn: conversationApi.awaiting, enabled });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ck.notifications,
    queryFn: conversationApi.notifications,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationApi.markRead(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ck.notifications }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: conversationApi.markAllRead,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ck.notifications }),
  });
}
