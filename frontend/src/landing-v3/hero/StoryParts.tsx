import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useMemo } from "react";
import { SimTag } from "../../landing/kit";

// The v2 certificate, restyled in the v1 landing palette; data-field marks what the eyes read
export type CertId = "panchganga" | "krishna-r3";
export type Field = "number" | "validity" | "qr" | "signature";
export type Tone = "ok" | "alert";

const DOCS: Record<
  CertId,
  { office: string; inst: string; no: string; issued: string; valid: ReactNode; validText: string; rev: string; signed: string; qrSeed: string; city: string }
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
    city: "Kolhapur",
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
          <span aria-hidden className="absolute top-[0.03em] left-[0.04em] text-(--lp-ink)/25">
            5
          </span>
          <span className="relative font-[650] text-[#2a2350]">7</span>
        </span>
      </span>
    ),
    validText: "30-06-2027",
    rev: "Revision 3",
    signed: "01-07-2024, 11:42 IST",
    qrSeed: "KRD0419",
    city: "Karad",
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
    const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rnd() > 0.52) out.push([x, y]);
    return out;
  }, [seed]);
  const F = ({ x, y }: { x: number; y: number }) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width="7" height="7" rx="1.4" fill="#1c1622" />
      <rect x="1" y="1" width="5" height="5" rx="1" fill="#ffffff" />
      <rect x="2" y="2" width="3" height="3" rx="0.7" fill="#1c1622" />
    </g>
  );
  return (
    <svg viewBox="-1 -1 23 23" className="h-full w-full" aria-hidden>
      <rect x="-1" y="-1" width="23" height="23" rx="2" fill="#ffffff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x + 0.08} y={y + 0.08} width="0.84" height="0.84" rx="0.2" fill="#1c1622" />
      ))}
      <F x={0} y={0} />
      <F x={14} y={0} />
      <F x={0} y={14} />
    </svg>
  );
}

const ring: Record<Tone, string> = {
  ok: "0 0 0 0.14em var(--lp-verified-dot), 0 0 0 0.4em rgb(31 160 85 / 0.14)",
  alert: "0 0 0 0.14em var(--lp-mismatch-dot), 0 0 0 0.4em rgb(229 72 77 / 0.14)",
};

type CertProps = {
  id: CertId;
  width: number;
  highlight?: Partial<Record<Field, Tone>>;
  signature?: "intact" | "changed" | "plain";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function Certificate({ id, width, highlight = {}, signature = "plain", className = "", style, children }: CertProps) {
  const d = DOCS[id];
  const hl = (f: Field): CSSProperties => ({
    boxShadow: highlight[f] ? ring[highlight[f]!] : "0 0 0 0 rgb(0 0 0 / 0)",
    transition: "box-shadow 0.35s ease",
  });
  const dot = signature === "changed" ? "bg-(--lp-mismatch-dot)" : signature === "intact" ? "bg-(--lp-verified-dot)" : "bg-(--lp-ink-4)";
  return (
    <div
      role="img"
      aria-label={`Synthetic Fire Safety Certificate, ${d.rev}, for ${d.inst}. Certificate number ${d.no}. Valid Up To ${d.validText}.`}
      className={`lp-shadow-lg relative overflow-hidden rounded-[0.9em] border border-(--lp-line) bg-white text-(--lp-ink) select-none ${className}`}
      style={{ width, fontSize: (width / 440) * 16, padding: "1.2em 1.35em 0.85em", ...style }}
    >
      <div className="flex items-start justify-between gap-[0.8em]">
        <div>
          <div className="lp-display text-[1.32em] leading-[1.05] font-semibold">Fire Safety Certificate</div>
          <div className="mt-[0.25em] text-[0.7em] font-medium text-(--lp-ink-3)">{d.office}</div>
        </div>
        <span className="mt-[0.1em] rounded-full bg-(--lp-brand-50) px-[0.65em] py-[0.3em] text-[0.62em] font-semibold whitespace-nowrap text-(--lp-brand-700) ring-1 ring-(--lp-brand-100)">
          {d.rev}
        </span>
      </div>
      <div className="mt-[0.85em] grid grid-cols-[1fr_auto] gap-[1em] border-t border-dashed border-(--lp-line-2) pt-[0.8em]">
        <dl className="grid gap-[0.5em] text-[0.74em]">
          <div className="px-[0.35em] py-[0.15em]">
            <dt className="text-[0.82em] font-semibold tracking-wide text-(--lp-ink-3) uppercase">Institution</dt>
            <dd className="font-semibold">{d.inst}</dd>
          </div>
          <div data-field="number" className="rounded-[0.5em] px-[0.35em] py-[0.15em]" style={hl("number")}>
            <dt className="text-[0.82em] font-semibold tracking-wide text-(--lp-ink-3) uppercase">Certificate No.</dt>
            <dd className="lp-mono font-medium">{d.no}</dd>
          </div>
          <div className="grid grid-cols-2 gap-[0.6em]">
            <div className="px-[0.35em] py-[0.15em]">
              <dt className="text-[0.82em] font-semibold tracking-wide text-(--lp-ink-3) uppercase">Issued on</dt>
              <dd className="lp-mono font-medium">{d.issued}</dd>
            </div>
            <div data-field="validity" className="rounded-[0.5em] px-[0.35em] py-[0.15em]" style={hl("validity")}>
              <dt className="text-[0.82em] font-semibold tracking-wide text-(--lp-ink-3) uppercase">Valid Up To</dt>
              <dd className="lp-mono font-medium">{d.valid}</dd>
            </div>
          </div>
        </dl>
        <div data-field="qr" className="size-[5.4em] self-start rounded-[0.45em] p-[0.2em]" style={hl("qr")}>
          <Qr seed={d.qrSeed} />
        </div>
      </div>
      <div
        data-field="signature"
        className="mt-[0.75em] flex items-center gap-[0.6em] rounded-[0.6em] bg-(--lp-surface-2) px-[0.75em] py-[0.55em]"
        style={hl("signature")}
      >
        <span className={`size-[0.6em] shrink-0 rounded-full transition-colors duration-300 ${dot}`} aria-hidden />
        <div className="min-w-0 text-[0.66em] leading-snug">
          <div className="font-semibold">Digitally signed by Fire Officer ({d.city})</div>
          <div className="text-(--lp-ink-3)">
            {d.signed}
            {signature === "intact" && <span className="font-semibold text-(--lp-verified-fg)">, signature intact</span>}
            {signature === "changed" && <span className="font-semibold text-(--lp-mismatch-fg)">, page changed after signing</span>}
          </div>
        </div>
      </div>
      <div className="mt-[0.7em] text-center text-[0.56em] font-semibold tracking-[0.28em] text-(--lp-ink-4)">SYNTHETIC TEST DOCUMENT</div>
      {children}
    </div>
  );
}

export const CHECKS: { title: string; detail?: string; sim?: boolean }[] = [
  { title: "Issuer signature intact, chain to CCA India root" },
  { title: "QR value matches the printed text" },
  { title: "Issuer registry record found", detail: "Registry lookups are simulated in this prototype.", sim: true },
];

export function CheckList({ shown, compact = false }: { shown: number; compact?: boolean }) {
  return (
    <ol className={compact ? "grid gap-1.5" : "grid gap-2.5"} aria-label="Checks on the first certificate">
      {CHECKS.map((c, i) => {
        const on = shown > i;
        return (
          <motion.li
            key={c.title}
            initial={false}
            animate={{ x: on ? 0 : 6 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={`flex items-start gap-3 rounded-2xl border transition-[background-color,border-color,box-shadow] duration-300 ${compact ? "px-3 py-2" : "px-4 py-3"} ${on ? "lp-shadow-md border-white bg-white" : "border-white/80 bg-white/75 backdrop-blur-md"}`}
          >
            <span
              className={`mt-px grid shrink-0 place-items-center rounded-full transition-colors duration-300 ${compact ? "size-5" : "size-6"} ${on ? "bg-(--lp-verified-dot) text-white" : "border-2 border-dashed border-(--lp-line-2) text-transparent"}`}
              aria-hidden
            >
              <Check className={compact ? "size-3" : "size-3.5"} strokeWidth={3} />
            </span>
            <span className="min-w-0">
              <span className={`block leading-snug font-semibold transition-colors duration-300 ${on ? "text-(--lp-ink)" : "text-(--lp-ink-3)"} ${compact ? "text-[13px]" : "text-[15px]"}`}>
                {c.title}
                {c.sim && <SimTag className="ml-2 -translate-y-px align-middle" />}
                <span className="sr-only">{on ? ", passed" : ", pending"}</span>
              </span>
              {c.detail && !compact && <span className="mt-0.5 block text-[13px] leading-snug text-(--lp-ink-3)">{c.detail}</span>}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function ReviewNote({ show, compact = false }: { show: boolean; compact?: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="note"
          role="status"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className={`lp-shadow-md rounded-2xl border border-(--lp-mismatch-dot)/35 bg-white ${compact ? "p-3" : "p-4"}`}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-(--lp-mismatch-fg) uppercase">
            <span className="size-1.5 rounded-full bg-(--lp-mismatch-dot)" aria-hidden />
            Needs human review
          </div>
          <p className={`mt-1.5 leading-snug font-semibold text-(--lp-ink) ${compact ? "text-[13.5px]" : "text-[15.5px]"}`}>
            Valid Up To was overwritten after signing: <span className="lp-mono whitespace-nowrap text-(--lp-mismatch-fg)">30-06-2027</span> drawn
            over <span className="lp-mono whitespace-nowrap">30-06-2025</span>.
          </p>
          {!compact && (
            <p className="mt-2 text-[13.5px] leading-snug text-(--lp-ink-3)">
              Revision 3 was saved after the fire officer signed Revision 1. The signature still verifies for Revision 1.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StepPills({ step }: { step: number }) {
  const items = ["Checks hold", "Needs review"];
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {items.map((t, i) => {
        const on = i === step;
        return (
          <span
            key={t}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors duration-300 ${on ? "bg-(--lp-ink) text-white" : "bg-white/60 text-(--lp-ink-3) ring-1 ring-white/70"}`}
          >
            <span className={`grid size-4 place-items-center rounded-full text-[10px] ${on ? "bg-white/20" : "bg-(--lp-ink)/8"}`}>{i + 1}</span>
            {t}
          </span>
        );
      })}
    </div>
  );
}

export const STORY_COPY = [
  {
    kicker: "Look, then confirm",
    title: "Every field, checked at its source.",
    body: "The hands hold the certificate still while Pramana checks the signature, the QR code and the issuer's own record.",
  },
  {
    kicker: "Look again",
    title: "Something changed after signing.",
    body: "The open hand means wait. An official compares the revisions and decides; Pramana only shows what changed.",
  },
];
