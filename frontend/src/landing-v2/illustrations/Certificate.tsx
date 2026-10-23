import { BadgeCheck, Flame } from "lucide-react";
import { useMemo, type CSSProperties, type ReactNode } from "react";

export type CertId = "panchganga" | "krishna-r1" | "krishna-r3";
export type Field = "number" | "validity" | "qr" | "signature" | "institution";
export type Tone = "ok" | "alert" | "look";

const DOCS: Record<
  CertId,
  { office: string; inst: string; no: string; issued: string; valid: ReactNode; validText: string; rev: string; signed: string; qrSeed: string }
> = {
  panchganga: {
    office: "Office of the Fire Officer, Kolhapur",
    inst: "Panchganga Institute of Technology, Kolhapur",
    no: "FSC/KLP/2026/0233",
    issued: "02-04-2026",
    valid: "31-03-2027",
    validText: "31-03-2027",
    rev: "Revision 1",
    signed: "02-04-2026, 10:14 IST",
    qrSeed: "KLP0233",
  },
  "krishna-r1": {
    office: "Office of the Fire Officer, Karad",
    inst: "Krishna Valley College, Karad",
    no: "FSC/KRD/2024/0419",
    issued: "01-07-2024",
    valid: "30-06-2025",
    validText: "30-06-2025",
    rev: "Revision 1",
    signed: "01-07-2024, 11:42 IST",
    qrSeed: "KRD0419",
  },
  "krishna-r3": {
    office: "Office of the Fire Officer, Karad",
    inst: "Krishna Valley College, Karad",
    no: "FSC/KRD/2024/0419",
    issued: "01-07-2024",
    valid: (
      <span className="relative inline-block">
        30-06-202
        <span className="relative inline-block">
          <span aria-hidden className="absolute left-[0.04em] top-[0.03em] text-ink/25">
            5
          </span>
          <span className="relative font-[650] text-[#24244f]">7</span>
        </span>
      </span>
    ),
    validText: "30-06-2027",
    rev: "Revision 3",
    signed: "01-07-2024, 11:42 IST",
    qrSeed: "KRD0419",
  },
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

function Qr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    const rnd = hash(seed);
    const n = 21;
    const out: [number, number][] = [];
    const finder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (!finder(x, y) && rnd() > 0.52) out.push([x, y]);
    return out;
  }, [seed]);
  const F = ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width="7" height="7" rx="1.4" fill="#1B1530" />
      <rect x="1" y="1" width="5" height="5" rx="1" fill="#FFFDF6" />
      <rect x="2" y="2" width="3" height="3" rx="0.7" fill="#1B1530" />
    </g>
  );
  return (
    <svg viewBox="-1 -1 23 23" className="h-full w-full" aria-hidden>
      <rect x="-1" y="-1" width="23" height="23" rx="2" fill="#FFFDF6" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x + 0.08} y={y + 0.08} width="0.84" height="0.84" rx="0.2" fill="#1B1530" />
      ))}
      <F x={0} y={0} />
      <F x={14} y={0} />
      <F x={0} y={14} />
    </svg>
  );
}

const ring: Record<Tone, string> = {
  ok: "0 0 0 0.16em #127a3e, 0 0 0 0.42em rgba(18,122,62,0.16)",
  alert: "0 0 0 0.16em #b8232b, 0 0 0 0.42em rgba(184,35,43,0.16)",
  look: "0 0 0 0.16em #1b1530, 0 0 0 0.42em rgba(27,21,48,0.1)",
};

type Props = {
  id: CertId;
  width: number;
  highlight?: Partial<Record<Field, Tone>>;
  signature?: "intact" | "changed" | "plain";
  className?: string;
  style?: CSSProperties;
  label?: string;
};

export function Certificate({ id, width, highlight = {}, signature = "plain", className = "", style, label }: Props) {
  const d = DOCS[id];
  const hl = (f: Field): CSSProperties => ({
    boxShadow: highlight[f] ? ring[highlight[f]!] : "0 0 0 0 rgba(0,0,0,0)",
    transition: "box-shadow 0.35s ease",
  });
  return (
    <div
      role="img"
      aria-label={
        label ??
        `Synthetic Fire Safety Certificate, ${d.rev}, for ${d.inst}. Certificate number ${d.no}. Valid Up To ${d.validText}.`
      }
      className={`paper-grain relative select-none overflow-hidden rounded-[1em] text-ink shadow-[0_0.9em_2.2em_-0.6em_rgba(27,21,48,0.35)] ${className}`}
      style={{ width, fontSize: (width / 440) * 16, padding: "1.25em 1.4em 0.9em", ...style }}
    >
      <div className="flex items-start justify-between gap-[0.8em]">
        <div className="flex items-center gap-[0.7em]">
          <span className="grid size-[2.5em] shrink-0 place-items-center rounded-full bg-tang-soft text-tang">
            <Flame className="size-[1.35em]" strokeWidth={2.4} aria-hidden />
          </span>
          <div>
            <div className="font-display text-[1.32em] font-[750] leading-[1.05]">Fire Safety Certificate</div>
            <div className="mt-[0.2em] text-[0.7em] font-medium text-ink-3">{d.office}</div>
          </div>
        </div>
        <span className="mt-[0.1em] rounded-full bg-ink px-[0.65em] py-[0.3em] text-[0.62em] font-semibold whitespace-nowrap text-white">
          {d.rev}
        </span>
      </div>
      <div className="mt-[0.9em] grid grid-cols-[1fr_auto] gap-[1em] border-t border-dashed border-line pt-[0.8em]">
        <dl className="grid gap-[0.5em] text-[0.74em]">
          <div data-field="institution" className="rounded-[0.5em] px-[0.35em] py-[0.15em]" style={hl("institution")}>
            <dt className="text-[0.82em] font-semibold tracking-wide text-ink-3 uppercase">Institution</dt>
            <dd className="font-semibold">{d.inst}</dd>
          </div>
          <div data-field="number" className="rounded-[0.5em] px-[0.35em] py-[0.15em]" style={hl("number")}>
            <dt className="text-[0.82em] font-semibold tracking-wide text-ink-3 uppercase">Certificate No.</dt>
            <dd className="font-mono font-medium">{d.no}</dd>
          </div>
          <div className="grid grid-cols-2 gap-[0.6em]">
            <div className="px-[0.35em] py-[0.15em]">
              <dt className="text-[0.82em] font-semibold tracking-wide text-ink-3 uppercase">Issued on</dt>
              <dd className="font-mono font-medium">{d.issued}</dd>
            </div>
            <div data-field="validity" className="rounded-[0.5em] px-[0.35em] py-[0.15em]" style={hl("validity")}>
              <dt className="text-[0.82em] font-semibold tracking-wide text-ink-3 uppercase">Valid Up To</dt>
              <dd className="font-mono font-medium">{d.valid}</dd>
            </div>
          </div>
        </dl>
        <div data-field="qr" className="size-[5.4em] self-start rounded-[0.45em] p-[0.2em]" style={hl("qr")}>
          <Qr seed={d.qrSeed} />
        </div>
      </div>
      <div
        data-field="signature"
        className="mt-[0.75em] flex items-center gap-[0.6em] rounded-[0.6em] bg-cream px-[0.7em] py-[0.55em]"
        style={hl("signature")}
      >
        <BadgeCheck
          className={`size-[1.5em] shrink-0 ${signature === "changed" ? "text-alert" : signature === "intact" ? "text-ok" : "text-ink-2"}`}
          strokeWidth={2.2}
          aria-hidden
        />
        <div className="min-w-0 text-[0.66em] leading-snug">
          <div className="font-semibold">Digitally signed by Fire Officer ({id === "panchganga" ? "Kolhapur" : "Karad"})</div>
          <div className="text-ink-3">
            {d.signed}
            {signature === "intact" && <span className="font-semibold text-ok">, signature intact</span>}
            {signature === "changed" && <span className="font-semibold text-alert">, page changed after signing</span>}
          </div>
        </div>
      </div>
      <div className="mt-[0.7em] text-center text-[0.58em] font-bold tracking-[0.28em] text-alert/80">SYNTHETIC TEST DOCUMENT</div>
    </div>
  );
}
