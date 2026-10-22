import type { BBox, DocumentDetail, Evidence, Finding } from "../../types";

export type LayerId = "fields" | "findings" | "qr" | "rows";

export interface OverlayBox {
  key: string;
  layer: LayerId;
  page: number;
  bbox: BBox;
  label: string;
  findingId?: string;
}

export const LAYERS: { id: LayerId; label: string; swatch: string; stroke: string; fill: string }[] = [
  { id: "fields", label: "Extracted fields", swatch: "bg-ov-field", stroke: "var(--ov-field)", fill: "var(--ov-field)" },
  { id: "findings", label: "Findings and forensic regions", swatch: "bg-ov-finding", stroke: "var(--ov-finding)", fill: "var(--ov-finding)" },
  { id: "qr", label: "QR codes", swatch: "bg-ov-qr", stroke: "var(--ov-qr)", fill: "var(--ov-qr)" },
  { id: "rows", label: "Table rows", swatch: "bg-ov-row", stroke: "var(--ov-row)", fill: "var(--ov-row)" },
];

function validBox(b: unknown): b is BBox {
  return Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && Number.isFinite(n));
}

function regionBoxes(evidence: Evidence[], docId: string, fallbackDocId: string | null, labelPrefix: string, findingId?: string) {
  const out: OverlayBox[] = [];
  for (const e of evidence) {
    if (e.kind === "region" || e.kind === "revision_diff") {
      const owner = ("document_id" in e && e.document_id) || fallbackDocId;
      if (owner !== docId || !validBox(e.bbox) || !e.page) continue;
      const label = e.kind === "region" ? (e.label ?? labelPrefix) : "changed in later revision";
      out.push({
        key: `${findingId ?? labelPrefix}-${e.page}-${e.bbox.join(",")}`,
        layer: "findings",
        page: e.page,
        bbox: e.bbox,
        label: `${labelPrefix}: ${label}`,
        findingId,
      });
    }
  }
  return out;
}

export function buildOverlays(doc: DocumentDetail, findings: Finding[]): OverlayBox[] {
  const boxes: OverlayBox[] = [];
  for (const f of doc.fields) {
    if (f.page && validBox(f.bbox)) {
      boxes.push({ key: `field-${f.id}`, layer: "fields", page: f.page, bbox: f.bbox, label: `${f.name}: ${f.value ?? f.raw ?? ""}` });
    }
  }
  for (const q of doc.qr ?? []) {
    if (validBox(q.bbox)) boxes.push({ key: `qr-${q.page}-${q.bbox.join(",")}`, layer: "qr", page: q.page, bbox: q.bbox, label: "QR code" });
  }
  (doc.rows ?? []).forEach((r, i) => {
    if (r._page && validBox(r._bbox)) {
      const name = typeof r.name === "string" ? r.name : `row ${i + 1}`;
      boxes.push({ key: `row-${i}`, layer: "rows", page: r._page, bbox: r._bbox, label: `Row: ${name}` });
    }
  });
  // Finding regions first so de-duplication keeps the box that links back to its finding
  for (const f of findings) {
    boxes.push(...regionBoxes(f.evidence ?? [], doc.id, f.document_id, f.title, f.id));
  }
  for (const s of doc.forensic_signals ?? []) {
    boxes.push(...regionBoxes(s.evidence ?? [], doc.id, doc.id, s.title));
  }
  const seen = new Set<string>();
  return boxes.filter((b) => {
    const k = `${b.layer}|${b.page}|${b.bbox.map((v) => v.toFixed(1)).join(",")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
