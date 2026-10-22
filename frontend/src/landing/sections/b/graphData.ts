import { forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { palette } from "../../palette";

export type InstId = "kvc" | "pit" | "sse";
export type EntityKind = "faculty" | "noc" | "photo";
export type Tone = "mismatch" | "manual";

export const INSTITUTIONS: { id: InstId; name: string; short: string; city: string; app: string }[] = [
  { id: "kvc", name: "Krishna Valley College", short: "Krishna Valley", city: "Karad", app: "APP-2025-0193" },
  { id: "pit", name: "Panchganga Institute of Technology", short: "Panchganga IT", city: "Kolhapur", app: "APP-2025-0217" },
  { id: "sse", name: "Sahyadri School of Engineering", short: "Sahyadri SoE", city: "Satara", app: "APP-2025-0244" },
];

export type Entity = {
  id: string;
  kind: EntityKind;
  label: string;
  short: string;
  detail: string;
  links: InstId[];
  finding: string;
  ev: number;
  evName: string;
  tone: Tone;
  simulated?: boolean;
};

export const ENTITIES: Entity[] = [
  {
    id: "f1",
    kind: "faculty",
    label: "FAC-MH-1907-4417",
    short: "FAC 4417",
    detail: "Dr. R. Deshmukh, Associate Professor, Mechanical",
    links: ["kvc", "pit", "sse"],
    finding: "Declared full-time at all three institutions for 2025-26. One person cannot hold three full-time posts in the same cycle.",
    ev: 3,
    evName: "record",
    tone: "mismatch",
  },
  {
    id: "f2",
    kind: "faculty",
    label: "FAC-MH-2011-0932",
    short: "FAC 0932",
    detail: "Prof. S. Patil, Assistant Professor, Civil",
    links: ["kvc", "pit"],
    finding: "Listed full-time at Krishna Valley and Panchganga, with overlapping joining dates in both appointment letters.",
    ev: 3,
    evName: "record",
    tone: "mismatch",
  },
  {
    id: "f3",
    kind: "faculty",
    label: "FAC-MH-2016-7781",
    short: "FAC 7781",
    detail: "Dr. M. Jadhav, Professor, Electronics",
    links: ["pit", "sse"],
    finding: "Same PAN and date of birth appear under this ID at Panchganga and under a different ID at Sahyadri. Needs manual review.",
    ev: 3,
    evName: "record",
    tone: "manual",
  },
  {
    id: "noc",
    kind: "noc",
    label: "RFO/KRD/NOC/2024/0417",
    short: "NOC 0417",
    detail: "Fire safety certificate number",
    links: ["kvc", "sse"],
    finding: "The same fire NOC number is cited for two different buildings. The issuer register lists it for Krishna Valley College only.",
    ev: 2,
    evName: "issuer",
    tone: "mismatch",
    simulated: true,
  },
  {
    id: "photo",
    kind: "photo",
    label: "CNC lab photo",
    short: "IMG 9f3a",
    detail: "Workshop photograph, perceptual hash 9f3a c41e 07b2 d58a",
    links: ["pit", "sse"],
    finding: "Sahyadri's CNC lab photo matches Panchganga's at perceptual hash distance 3 of 64. The capture dates in the two files differ by 14 months.",
    ev: 6,
    evName: "heuristic",
    tone: "manual",
  },
];

export const KIND_LABEL: Record<EntityKind, string> = { faculty: "Faculty ID", noc: "Fire NOC", photo: "Lab photo" };

export const KIND_COLOR: Record<EntityKind, { top: string; left: string; right: string }> = {
  faculty: { top: palette.brand[300], left: palette.brand[500], right: palette.brand[700] },
  noc: { top: "#ffb27a", left: palette.status.expired.dot, right: palette.status.expired.fg },
  photo: { top: "#a9bcf5", left: palette.status.pending.dot, right: palette.status.pending.fg },
};

export type Pt = { x: number; y: number };
export type Layout = {
  w: number;
  h: number;
  card: { w: number; h: number };
  inst: Record<InstId, Pt>;
  merged: Record<string, Pt>;
  alone: Record<string, Pt>; // key `${entityId}:${instId}`
};

type N = SimulationNodeDatum & { id: string };

// d3-force settles the shared entities between the institutions that cite them; run synchronously for a stable picture
function build(w: number, h: number, inst: Record<InstId, Pt>, card: { w: number; h: number }, fan: number, lift: number): Layout {
  const nodes: N[] = [
    ...INSTITUTIONS.map((i) => ({ id: i.id, x: inst[i.id].x, y: inst[i.id].y, fx: inst[i.id].x, fy: inst[i.id].y })),
    ...ENTITIES.map((e) => {
      const cx = e.links.reduce((s, l) => s + inst[l].x, 0) / e.links.length;
      const cy = e.links.reduce((s, l) => s + inst[l].y, 0) / e.links.length;
      return { id: e.id, x: cx, y: cy };
    }),
  ];
  const links = ENTITIES.flatMap((e) => e.links.map((l) => ({ source: e.id, target: l })));
  const sim = forceSimulation<N>(nodes)
    .force("link", forceLink<N, { source: string; target: string }>(links).id((d) => d.id).distance(w > 600 ? 210 : 150).strength(0.5))
    .force("charge", forceManyBody<N>().strength(w > 600 ? -900 : -420))
    .force("collide", forceCollide<N>(w > 600 ? 70 : 46))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
  const merged: Record<string, Pt> = {};
  for (const n of nodes) {
    if (INSTITUTIONS.some((i) => i.id === n.id)) continue;
    merged[n.id] = { x: Math.max(60, Math.min(w - 60, n.x ?? 0)), y: Math.max(60, Math.min(h - 60, n.y ?? 0)) };
  }
  const alone: Record<string, Pt> = {};
  const cy = (inst.kvc.y + inst.pit.y + inst.sse.y) / 3;
  for (const i of INSTITUTIONS) {
    const own = ENTITIES.filter((e) => e.links.includes(i.id));
    own.forEach((e, k) => {
      const dir = inst[i.id].y < cy ? -1 : 1;
      alone[`${e.id}:${i.id}`] = { x: inst[i.id].x + (k - (own.length - 1) / 2) * fan, y: inst[i.id].y + dir * lift };
    });
  }
  return { w, h, card, inst, merged, alone };
}

export const DESKTOP = build(
  960,
  590,
  { kvc: { x: 205, y: 170 }, pit: { x: 755, y: 170 }, sse: { x: 480, y: 440 } },
  { w: 290, h: 70 },
  76,
  102,
);

export const MOBILE = build(
  400,
  660,
  { kvc: { x: 104, y: 150 }, pit: { x: 296, y: 150 }, sse: { x: 200, y: 520 } },
  { w: 180, h: 62 },
  44,
  92,
);
