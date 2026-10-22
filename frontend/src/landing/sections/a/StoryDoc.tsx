import { palette } from "../../palette";

// Synthetic fire NOC used by the "How Pramana reads an application" story; field rows sit at fixed offsets so overlays align
export const DOC_W = 330;
export const DOC_H = 452;
export const DOC_X = 0;
export const DOC_Y = 56;

export const FIELDS = [
  { key: "certificate_no", label: "Certificate No.", value: "MFS/KOP/2024/0381", y: 86 },
  { key: "institution", label: "Institution", value: "Panchganga Inst. of Tech.", y: 112 },
  { key: "premises", label: "Premises", value: "Academic Block A, G+3", y: 138 },
  { key: "issued_on", label: "Issued On", value: "01-07-2024", y: 164 },
  { key: "valid_up_to", label: "Valid Up To", value: "30-06-2027", y: 190 },
] as const;

export const VALUE_X = 112;
export const CHAR_W = 6.15;
export const ROW_H = 16;

export const QR = { x: 22, y: 344, s: 66 };
export const SIG = { x: 178, y: 340, w: 132, h: 62 };

// Deterministic QR-like module pattern
function qrCells(n: number) {
  const cells: [number, number][] = [];
  let seed = 7;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const finder = (r < 3 && c < 3) || (r < 3 && c >= n - 3) || (r >= n - 3 && c < 3);
      if (finder) continue;
      seed = (seed * 9301 + 49297) % 233280;
      if (seed / 233280 > 0.52) cells.push([r, c]);
    }
  return cells;
}
const CELLS = qrCells(11);

export function QrGlyph({ size = 66 }: { size?: number }) {
  const n = 11;
  const m = size / n;
  const finder = (x: number, y: number) => (
    <g>
      <rect x={x} y={y} width={m * 3} height={m * 3} fill={palette.ink} />
      <rect x={x + m * 0.6} y={y + m * 0.6} width={m * 1.8} height={m * 1.8} fill="#fff" />
      <rect x={x + m} y={y + m} width={m} height={m} fill={palette.ink} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {CELLS.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c * m} y={r * m} width={m} height={m} fill={palette.ink} />
      ))}
      {finder(0, 0)}
      {finder(size - m * 3, 0)}
      {finder(0, size - m * 3)}
    </svg>
  );
}

export function StoryDoc({ dim = false }: { dim?: boolean }) {
  return (
    <div
      className="absolute overflow-hidden rounded-[14px] border border-(--lp-line-2) bg-white lp-shadow-lg transition-[opacity,filter] duration-500"
      style={{ left: DOC_X, top: DOC_Y, width: DOC_W, height: DOC_H, opacity: dim ? 0.55 : 1, filter: dim ? "saturate(0.6)" : "none" }}
    >
      <div className="absolute top-4 left-5 flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <circle cx="9" cy="9" r="8" fill="none" stroke={palette.status.expired.dot} strokeWidth="1.4" />
          <path d="M9 4 C 11 7, 12 9, 9 14 C 6 9, 7 7, 9 4 Z" fill={palette.status.expired.dot} />
        </svg>
        <span className="lp-mono text-[8.5px] font-semibold tracking-[0.12em] text-(--lp-ink-3)">DIRECTORATE OF FIRE SERVICES</span>
      </div>
      <p className="lp-display absolute top-[38px] left-5 text-[17px] font-semibold tracking-[-0.02em] text-(--lp-ink)">
        Fire Safety Certificate
      </p>
      <div className="absolute top-[70px] right-5 left-5 h-px bg-(--lp-line)" />
      {FIELDS.map((f) => (
        <div key={f.key} className="absolute left-5 flex items-center" style={{ top: f.y, height: ROW_H }}>
          <span className="w-[88px] text-[10px] text-(--lp-ink-3)">{f.label}</span>
          <span className="lp-mono text-[10.5px] whitespace-nowrap text-(--lp-ink)">{f.value}</span>
        </div>
      ))}
      <div className="absolute top-[226px] right-5 left-5 space-y-[7px]">
        {[96, 88, 92, 64, 82].map((w, i) => (
          <div key={i} className="h-[5px] rounded-full bg-(--lp-surface-3)" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="absolute" style={{ left: QR.x, top: QR.y - DOC_Y }}>
        <QrGlyph size={QR.s} />
      </div>
      <div className="absolute" style={{ left: SIG.x, top: SIG.y - DOC_Y, width: SIG.w, height: SIG.h }}>
        <svg viewBox="0 0 132 62" className="h-full w-full" aria-hidden>
          <circle cx="104" cy="26" r="20" fill="none" stroke={palette.brand[300]} strokeWidth="1.2" strokeDasharray="3 2" />
          <path
            d="M 6 38 C 14 12, 24 14, 22 32 C 20 46, 32 18, 42 24 C 50 28, 44 40, 56 34 C 64 29, 72 26, 92 30"
            fill="none"
            stroke={palette.ink}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line x1="4" y1="46" x2="96" y2="46" stroke={palette.line2} strokeWidth="1" />
          <text x="4" y="58" fontSize="8.5" fill={palette.ink3}>
            Chief Fire Officer
          </text>
        </svg>
      </div>
      <p className="lp-mono absolute right-0 bottom-3 left-0 text-center text-[8px] font-semibold tracking-[0.16em] text-(--lp-mismatch-fg)/70">
        SYNTHETIC TEST DOCUMENT
      </p>
    </div>
  );
}

// Page-space box for a field value, in stage coordinates
export function fieldBox(key: (typeof FIELDS)[number]["key"]) {
  const f = FIELDS.find((x) => x.key === key)!;
  return { x: DOC_X + 20 + 88 - 3, y: DOC_Y + f.y - 2, w: f.value.length * CHAR_W + 6, h: ROW_H + 4 };
}
