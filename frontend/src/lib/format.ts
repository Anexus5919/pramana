const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function parse(v: string | null | undefined): Date | null {
  if (!v) return null;
  // Backend timestamps may be naive UTC; treat them as UTC
  const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : `${v}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(v: string | null | undefined): string {
  const d = parse(v);
  return d ? dateFmt.format(d) : "Not set";
}

export function fmtDateTime(v: string | null | undefined): string {
  const d = parse(v);
  return d ? dateTimeFmt.format(d) : "Not set";
}

export function fmtRelative(v: string | null | undefined): string {
  const d = parse(v);
  if (!d) return "";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return `${days} d ago`;
}

export function shortHash(h: string | null | undefined, n = 10): string {
  if (!h) return "none";
  return h.length > n ? h.slice(0, n) : h;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "Not available";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-IN") : String(v);
  if (Array.isArray(v)) return v.map((x) => fmtValue(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function fmtConfidence(c: number | null | undefined): string {
  if (c === null || c === undefined) return "n/a";
  return `${Math.round(c * 100)}%`;
}

export function pluralize(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

export function sum(values: Iterable<number>): number {
  let t = 0;
  for (const v of values) t += v;
  return t;
}
