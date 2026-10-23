/** Public scan-to-verify calls. No session and no CSRF token: these endpoints take no account. */

export type ScanStatus =
  | "verified"
  | "expired"
  | "not_yet_valid"
  | "bad_signature"
  | "unknown_key"
  | "unsupported"
  | "not_signed"
  | "no_qr";

export interface ScanField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  kind: "date" | "text";
}

export interface ScanValidity {
  from: string | null;
  until: string | null;
  state: "valid" | "expired" | "not_yet_valid" | "none";
  checked_on: string;
}

export interface ScanIssuer {
  kid: string | null;
  name: string | null;
  simulated: boolean | null;
}

export interface ScanTokenResult {
  status: Exclude<ScanStatus, "no_qr">;
  detail?: string;
  issuer?: ScanIssuer;
  fields?: ScanField[];
  signed?: boolean;
  validity?: ScanValidity;
  proves?: string[];
  does_not_prove?: string[];
  registry_available?: boolean;
  text_preview?: string;
  token: string | null;
}

export interface ScanResponse {
  status: ScanStatus;
  qr_found: number;
  results: ScanTokenResult[];
  image_sha256: string;
  checked_at: string;
  stored: boolean;
  detail: string | null;
}

export interface RegistryResponse {
  simulated: true;
  available: boolean;
  registry?: string;
  ref: string;
  found?: boolean;
  status?: string | null;
  detail?: string;
  compare?: { label: string; signed: string; registry: string; match: boolean }[];
}

export class ScanError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "ScanError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/public${path}`, { ...init, credentials: "omit", headers: { Accept: "application/json", ...init.headers } });
  } catch {
    throw new ScanError(0, "The Pramana service could not be reached. Check that this device is on the same network.");
  }
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : null;
    const retry = Number(res.headers.get("Retry-After")) || null;
    const msg =
      res.status === 429
        ? `Too many checks from this network. Try again in ${retry ?? 60} seconds.`
        : typeof detail === "string" && detail
          ? detail
          : `The check failed (${res.status}).`;
    throw new ScanError(res.status, msg, retry);
  }
  return data as T;
}

/** Downscale large photos on the device before upload: faster on Wi-Fi, and a QR needs far fewer pixels. */
export async function prepareImage(file: File, maxSide = 2400): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 4 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.92));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function scanImage(image: Blob, name: string): Promise<ScanResponse> {
  const fd = new FormData();
  fd.append("file", image, name.replace(/\.[^.]+$/, "") + (image.type === "image/png" ? ".png" : ".jpg"));
  return send<ScanResponse>("/scan", { method: "POST", body: fd });
}

export function registryLookup(token: string): Promise<RegistryResponse> {
  return send<RegistryResponse>("/scan/registry", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "Content-Type": "application/json" },
  });
}
