import { useEffect, useState } from "react";
import type { ItemKind } from "./types";

export type NodeKind = "application" | ItemKind;

// Glyph paths from lucide (ISC), drawn into the node as an SVG background image
const GLYPH: Record<NodeKind, string> = {
  application:
    '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  faculty: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  certificate: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  file: '<path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/>',
  photo: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  seal: '<path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/><path d="M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z"/><path d="M5 22h14"/>',
  details: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
};

export function glyphUri(kind: NodeKind, stroke: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[kind]}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Categorical slots in a fixed order, each stepped for its theme (validated for colour-vision deficiency)
const KIND_HEX: Record<ItemKind, { light: string; dark: string }> = {
  faculty: { light: "#2a78d6", dark: "#3987e5" },
  certificate: { light: "#eb6834", dark: "#d95926" },
  photo: { light: "#1baf7a", dark: "#199e70" },
  seal: { light: "#6250d6", dark: "#9085e9" },
  details: { light: "#eda100", dark: "#c98500" },
  file: { light: "#e87ba4", dark: "#d55181" },
};

export const ITEM_KINDS: ItemKind[] = ["faculty", "certificate", "file", "photo", "seal", "details"];

export const KIND_META: Record<NodeKind, { label: string; plural: string; line: "solid" | "dashed" | "dotted"; meaning: string }> = {
  application: { label: "Application", plural: "Applications", line: "solid", meaning: "An application in this academic year." },
  faculty: { label: "Faculty ID", plural: "Faculty IDs", line: "solid", meaning: "The same faculty ID on two faculty lists." },
  certificate: { label: "Certificate number", plural: "Certificate numbers", line: "solid", meaning: "The same issuer reference number on two certificates." },
  file: { label: "Identical file", plural: "Identical files", line: "solid", meaning: "Byte-identical files (same SHA-256)." },
  photo: { label: "Photo", plural: "Photos", line: "dashed", meaning: "Visually near-identical photos (perceptual hash)." },
  seal: { label: "Seal image", plural: "Seal images", line: "dashed", meaning: "The same seal image under different issuers." },
  details: { label: "Certificate details", plural: "Certificate details", line: "dotted", meaning: "Most extracted values identical in two documents." },
};

export interface GraphTheme {
  dark: boolean;
  surface: string;
  canvas: string;
  surface2: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  line: string;
  line2: string;
  brand: string;
  focus: string;
  sans: string;
  mono: string;
  kind: Record<ItemKind, string>;
}

export function readTheme(): GraphTheme {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const dark = root.classList.contains("dark");
  const kind = Object.fromEntries(ITEM_KINDS.map((k) => [k, dark ? KIND_HEX[k].dark : KIND_HEX[k].light])) as Record<ItemKind, string>;
  return {
    dark,
    surface: v("--surface", dark ? "#18181c" : "#ffffff"),
    canvas: v("--canvas", dark ? "#111114" : "#f7f7f8"),
    surface2: v("--surface-2", dark ? "#1f1f24" : "#f3f3f5"),
    ink: v("--ink", dark ? "#f2f2f4" : "#17171c"),
    ink2: v("--ink-2", dark ? "#d0d0d6" : "#3d3d47"),
    ink3: v("--ink-3", dark ? "#a3a3ad" : "#5c5c68"),
    ink4: v("--ink-4", dark ? "#8a8a94" : "#73737f"),
    line: v("--line", dark ? "#2a2a31" : "#e6e6ea"),
    line2: v("--line-2", dark ? "#3a3a42" : "#d5d5dc"),
    brand: v("--brand-solid", dark ? "#6f45e6" : "#6a35dc"),
    focus: v("--brand-500", dark ? "#a68bff" : "#7c4dea"),
    sans: v("--ff-sans", "IBM Plex Sans Variable, sans-serif"),
    mono: v("--ff-mono", "IBM Plex Mono, monospace"),
    kind,
  };
}

export function kindColor(kind: NodeKind, t: GraphTheme): string {
  return kind === "application" ? t.ink3 : t.kind[kind];
}

/** Maps the per-application graph's entity kinds onto the shared item kinds. */
export function itemKindOf(graphKind: string): ItemKind | null {
  switch (graphKind) {
    case "faculty":
      return "faculty";
    case "ref":
      return "certificate";
    case "sha256":
      return "file";
    case "phash":
      return "photo";
    case "seal":
      return "seal";
    case "fields":
    case "minhash":
      return "details";
    default:
      return null;
  }
}

export const RELATION: Record<ItemKind, string> = {
  faculty: "lists faculty",
  certificate: "carries cert. no.",
  file: "submitted file",
  photo: "same photo",
  seal: "same seal",
  details: "same details",
};

export function useGraphTheme(): GraphTheme {
  const [theme, setTheme] = useState<GraphTheme>(() => readTheme());
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-surface"] });
    // Tokens can settle after the shell sets data-surface on mount
    const t = window.setTimeout(() => setTheme(readTheme()), 50);
    return () => {
      obs.disconnect();
      window.clearTimeout(t);
    };
  }, []);
  return theme;
}

const NAME_STOP = new Set(["institute", "college", "school", "technical", "polytechnic", "university", "campus", "academy"]);

/** "Panchganga Institute of Technology" to "Panchganga"; the same rule as the backend's short_name. */
export function shortName(name: string): string {
  const words = name.split(/\s+/);
  const i = words.findIndex((w, j) => j > 0 && NAME_STOP.has(w.toLowerCase()));
  return i > 0 ? words.slice(0, i).join(" ") : name;
}
