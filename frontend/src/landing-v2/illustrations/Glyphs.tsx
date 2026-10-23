import type { EyeMode, LookSource } from "../lib/gaze";
import { Eye } from "./Eye";

// A single eye in its own small svg, used on cards and steps
export function MiniEye({
  look = "auto",
  mode = "open",
  className = "",
  bg = "#1B1530",
  label,
}: {
  look?: LookSource;
  mode?: EyeMode;
  className?: string;
  bg?: string;
  label?: string;
}) {
  return (
    <svg viewBox="-56 -40 112 80" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="M -54 0 C -34 -46 34 -46 54 0 C 34 46 -34 46 -54 0 Z" fill={bg} />
      <Eye look={look} mode={mode} scale={1.05} />
    </svg>
  );
}

const Doc = ({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    <rect x="-34" y="-44" width="68" height="88" rx="8" fill={fill} />
    <rect x="-22" y="-28" width="44" height="5" rx="2.5" fill="#1B1530" opacity="0.18" />
    <rect x="-22" y="-16" width="34" height="5" rx="2.5" fill="#1B1530" opacity="0.18" />
    <rect x="-22" y="-4" width="40" height="5" rx="2.5" fill="#1B1530" opacity="0.18" />
  </g>
);

export function IntakeGlyph() {
  return (
    <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
      <Doc x={70} y={78} r={-12} fill="#FFFFFF" />
      <Doc x={130} y={78} r={12} fill="#FFFFFF" />
      <Doc x={100} y={70} r={0} fill="#FFFCF5" />
      <g transform="translate(100 96)">
        <path d="M -26 0 C -16 -20 16 -20 26 0 C 16 20 -16 20 -26 0 Z" fill="#1B1530" />
        <g transform="scale(0.5)">
          <Eye />
        </g>
      </g>
    </svg>
  );
}

export function ReadGlyph() {
  return (
    <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
      <rect x="40" y="58" width="120" height="74" rx="10" fill="#FFFFFF" />
      {[72, 88, 104, 120].map((y, i) => (
        <g key={y}>
          <rect x="54" y={y - 3} width={[70, 88, 60, 80][i]} height="6" rx="3" fill="#1B1530" opacity="0.16" />
          <rect x="54" y={y - 3} width={[70, 88, 30, 0][i]} height="6" rx="3" fill="#F06C9B" />
        </g>
      ))}
      <g transform="translate(100 32)">
        <path d="M -40 0 C -26 -30 26 -30 40 0 C 26 30 -26 30 -40 0 Z" fill="#1B1530" />
        <g transform="scale(0.78)">
          <Eye />
        </g>
      </g>
    </svg>
  );
}

export function RulesGlyph() {
  const rows = [
    { y: 34, ok: true },
    { y: 62, ok: true },
    { y: 90, ok: false },
    { y: 118, ok: true },
  ];
  return (
    <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
      {rows.map((r) => (
        <g key={r.y} transform={`translate(30 ${r.y})`}>
          <rect x="0" y="-11" width="112" height="22" rx="11" fill={r.ok ? "#FFFFFF" : "#FDE6E7"} />
          <circle cx="12" cy="0" r="7" fill={r.ok ? "#127A3E" : "#B8232B"} />
          {r.ok ? (
            <path d="M 8.5 0 L 11 2.6 L 15.5 -2.4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <rect x="11" y="-4" width="2" height="8" rx="1" fill="#fff" />
          )}
          <rect x="28" y="-3" width={r.ok ? 56 : 70} height="6" rx="3" fill="#1B1530" opacity={r.ok ? 0.2 : 0.5} />
        </g>
      ))}
      <g transform="translate(170 76)">
        <circle r="20" fill="#1B1530" />
        <text y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#F8C22E" fontFamily="Inter Variable, sans-serif">
          29
        </text>
      </g>
    </svg>
  );
}
