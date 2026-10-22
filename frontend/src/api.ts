import type {
  ActiveRuleset,
  Application,
  ApplicationDetail,
  AuditEvent,
  ChainVerification,
  Checkpoint,
  Dashboard,
  Declared,
  DemoAccounts,
  DocumentDetail,
  DocumentSummary,
  Finding,
  Institution,
  NewApplicationBody,
  PdfVerifyResult,
  RectificationItem,
  ReplayResult,
  ReviewAction,
  ReviewEntry,
  RuleImpact,
  RunBrief,
  RunFull,
  RunMetrics,
  SessionInfo,
  SimIssuer,
  SimLookup,
  VerificationAttempt,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function describeDetail(detail: unknown, status: number, statusText: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    // FastAPI request validation errors: [{loc, msg, type}]
    const parts = detail.map((d) => {
      if (d && typeof d === "object") {
        const loc = Array.isArray((d as { loc?: unknown[] }).loc)
          ? (d as { loc: unknown[] }).loc.filter((x) => x !== "body").join(".")
          : "";
        const msg = String((d as { msg?: unknown }).msg ?? "invalid value");
        return loc ? `${loc}: ${msg}` : msg;
      }
      return String(d);
    });
    if (parts.length) return parts.join("; ");
  }
  if (status === 0) return "The server could not be reached. Is the backend running on port 8000?";
  return `${status} ${statusText || "Request failed"}`;
}

type Body = FormData | object | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (method !== "GET" && csrfToken) headers["x-csrf-token"] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "include" });
  } catch {
    throw new ApiError(0, describeDetail(undefined, 0, ""), undefined);
  }
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : data;
    throw new ApiError(res.status, describeDetail(detail, res.status, res.statusText), detail);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {});
const patch = <T>(path: string, body: Body) => request<T>("PATCH", path, body);

const enc = encodeURIComponent;

export const api = {
  // Auth
  login: (username: string, password: string) => post<SessionInfo>("/auth/login", { username, password }),
  logout: () => post<{ ok: boolean }>("/auth/logout"),
  me: () => get<SessionInfo>("/auth/me"),
  demoAccounts: () => get<DemoAccounts>("/auth/demo-accounts"),

  // Official workspace
  dashboard: () => get<Dashboard>("/dashboard"),
  runMetrics: () => get<RunMetrics>("/metrics/runs"),

  // Applications
  applications: () => get<Application[]>("/applications"),
  createApplication: (body: NewApplicationBody) => post<Application>("/applications", body),
  application: (id: string) => get<ApplicationDetail>(`/applications/${enc(id)}`),
  updateDeclared: (id: string, declared: Declared) =>
    patch<Application>(`/applications/${enc(id)}/declared`, { declared }),
  uploadDocument: (id: string, declaredType: string, file: File) => {
    const fd = new FormData();
    fd.append("declared_type", declaredType);
    fd.append("file", file, file.name);
    return post<DocumentSummary>(`/applications/${enc(id)}/documents`, fd);
  },
  submit: (id: string) => post<{ application: Application; run: RunBrief | null }>(`/applications/${enc(id)}/submit`),
  validate: (id: string) => post<RunFull>(`/applications/${enc(id)}/validate`),
  runs: (id: string) => get<RunBrief[]>(`/applications/${enc(id)}/runs`),
  run: (runId: string) => get<RunFull>(`/runs/${enc(runId)}`),
  replay: (runId: string) => post<ReplayResult>(`/runs/${enc(runId)}/replay`),
  findings: (id: string, runId?: string) =>
    get<Finding[]>(`/applications/${enc(id)}/findings${runId ? `?run_id=${enc(runId)}` : ""}`),
  verifications: (id: string) => get<VerificationAttempt[]>(`/applications/${enc(id)}/verifications`),
  applicationAudit: (id: string) => get<AuditEvent[]>(`/applications/${enc(id)}/audit`),
  requestRectification: (id: string, findingIds: string[], message: string | null) =>
    post<{ id: string; round: number; items: RectificationItem[] }>(`/applications/${enc(id)}/rectification`, {
      finding_ids: findingIds,
      message,
    }),
  institution: (id: string) => get<Institution>(`/institutions/${enc(id)}`),

  // Documents
  document: (docId: string) => get<DocumentDetail>(`/documents/${enc(docId)}`),
  pageImageUrl: (docId: string, page: number) => `/api/documents/${enc(docId)}/pages/${page}.png`,
  fileUrl: (docId: string) => `/api/documents/${enc(docId)}/file`,

  // Findings and verification
  reviewFinding: (findingId: string, action: ReviewAction, note: string | null) =>
    post<Finding>(`/findings/${enc(findingId)}/review`, { action, note }),
  findingHistory: (findingId: string) => get<ReviewEntry[]>(`/findings/${enc(findingId)}/history`),
  manualVerification: (attemptId: string, status: string, note: string) =>
    post<VerificationAttempt>(`/verifications/${enc(attemptId)}/manual`, { status, note }),

  // Rules
  activeRuleset: () => get<ActiveRuleset>("/rulesets/active"),
  ruleImpact: () => get<RuleImpact>("/rulesets/impact"),

  // Audit
  audit: (limit = 200) => get<AuditEvent[]>(`/audit?limit=${limit}`),
  verifyAudit: () => get<ChainVerification>("/audit/verify"),
  checkpoint: () => post<Checkpoint>("/audit/checkpoint"),

  // Tools
  verifyPdf: (file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return post<PdfVerifyResult>("/tools/verify-pdf", fd);
  },

  // Simulated issuers
  simIssuers: () => get<SimIssuer[]>("/sim/issuers"),
  setIssuerAvailability: (code: string, available: boolean) =>
    post<SimIssuer>(`/sim/issuers/${enc(code)}/availability`, { available }),
  simLookup: (code: string, ref: string) => get<SimLookup>(`/sim/issuers/${enc(code)}/lookup?ref=${enc(ref)}`),
};

export const qk = {
  me: ["me"] as const,
  demo: ["demo-accounts"] as const,
  dashboard: ["dashboard"] as const,
  metrics: ["metrics"] as const,
  applications: ["applications"] as const,
  application: (id: string) => ["application", id] as const,
  runs: (id: string) => ["application", id, "runs"] as const,
  findings: (id: string, runId?: string) => ["application", id, "findings", runId ?? "latest"] as const,
  verifications: (id: string) => ["application", id, "verifications"] as const,
  appAudit: (id: string) => ["application", id, "audit"] as const,
  run: (runId: string) => ["run", runId] as const,
  document: (docId: string) => ["document", docId] as const,
  history: (findingId: string) => ["finding-history", findingId] as const,
  ruleset: ["ruleset"] as const,
  impact: ["rule-impact"] as const,
  audit: ["audit"] as const,
  issuers: ["sim-issuers"] as const,
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
