import { fmtDateTime } from "../../lib/format";
import type { PdfVerifyResult, SignatureResponse } from "../../types";

/** PDF date strings look like D:20250107190806+05'30'; returns an ISO string or null. */
export function pdfDateIso(v: string): string | null {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(v.trim());
  if (!m) return null;
  const tz = m[7] && m[7] !== "Z" ? `${m[7].slice(0, 3)}:${m[7].replace(/'/g, "").slice(3, 5) || "00"}` : "Z";
  return `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}${tz}`;
}

export function pdfDate(v: string): string | null {
  const iso = pdfDateIso(v);
  return iso ? fmtDateTime(iso) : null;
}

/** Human gap between two instants, e.g. "3 min 21 s". */
export function gap(fromIso: string, toIso: string): string | null {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} days`;
}

export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AnchorInfo {
  kind: "india" | "demo" | "other" | "none";
  label: string;
  subject: { key: string; value: string }[];
}

/** "India PKI (CCA): Common Name: CCA India 2022, Organization: India PKI, Country: IN" */
export function parseAnchor(r: SignatureResponse): AnchorInfo {
  const raw = typeof r.trust_anchor === "string" ? r.trust_anchor : "";
  if (!raw) return { kind: "none", label: "No configured trust anchor", subject: [] };
  const idx = raw.indexOf(": ");
  const head = idx > 0 ? raw.slice(0, idx) : raw;
  const rest = idx > 0 ? raw.slice(idx + 2) : "";
  const subject = rest
    .split(/,\s*(?=[A-Z][A-Za-z ]+:\s)/)
    .map((p) => {
      const j = p.indexOf(":");
      return j > 0 ? { key: p.slice(0, j).trim(), value: p.slice(j + 1).trim() } : null;
    })
    .filter((x): x is { key: string; value: string } => !!x && !!x.value);
  if (r.demo_anchor === true) return { kind: "demo", label: head, subject };
  if (raw.startsWith("India PKI") && r.demo_anchor === false) return { kind: "india", label: "India PKI (CCA)", subject };
  return { kind: "other", label: head, subject };
}

/** "AMIT KUMAR JAISWAL, GOVERNMENT OF INDIA PRESS, TECHNICAL OFFICER" into name and the rest. */
export function splitSigner(s: string | undefined): { name: string; org: string } {
  if (!s) return { name: "Unknown signer", org: "" };
  const i = s.indexOf(",");
  return i > 0 ? { name: s.slice(0, i).trim(), org: s.slice(i + 1).trim() } : { name: s, org: "" };
}

export function readable(code: string | undefined): string {
  if (!code) return "Unknown";
  const t = code.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The status that best describes the file: the strongest signature outcome, or not checked. */
export function overallStatus(r: PdfVerifyResult): string {
  const signed = r.signatures.filter((s) => s.response?.signer);
  if (!signed.length) return "not_checked";
  const order = ["mismatch_detected", "expired", "manual_review_required", "source_unavailable", "verification_pending", "verified"];
  for (const st of order) if (signed.some((s) => s.status === st)) return st;
  return signed[0].status;
}

export interface HistoryEntry {
  id: string;
  at: string;
  size: number;
  clientHash: string | null;
  result: PdfVerifyResult;
}

const KEY = "pramana-verify-history";

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryEntry[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items.slice(0, 12)));
  } catch {
    // session storage may be full or blocked; history then lives only in memory
  }
}
