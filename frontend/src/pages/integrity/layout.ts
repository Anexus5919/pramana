import type { GEdge, GFrame, GNode } from "./GraphCanvas";
import { ITEM_KINDS } from "./graphTheme";
import type { NetworkPayload } from "./types";

// Spacing in model units; the canvas fits the result, so these set proportions, not pixels
const COL = 190; // application to its shared-item column
const ROW = 76; // between stacked shared items
const CLUSTER_GAP = 96;
const QUIET_COL = 170;

export interface NetworkLayout {
  nodes: GNode[];
  edges: GEdge[];
  frames: GFrame[];
  width: number;
  height: number;
}

const kindRank = (k: string) => ITEM_KINDS.indexOf(k as (typeof ITEM_KINDS)[number]);

/** Orders a cluster's applications along a path when the links form one; otherwise null. */
function pathOrder(apps: string[], adj: Map<string, Set<string>>): string[] | null {
  if (apps.some((a) => (adj.get(a)?.size ?? 0) > 2)) return null;
  const ends = apps.filter((a) => (adj.get(a)?.size ?? 0) <= 1).sort();
  if (!ends.length) return null;
  const order = [ends[0]];
  const seen = new Set(order);
  while (order.length < apps.length) {
    const next = [...(adj.get(order[order.length - 1]) ?? [])].filter((x) => !seen.has(x)).sort()[0];
    if (!next) return null;
    order.push(next);
    seen.add(next);
  }
  return order;
}

/**
 * Deterministic layout of the whole cycle: each linked cluster in its own frame, applications on a line with the
 * items they share stacked between them (or on a ring when the links branch), and unlinked applications in a
 * quiet row underneath. The same data always gives the same picture.
 */
export function layoutNetwork(data: NetworkPayload, mode: "evidence" | "applications"): NetworkLayout {
  const appById = new Map(data.applications.map((a) => [a.id, a]));
  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const frames: GFrame[] = [];
  let y = 0;
  let maxW = 0;

  for (const [ci, c] of data.clusters.entries()) {
    const frameId = `frame:${c.id}`;
    frames.push({ id: frameId, label: `Cluster ${ci + 1}: ${c.applications.length} applications, ${c.items.length} shared ${c.items.length === 1 ? "item" : "items"}` });
    const adj = new Map<string, Set<string>>();
    for (const p of c.pairs) {
      if (!adj.has(p.a)) adj.set(p.a, new Set());
      if (!adj.has(p.b)) adj.set(p.b, new Set());
      adj.get(p.a)!.add(p.b);
      adj.get(p.b)!.add(p.a);
    }
    const pos = new Map<string, { x: number; y: number }>();
    const order = pathOrder(c.applications, adj);
    const items = c.items.map((id) => itemById.get(id)!).filter(Boolean);
    let height = 0;
    let width = 0;

    if (order) {
      // A line: application, column of shared items, application, ...
      const idx = new Map(order.map((a, i) => [a, i]));
      const between = new Map<number, typeof items>();
      const above: typeof items = [];
      for (const it of items) {
        const ids = it.applications.map((a) => idx.get(a) ?? -1).sort((a, b) => a - b);
        if (ids.length === 2 && ids[1] - ids[0] === 1) {
          if (!between.has(ids[0])) between.set(ids[0], []);
          between.get(ids[0])!.push(it);
        } else above.push(it);
      }
      order.forEach((a, i) => pos.set(a, { x: i * COL * 2, y: 0 }));
      for (const [i, list] of between) {
        list.sort((p, q) => kindRank(p.kind) - kindRank(q.kind) || p.label.localeCompare(q.label));
        list.forEach((it, j) => pos.set(it.id, { x: i * COL * 2 + COL, y: (j - (list.length - 1) / 2) * ROW }));
      }
      const tallest = Math.max(1, ...[...between.values()].map((l) => l.length));
      above.forEach((it, j) => {
        const xs = it.applications.map((a) => pos.get(a)?.x ?? 0);
        pos.set(it.id, { x: xs.reduce((s, v) => s + v, 0) / xs.length + (j - (above.length - 1) / 2) * 110, y: -((tallest - 1) / 2) * ROW - 120 });
      });
      width = (order.length - 1) * COL * 2;
      height = Math.max(tallest * ROW, 120) + (above.length ? 120 : 0);
    } else {
      // A ring: applications around, shared items between the applications that share them
      const apps = [...c.applications].sort();
      const r = Math.max(230, apps.length * 62);
      apps.forEach((a, i) => {
        const ang = -Math.PI / 2 + (i / apps.length) * Math.PI * 2;
        pos.set(a, { x: Math.cos(ang) * r, y: Math.sin(ang) * r });
      });
      const groups = new Map<string, typeof items>();
      for (const it of items) {
        const key = [...it.applications].sort().join("|");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(it);
      }
      for (const [key, list] of groups) {
        const ps = key.split("|").map((a) => pos.get(a)!);
        const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
        const cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
        // Spread along the normal of the first two applications' chord
        const dx = ps.length > 1 ? ps[1].x - ps[0].x : 1;
        const dy = ps.length > 1 ? ps[1].y - ps[0].y : 0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        list.sort((p, q) => kindRank(p.kind) - kindRank(q.kind) || p.label.localeCompare(q.label));
        list.forEach((it, j) => {
          const o = (j - (list.length - 1) / 2) * 64;
          pos.set(it.id, { x: cx * 0.82 + nx * o, y: cy * 0.82 + ny * o });
        });
      }
      width = r * 2;
      height = r * 2 + 60;
    }

    // Centre the cluster on the canvas column and stack it under the previous one
    const ys = [...pos.values()].map((p) => p.y);
    const top = Math.min(...ys);
    const dy = y - top + 20;
    const dx = -width / 2;
    for (const a of c.applications) {
      const p = pos.get(a)!;
      const app = appById.get(a)!;
      nodes.push({ id: a, kind: "application", label: `${app.short_name}\n${app.id}`, x: p.x + dx, y: p.y + dy, parent: frameId, title: app.institution });
    }
    if (mode === "evidence") {
      for (const it of items) {
        const p = pos.get(it.id)!;
        nodes.push({ id: it.id, kind: it.kind, label: it.label, x: p.x + dx, y: p.y + dy, parent: frameId, mono: it.kind === "faculty" || it.kind === "certificate" || it.kind === "file" });
      }
    }
    maxW = Math.max(maxW, width);
    y += Math.max(height, 160) + CLUSTER_GAP;
  }

  if (mode === "evidence") {
    for (const e of data.edges) {
      const a = nodes.find((n) => n.id === e.source);
      const b = nodes.find((n) => n.id === e.target);
      // Bend away from the line the applications sit on, so stacked edges fan out instead of overlapping
      const bend = a && b ? (a.x < b.x ? 1 : -1) * Math.sign(b.y - a.y || 0) * 14 : 0;
      // At rest only the leftmost link of an item carries its label; tracing a node shows them all
      const first = data.edges.filter((x) => x.target === e.target).map((x) => nodes.find((n) => n.id === x.source)?.x ?? 0);
      const restLabel = a && a.x <= Math.min(...first) ? e.relation : "";
      edges.push({ id: `${e.source}->${e.target}`, source: e.source, target: e.target, kind: e.kind, label: e.relation, restLabel, bend });
    }
  } else {
    for (const p of data.pairs) {
      const its = p.items.map((i) => itemById.get(i)!).filter(Boolean);
      const counts = new Map<string, number>();
      for (const it of its) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
      const label = [...counts].map(([k, n]) => `${n} ${k === "faculty" ? "faculty" : k === "certificate" ? "cert. no." : k === "details" ? "details" : k}`).join(", ");
      edges.push({ id: `${p.a}--${p.b}`, source: p.a, target: p.b, kind: "application", label, weight: its.length, bend: 0 });
    }
  }

  const quiet = data.applications.filter((a) => !a.cluster);
  if (quiet.length) {
    const frameId = "frame:unlinked";
    frames.push({ id: frameId, label: `No shared evidence found: ${quiet.length} ${quiet.length === 1 ? "application" : "applications"}` });
    const perRow = Math.max(3, Math.min(6, Math.ceil(Math.max(maxW, 600) / QUIET_COL)));
    quiet.forEach((a, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, quiet.length - row * perRow);
      const col = i % perRow;
      nodes.push({
        id: a.id,
        kind: "application",
        label: `${a.short_name}\n${a.id}`,
        x: (col - (inRow - 1) / 2) * QUIET_COL,
        y: y + 10 + row * 120,
        parent: frameId,
        quiet: true,
        title: a.institution,
      });
    });
    y += Math.ceil(quiet.length / perRow) * 120;
    maxW = Math.max(maxW, (Math.min(perRow, quiet.length) - 1) * QUIET_COL);
  }
  const ys = nodes.map((n) => n.y);
  const height = nodes.length ? Math.max(...ys) - Math.min(...ys) + 150 + frames.length * 40 : 300;
  return { nodes, edges, frames, width: maxW + 300, height };
}
