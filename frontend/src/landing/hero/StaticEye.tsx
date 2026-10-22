import { useId } from "react";
import { palette } from "../palette";
import { type EyeLayout, lidEdge } from "./eyeState";

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Flat SVG voxel eye: used when WebGL is unavailable, so the hero is never empty
export default function StaticEye({ layout }: { layout: EyeLayout }) {
  const id = useId().replace(/:/g, "");
  const { width: W, height: H } = layout;
  const cx = W / 2;
  const cy = H / 2;
  const c = layout.compact ? 44 : 40;
  const cols = Math.ceil(W / c / 2) + 1;
  const rows = Math.ceil(H / c / 2) + 1;
  const blocks: { x: number; y: number; d: number; k: number }[] = [];
  for (let i = -cols; i <= cols; i++) {
    for (let j = -rows; j <= rows; j++) {
      const x = i * c;
      const y = j * c;
      const e = lidEdge(layout, x);
      const up = -y;
      const gap = e.top - e.bottom;
      let d = up > e.top ? up - e.top : up < e.bottom ? e.bottom - up : -1;
      if (gap < c * 0.9) d = Math.max(d, c);
      if (d < 0) continue;
      blocks.push({ x: cx + x, y: cy + y, d, k: hash(i * 31 + j * 7) });
    }
  }
  const spokes = layout.compact ? 60 : 96;
  const rp = layout.pupilR;
  const ri = layout.irisR;
  const wedges = Array.from({ length: spokes }, (_, i) => {
    const a0 = (i / spokes) * Math.PI * 2;
    const a1 = ((i + 0.86) / spokes) * Math.PI * 2;
    const p = (r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    return { d: `M${p(rp, a0)} L${p(ri, a0)} L${p(ri, a1)} L${p(rp, a1)} Z`, k: hash(i * 13.7) };
  });
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <radialGradient id={`${id}-iris`} cx={cx} cy={cy} r={ri} gradientUnits="userSpaceOnUse">
          <stop offset={rp / ri} stopColor={palette.voxel.irisInner} />
          <stop offset="0.82" stopColor={palette.voxel.irisMid} />
          <stop offset="1" stopColor={palette.voxel.irisOuter} />
        </radialGradient>
        <radialGradient id={`${id}-lens`} cx={cx} cy={cy} r={rp} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={palette.voxel.lens} />
          <stop offset="0.85" stopColor="#fbf3ff" />
          <stop offset="1" stopColor="#efe2ff" />
        </radialGradient>
      </defs>
      <g opacity={layout.compact ? 0.45 : 1}>
        <circle cx={cx} cy={cy} r={ri * 1.03} fill={palette.voxel.limbal} />
        {wedges.map((w, i) => (
          <path key={i} d={w.d} fill={`url(#${id}-iris)`} opacity={0.75 + 0.25 * w.k} />
        ))}
        <circle cx={cx} cy={cy} r={rp} fill={`url(#${id}-lens)`} stroke={palette.brand[700]} strokeOpacity={0.5} strokeWidth={2} />
      </g>
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x - c / 2} y={b.y - c / 2 + 6} width={c - 2} height={c - 2} rx={3} fill={palette.voxel.side} />
          <rect
            x={b.x - c / 2}
            y={b.y - c / 2}
            width={c - 2}
            height={c - 2}
            rx={3}
            fill={palette.voxel.top}
            opacity={0.86 + 0.14 * b.k}
          />
        </g>
      ))}
    </svg>
  );
}
