import type { CampusPayload, CampusPhoto } from "../../../types";

export type PointKind = "record" | "declared" | "photo";

export interface MapPoint {
  id: string;
  kind: PointKind;
  lat: number;
  lon: number;
  label: string;
  /** Distance from the campus on record, km */
  km: number | null;
  photo?: CampusPhoto;
  outside?: boolean;
}

/** Points farther than this from the campus stay off the first view and are listed instead. */
export const NEAR_KM = 15;

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: [number, number], b: [number, number]): number {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: [number, number], b: [number, number]): string {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];
}

/** East and north offsets in km from an origin, good enough for a few hundred km. */
export function localKm(origin: [number, number], p: [number, number]): [number, number] {
  return [(p[1] - origin[1]) * 111.32 * Math.cos(rad((origin[0] + p[0]) / 2)), (p[0] - origin[0]) * 110.57];
}

export function fmtKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return "unknown distance";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** EXIF "2025:11:18 10:31:00" as "18 Nov 2025, 10:31"; anything else is shown as recorded. */
export function fmtExifTime(v: string | null | undefined): string | null {
  const m = v?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return v ?? null;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1];
  return mon ? `${Number(m[3])} ${mon} ${m[1]}, ${m[4]}:${m[5]}` : v ?? null;
}

/** ISO time with its own offset, e.g. "2 Dec 2025, 11:48 (UTC+05:30)", without converting time zones. */
export function fmtIsoLocal(v: string | null | undefined): string | null {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?/);
  if (!m) return v ?? null;
  const base = fmtExifTime(`${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}`);
  return m[6] ? `${base} (UTC${m[6] === "Z" ? "" : m[6]})` : base;
}

export function mapPoints(c: CampusPayload): MapPoint[] {
  const out: MapPoint[] = [];
  if (c.record) out.push({ id: "record", kind: "record", lat: c.record.lat, lon: c.record.lon, label: c.record.label, km: 0 });
  if (c.declared)
    out.push({
      id: "declared",
      kind: "declared",
      lat: c.declared.lat,
      lon: c.declared.lon,
      label: c.declared.label,
      km: c.declared.distance_km ?? null,
      outside: c.map_tolerance_km !== null && (c.declared.distance_km ?? 0) > c.map_tolerance_km,
    });
  for (const p of c.photos) {
    if (!p.exif.gps) continue;
    out.push({
      id: p.document_id,
      kind: "photo",
      lat: p.exif.gps[0],
      lon: p.exif.gps[1],
      label: p.filename,
      km: p.distance_km,
      photo: p,
      outside: p.geotag === "outside",
    });
  }
  return out;
}

export function distanceLabel(p: MapPoint): string {
  if (p.kind === "record") return "AICTE institution master (synthetic)";
  return `${fmtKm(p.km)} from campus on record`;
}
