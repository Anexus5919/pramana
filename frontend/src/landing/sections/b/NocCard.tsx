import type { RefObject } from "react";
import { palette } from "../../palette";

// Colours of the synthetic printed document (paper, stamp ink, security print); a picture of paper, not UI
const doc = {
  paper: "#fbf6ec",
  patch: "#ffffff",
  print: "#22303f",
  muted: "#5d6672",
  rule: "#c9bfae",
  guilloche: "#b9d6c6",
  guilloche2: "#e6c9b8",
  stampInk: "#2d45a8",
  signInk: "#1b2a7a",
  head: "#7a2318",
};

export const CARD_W = 520;
export const CARD_H = 700;

export type CardRegions = {
  date: RefObject<HTMLDivElement | null>;
  sign: RefObject<HTMLDivElement | null>;
  qr: RefObject<HTMLDivElement | null>;
};

// Seeded pseudo random generator so the QR pattern is stable between renders
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const QR_N = 25;
const qrCells: boolean[] = (() => {
  const r = rng(417);
  const cells: boolean[] = [];
  for (let y = 0; y < QR_N; y++)
    for (let x = 0; x < QR_N; x++) {
      const inFinder = (fx: number, fy: number) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7;
      const finder = inFinder(0, 0) || inFinder(QR_N - 7, 0) || inFinder(0, QR_N - 7);
      const sep = (x === 7 || y === 7) && (x < 8 || y < 8) ? true : false;
      cells.push(finder ? false : sep ? false : r() > 0.52);
    }
  return cells;
})();

function Qr({ size = 92 }: { size?: number }) {
  const c = size / QR_N;
  const finder = (fx: number, fy: number) => (
    <g key={`${fx}-${fy}`}>
      <rect x={fx * c} y={fy * c} width={7 * c} height={7 * c} fill={doc.print} />
      <rect x={(fx + 1) * c} y={(fy + 1) * c} width={5 * c} height={5 * c} fill={doc.patch} />
      <rect x={(fx + 2) * c} y={(fy + 2) * c} width={3 * c} height={3 * c} fill={doc.print} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <rect width={size} height={size} fill={doc.patch} />
      {qrCells.map((on, i) =>
        on ? <rect key={i} x={(i % QR_N) * c} y={Math.floor(i / QR_N) * c} width={c + 0.2} height={c + 0.2} fill={doc.print} /> : null,
      )}
      {finder(0, 0)}
      {finder(QR_N - 7, 0)}
      {finder(0, QR_N - 7)}
    </svg>
  );
}

// Security print rosette behind the certificate body
function Guilloche() {
  const lines = Array.from({ length: 36 }, (_, i) => i * 5);
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${CARD_W} ${CARD_H}`} aria-hidden>
      <defs>
        <pattern id="noc-wave" width="26" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 5 Q 6.5 0 13 5 T 26 5" fill="none" stroke={doc.guilloche} strokeWidth="0.6" opacity="0.55" />
        </pattern>
      </defs>
      <rect x="22" y="150" width={CARD_W - 44} height="360" fill="url(#noc-wave)" opacity="0.5" />
      <g transform={`translate(${CARD_W / 2} 330)`} opacity="0.5">
        {lines.map((a) => (
          <ellipse key={a} rx="150" ry="58" transform={`rotate(${a})`} fill="none" stroke={doc.guilloche} strokeWidth="0.55" />
        ))}
        {lines.map((a) => (
          <ellipse key={`b${a}`} rx="96" ry="30" transform={`rotate(${a + 2.5})`} fill="none" stroke={doc.guilloche2} strokeWidth="0.5" />
        ))}
      </g>
    </svg>
  );
}

function Emblem() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
      <circle cx="26" cy="26" r="24" fill="none" stroke={doc.head} strokeWidth="1.6" />
      <circle cx="26" cy="26" r="19.5" fill="none" stroke={doc.head} strokeWidth="0.8" />
      <path d="M26 11c4 6 8 9 8 15a8 8 0 0 1-16 0c0-4 2-6 4-8 0 3 1 5 3 5-1-4 0-8 1-12z" fill={doc.head} opacity="0.9" />
      <path d="M18 38h16" stroke={doc.head} strokeWidth="1.4" />
    </svg>
  );
}

function Stamp() {
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden style={{ transform: "rotate(-14deg)" }}>
      <defs>
        <path id="stamp-arc" d="M56 56 m -40 0 a 40 40 0 1 1 80 0 a 40 40 0 1 1 -80 0" />
      </defs>
      <g fill="none" stroke={doc.stampInk} opacity="0.78">
        <circle cx="56" cy="56" r="52" strokeWidth="2.2" />
        <circle cx="56" cy="56" r="47" strokeWidth="0.9" />
        <circle cx="56" cy="56" r="29" strokeWidth="1.1" />
      </g>
      <text fill={doc.stampInk} opacity="0.8" fontSize="8.6" fontWeight="700" letterSpacing="1.6" fontFamily="Inter Variable, sans-serif">
        <textPath href="#stamp-arc">REGIONAL FIRE OFFICE · KARAD DIVISION ·</textPath>
      </text>
      <text x="56" y="53" textAnchor="middle" fill={doc.stampInk} opacity="0.85" fontSize="9" fontWeight="800" fontFamily="Inter Variable, sans-serif">
        FIRE
      </text>
      <text x="56" y="64" textAnchor="middle" fill={doc.stampInk} opacity="0.85" fontSize="9" fontWeight="800" fontFamily="Inter Variable, sans-serif">
        OFFICER
      </text>
    </svg>
  );
}

function Signature() {
  return (
    <svg width="150" height="54" viewBox="0 0 150 54" aria-hidden>
      <path
        d="M6 38c8-18 14-30 18-28 5 3-9 30-4 31 6 1 12-22 18-21 5 1-2 18 3 18 6 0 9-14 15-13 4 1 0 10 5 10 7 0 10-12 17-12 5 0 3 9 8 9 8 0 14-8 22-10 6-1 12 1 20-2"
        fill="none"
        stroke={doc.signInk}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22 46c30-4 70-6 112-5" fill="none" stroke={doc.signInk} strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-[5px]">
      <dt className="text-[11.5px] font-medium" style={{ color: doc.muted }}>
        {k}
      </dt>
      <dd className={`text-[12.5px] font-semibold ${mono ? "lp-mono text-[12px]" : ""}`} style={{ color: doc.print }}>
        {v}
      </dd>
    </div>
  );
}

// One revision of the synthetic fire NOC. Revision 1 is what the fire officer signed; revision 3 has the date drawn over
export default function NocCard({ rev, regions }: { rev: 1 | 3; regions?: CardRegions }) {
  const edited = rev === 3;
  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: CARD_W,
        height: CARD_H,
        background: doc.paper,
        fontFamily: "Inter Variable, Inter, sans-serif",
        boxShadow: "inset 0 0 0 1px rgb(120 100 70 / 0.18)",
      }}
    >
      <Guilloche />
      <div className="absolute inset-[10px] border" style={{ borderColor: doc.rule }} />
      <div className="absolute inset-[14px] border-[0.5px]" style={{ borderColor: doc.rule }} />

      <div className="relative px-9 pt-8">
        <header className="flex items-center gap-4 border-b pb-4" style={{ borderColor: doc.rule }}>
          <Emblem />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold tracking-[0.16em]" style={{ color: doc.head }}>
              DIRECTORATE OF FIRE AND EMERGENCY SERVICES
            </p>
            <p className="mt-0.5 text-[12px] font-semibold" style={{ color: doc.print }}>
              Regional Fire Office, Karad Division
            </p>
            <p className="text-[10.5px]" style={{ color: doc.muted }}>
              Station Road, Karad 415110
            </p>
          </div>
        </header>

        <div className="mt-5 text-center">
          <p className="text-[17px] font-extrabold tracking-[0.06em]" style={{ color: doc.print }}>
            FIRE SAFETY CERTIFICATE
          </p>
          <p className="text-[11px] font-medium tracking-[0.08em]" style={{ color: doc.muted }}>
            NO OBJECTION CERTIFICATE FOR OCCUPANCY
          </p>
        </div>

        <dl className="mt-5">
          <Row k="Certificate No." v="RFO/KRD/NOC/2024/0417" mono />
          <Row k="Date of issue" v="01-07-2024" mono />
          <Row k="Issued to" v="Krishna Valley College, Karad" />
          <Row k="Premises" v="Survey No. 112/2, Vidyanagar, Karad, Dist. Satara" />
          <Row k="Building" v="Academic Block A, G+4, 8,420 sq m" />
          <Row k="Occupancy" v="Educational (Group B)" />
          <div className="grid grid-cols-[150px_1fr] gap-3 py-[5px]">
            <dt className="self-center text-[11.5px] font-medium" style={{ color: doc.muted }}>
              Valid Up To
            </dt>
            <dd className="relative">
              <div ref={regions?.date} className="relative inline-block">
                {edited ? (
                  <span
                    className="lp-mono relative inline-block px-1.5 py-0.5 text-[15px] font-bold"
                    style={{
                      color: "#1f2b38",
                      background: doc.patch,
                      top: "0.5px",
                      left: "1px",
                      letterSpacing: "0.01em",
                      boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.04)",
                    }}
                  >
                    30-06-2027
                  </span>
                ) : (
                  <span className="lp-mono inline-block px-1.5 py-0.5 text-[15px] font-bold" style={{ color: doc.print }}>
                    30-06-2025
                  </span>
                )}
              </div>
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-[11px] leading-[1.6]" style={{ color: doc.muted }}>
          The premises were inspected on 18-06-2024 and found to comply with the fire prevention and life safety
          measures required for the occupancy stated above, subject to annual maintenance of installed systems and the
          conditions printed overleaf. This certificate must be renewed before the validity date.
        </p>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div ref={regions?.qr} className="flex flex-col items-start gap-1.5">
            <div className="rounded-[3px] p-1" style={{ background: doc.patch, boxShadow: "0 0 0 1px rgb(0 0 0 / 0.06)" }}>
              <Qr />
            </div>
            <p className="lp-mono text-[9px]" style={{ color: doc.muted }}>
              Signed QR, scan to verify
            </p>
          </div>

          <div ref={regions?.sign} className="relative w-[230px] text-right">
            <div className="absolute -top-9 left-1">
              <Stamp />
            </div>
            <div
              className="relative mb-1 ml-auto inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[10.5px] font-semibold"
              style={{
                color: edited ? palette.status.mismatch.fg : palette.status.verified.fg,
                background: edited ? palette.status.mismatch.bg : palette.status.verified.bg,
                boxShadow: `inset 0 0 0 1px ${edited ? palette.status.mismatch.dot : palette.status.verified.dot}40`,
              }}
            >
              <span
                className="inline-block size-1.5 rounded-full"
                style={{ background: edited ? palette.status.mismatch.dot : palette.status.verified.dot }}
              />
              {edited ? "Modified after signing" : "Issuer signature intact"}
            </div>
            <div className="relative flex justify-end">
              <Signature />
            </div>
            <p className="text-[12px] font-semibold" style={{ color: doc.print }}>
              Fire Officer
            </p>
            <p className="text-[10.5px]" style={{ color: doc.muted }}>
              Regional Fire Office, Karad Division
            </p>
          </div>
        </div>
      </div>

      <footer
        className="lp-mono absolute inset-x-[14px] bottom-[14px] flex items-center justify-between border-t px-5 py-2 text-[9.5px] font-semibold tracking-[0.14em]"
        style={{ borderColor: doc.rule, color: doc.muted, background: "rgb(255 255 255 / 0.35)" }}
      >
        <span>SYNTHETIC TEST DOCUMENT</span>
        <span>Page 1 of 1 · {edited ? "rev 3" : "rev 1"}</span>
      </footer>
    </div>
  );
}
