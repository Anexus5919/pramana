import type { CampusPayload } from "../../../types";
import { bearing, fmtKm, localKm, NEAR_KM, type MapPoint } from "./geo";

const W = 720;
const H = 420;
const CX = W / 2;
const CY = H / 2;
const EDGE = 36;

const fill: Record<string, string> = {
  record: "var(--brand-solid)",
  declared: "var(--ev-3)",
  within: "var(--verified-dot)",
  outside: "var(--mismatch-dot)",
};

/** Plain SVG plot of the same points and distances, used when map tiles cannot load (offline) or on request. */
export function CampusPlot({
  data,
  points,
  selected,
  onSelect,
}: {
  data: CampusPayload;
  points: MapPoint[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const rec = data.record;
  if (!rec) return null;
  const origin: [number, number] = [rec.lat, rec.lon];
  const near = points.filter((p) => (p.km ?? 0) <= NEAR_KM);
  const span = Math.max(data.threshold_km * 1.35, ...near.map((p) => (p.km ?? 0) * 1.2));
  const scale = (Math.min(W, H) / 2 - EDGE) / span;
  const place = (p: MapPoint) => {
    const [e, n] = localKm(origin, [p.lat, p.lon]);
    let x = CX + e * scale;
    let y = CY - n * scale;
    const far = (p.km ?? 0) > NEAR_KM || x < EDGE || x > W - EDGE || y < EDGE || y > H - EDGE;
    if (far) {
      // Clamp to the frame along the true direction and say how far it really is
      const k = Math.min((W / 2 - EDGE) / Math.max(Math.abs(x - CX), 1e-6), (H / 2 - EDGE) / Math.max(Math.abs(y - CY), 1e-6));
      x = CX + (x - CX) * k;
      y = CY + (y - CY) * k;
    }
    return { x, y, far };
  };
  const ringR = data.threshold_km * scale;
  const tolR = (data.map_tolerance_km ?? 0) * scale;
  const barKm = span > 6 ? 5 : span > 2.5 ? 1 : 0.5;

  return (
    <figure className="overflow-hidden rounded-control border border-line bg-surface-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby="campus-plot-title campus-plot-desc">
        <title id="campus-plot-title">Campus plot without map tiles</title>
        <desc id="campus-plot-desc">
          {points.map((p) => `${p.label}: ${p.kind === "record" ? "campus on record" : `${fmtKm(p.km)} from campus on record`}`).join(". ")}
        </desc>
        <defs>
          <pattern id="campus-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="var(--line)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#campus-grid)" />
        <circle cx={CX} cy={CY} r={ringR} style={{ fill: "var(--brand-400)", fillOpacity: 0.07, stroke: "var(--brand-500)" }} strokeWidth="1.5" strokeDasharray="6 5" />
        <text x={CX + ringR * 0.72 + 4} y={CY + ringR * 0.72 + 14} textAnchor="start" fontSize="13" fontWeight="500" style={{ fill: "var(--brand-ink)" }}>
          {data.threshold_km} km geotag threshold
        </text>
        {data.declared && tolR > 4 && (
          <circle cx={CX} cy={CY} r={tolR} style={{ fill: "none", stroke: "var(--manual-dot)" }} strokeWidth="1.2" strokeDasharray="3 4" />
        )}
        {points
          .filter((p) => p.kind !== "record")
          .map((p) => {
            const { x, y, far } = place(p);
            return (
              <g key={`l-${p.id}`}>
                <line
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  style={{ stroke: p.outside ? "var(--mismatch-dot)" : "var(--ink-3)" }}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text x={(CX + x) / 2} y={(CY + y) / 2 - 6} textAnchor="middle" fontSize="13" fontWeight="500" style={{ fill: "var(--ink-2)", paintOrder: "stroke", stroke: "var(--surface-2)", strokeWidth: 4 }}>
                  {fmtKm(p.km)}
                  {far ? ` ${bearing(origin, [p.lat, p.lon])}` : ""}
                </text>
              </g>
            );
          })}
        {points.map((p) => {
          const { x, y } = p.kind === "record" ? { x: CX, y: CY } : place(p);
          const color = p.kind === "photo" ? (p.outside ? fill.outside : fill.within) : p.kind === "declared" && p.outside ? "var(--manual-dot)" : fill[p.kind];
          const on = selected === p.id;
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`${p.label}, ${p.kind === "record" ? "campus on record" : `${fmtKm(p.km)} from campus on record`}`}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(p.id))}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:opacity-100"
            >
              <circle cx={x} cy={y} r={on ? 16 : 13} style={{ fill: "none", stroke: "var(--brand-500)" }} strokeWidth="2" opacity={on ? 1 : 0} />
              {p.kind === "photo" ? (
                <circle cx={x} cy={y} r="7" style={{ fill: color, stroke: "var(--surface)" }} strokeWidth="2" />
              ) : (
                <rect x={x - 7} y={y - 7} width="14" height="14" rx="2" transform={p.kind === "declared" ? `rotate(45 ${x} ${y})` : undefined} style={{ fill: color, stroke: "var(--surface)" }} strokeWidth="2" />
              )}
              <text x={x} y={y + 22} textAnchor="middle" fontSize="13" style={{ fill: "var(--ink)", paintOrder: "stroke", stroke: "var(--surface-2)", strokeWidth: 4 }}>
                {p.kind === "photo" ? p.label : p.kind === "record" ? "Campus on record" : "Declared map point"}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${EDGE}, ${H - EDGE})`}>
          <line x1="0" y1="0" x2={barKm * scale} y2="0" style={{ stroke: "var(--ink-2)" }} strokeWidth="2" />
          <text x={(barKm * scale) / 2} y="-6" textAnchor="middle" fontSize="13" style={{ fill: "var(--ink-2)" }}>
            {fmtKm(barKm)}
          </text>
        </g>
      </svg>
      <figcaption className="border-t border-line bg-surface px-3 py-2 text-xs text-ink-3">
        Plain plot, north up, straight-line distances. Points beyond the frame sit on its edge with their true distance and direction.
      </figcaption>
    </figure>
  );
}
