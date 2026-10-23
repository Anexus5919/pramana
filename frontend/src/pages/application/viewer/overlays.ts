import { humanize } from "../../../lib/labels";
import type { BBox, DocumentDetail, Evidence, Finding } from "../../../types";
import { validBox } from "../data";

export type LayerId = "fields" | "findings" | "qr" | "rows" | "instruction";

export const LAYERS: { id: LayerId; label: string; color: string; meaning: string }[] = [
  { id: "fields", label: "Fields", color: "var(--ov-field)", meaning: "Values extracted from the page" },
  { id: "findings", label: "Findings", color: "var(--ov-finding)", meaning: "Finding and forensic regions" },
  { id: "qr", label: "QR", color: "var(--ov-qr)", meaning: "Signed QR codes" },
  { id: "rows", label: "Rows", color: "var(--ov-row)", meaning: "Table rows such as the faculty list" },
  { id: "instruction", label: "Instructions", color: "var(--manual-dot)", meaning: "Text addressed to an automated reader" },
];

export const INSTRUCTION_CODE = "SEC-INSTRUCTION-TEXT";

export interface OverlayBox {
  key: string;
  layer: LayerId;
  page: number;
  bbox: BBox;
  title: string;
  value?: string | null;
  method?: string | null;
  findingId?: string;
}

function regionBoxes(evidence: Evidence[], docId: string, ownerDoc: string | null, title: string, finding?: Finding): OverlayBox[] {
  const out: OverlayBox[] = [];
  for (const e of evidence ?? []) {
    if (e.kind !== "region" && e.kind !== "revision_diff") continue;
    const owner = ("document_id" in e && e.document_id) || ownerDoc;
    if (owner !== docId || !validBox(e.bbox) || !e.page) continue;
    const layer: LayerId = finding?.code === INSTRUCTION_CODE ? "instruction" : "findings";
    const value =
      e.kind === "region"
        ? e.value !== undefined && e.value !== null
          ? String(e.value)
          : null
        : `added "${e.added_text}"${e.text_underneath ? ` over "${e.text_underneath}"` : ""}`;
    const sub = e.kind === "region" ? (e.label ? humanize(e.label.split(".").pop()) : null) : "Changed in a later revision";
    out.push({
      key: `${layer}-${finding?.id ?? title}-${e.page}-${e.bbox.join(",")}`,
      layer,
      page: e.page,
      bbox: e.bbox,
      title: sub ? `${title}: ${sub}` : title,
      value,
      findingId: finding?.id,
    });
  }
  return out;
}

/** Lines on the page that address an automated reader; the API returns them for officials. */
export interface InstructionLine {
  page: number;
  bbox: BBox;
  text: string;
}

export function instructionLinesOf(doc: DocumentDetail): InstructionLine[] {
  const raw = (doc as DocumentDetail & { instruction_lines?: unknown }).instruction_lines;
  return Array.isArray(raw) ? (raw as InstructionLine[]).filter((l) => l && typeof l.text === "string" && !!l.page && validBox(l.bbox)) : [];
}

export function buildOverlays(doc: DocumentDetail, findings: Finding[]): OverlayBox[] {
  const boxes: OverlayBox[] = [];
  instructionLinesOf(doc).forEach((l, i) => {
    boxes.push({ key: `instr-${i}`, layer: "instruction", page: l.page, bbox: l.bbox, title: "Text addressed to an automated reader", value: l.text });
  });
  for (const f of doc.fields ?? []) {
    if (f.page && validBox(f.bbox)) {
      boxes.push({ key: `field-${f.id}`, layer: "fields", page: f.page, bbox: f.bbox, title: humanize(f.name), value: f.value ?? f.raw, method: f.method });
    }
  }
  for (const q of doc.qr ?? []) {
    if (validBox(q.bbox)) boxes.push({ key: `qr-${q.page}-${q.bbox.join(",")}`, layer: "qr", page: q.page, bbox: q.bbox, title: "Signed QR code", value: `${q.length} characters decoded` });
  }
  (doc.rows ?? []).forEach((r, i) => {
    if (r._page && validBox(r._bbox)) {
      const name = typeof r.name === "string" ? r.name : `Row ${i + 1}`;
      const id = typeof r.faculty_id === "string" ? r.faculty_id : null;
      boxes.push({ key: `row-${i}`, layer: "rows", page: r._page, bbox: r._bbox, title: `Row ${i + 1}: ${name}`, value: id });
    }
  });
  for (const f of findings) boxes.push(...regionBoxes(f.evidence, doc.id, f.document_id, f.title, f));
  for (const s of doc.forensic_signals ?? []) boxes.push(...regionBoxes(s.evidence, doc.id, doc.id, s.title));
  for (const d of doc.forensic_facts?.revision_diffs ?? []) {
    if (validBox(d.bbox))
      boxes.push({
        key: `rev-${d.page}-${d.bbox.join(",")}`,
        layer: "findings",
        page: d.page,
        bbox: d.bbox,
        title: `Revision ${d.from_revision} to ${d.to_revision}`,
        value: `added "${d.added_text}"`,
      });
  }
  const seen = new Set<string>();
  return boxes.filter((b) => {
    const k = `${b.layer}|${b.page}|${b.bbox.map((v) => v.toFixed(0)).join(",")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
