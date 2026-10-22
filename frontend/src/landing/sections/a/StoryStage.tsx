import { Check, FileLock2, Lock, RadioTower, ScanLine } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { SimTag, ease, spring } from "../../kit";
import { palette } from "../../palette";
import { ReviewCard } from "./ReviewCard";
import { DOC_W, DOC_Y, FIELDS, QR, SIG, StoryDoc, fieldBox } from "./StoryDoc";

export const STAGE_W = 600;
export const STAGE_H = 540;

const HASH = "9f2c4e7a1b03d58e6c2f90ab47d1e3c85b6a09f4d2e7c1835af06b9e24c7d1a3";

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
  transition: { duration: 0.45, ease: ease.out },
};

function Chip({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`absolute rounded-[12px] border border-(--lp-line) bg-white/95 px-3 py-2 text-[11px] text-(--lp-ink-2) shadow-[0_12px_28px_-14px_rgb(60_20_110/0.35)] backdrop-blur ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

// Step 1: the digest types in, then the file locks
function Intake({ live }: { live: boolean }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? HASH.length : 0);
  useEffect(() => {
    if (!live || reduced) {
      setN(HASH.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= HASH.length ? v : v + 2)), 22);
    return () => window.clearInterval(id);
  }, [live, reduced]);
  const done = n >= HASH.length;
  return (
    <motion.div key="intake" {...fade} className="absolute inset-0">
      <Chip style={{ left: 250, top: 120, width: 330 }} className="px-4! py-3!">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-(--lp-ink)">
          <FileLock2 aria-hidden className="size-4 text-(--lp-brand-500)" />
          fire_noc_panchganga.pdf
          <span className="ml-auto font-normal text-(--lp-ink-3)">412 KB</span>
        </div>
        <p className="lp-mono mt-3 text-[9.5px] tracking-[0.1em] text-(--lp-ink-3)">SHA-256</p>
        <p className="lp-mono mt-1 text-[11px] leading-[1.5] break-all text-(--lp-ink)">
          {HASH.slice(0, n)}
          {!done && <span className="ml-px inline-block h-[12px] w-[6px] translate-y-[2px] bg-(--lp-brand-500)" />}
        </p>
        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring.snappy}
              className="mt-3 flex items-center gap-2 rounded-[8px] bg-(--lp-verified-bg) px-2.5 py-1.5 text-[11px] font-semibold text-(--lp-verified-fg)"
            >
              <Lock aria-hidden className="size-3.5" />
              Encrypted at rest. Every finding cites this digest.
            </motion.div>
          )}
        </AnimatePresence>
      </Chip>
      <motion.div
        className="absolute rounded-[14px] border-2 border-dashed border-(--lp-brand-300)"
        style={{ left: -6, top: DOC_Y - 6, width: DOC_W + 12, height: 464 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: done ? 0 : 1 }}
        transition={{ duration: 0.4 }}
      />
    </motion.div>
  );
}

// Step 2: word boxes light up, then fields lift out with their regions
function Understand() {
  const words: { x: number; y: number; w: number; h: number }[] = [
    { x: 18, y: DOC_Y + 14, w: 196, h: 18 },
    { x: 18, y: DOC_Y + 36, w: 178, h: 24 },
    ...FIELDS.map((f) => ({ x: 18, y: DOC_Y + f.y - 2, w: 84, h: 20 })),
    ...FIELDS.map((f) => fieldBox(f.key)),
    ...[0, 1, 2, 3, 4].map((i) => ({ x: 18, y: DOC_Y + 222 + i * 12, w: 290 * [0.96, 0.88, 0.92, 0.64, 0.82][i], h: 10 })),
  ];
  const lifted = [
    { key: "certificate_no" as const, top: 96 },
    { key: "valid_up_to" as const, top: 196 },
    { key: "institution" as const, top: 296 },
  ];
  return (
    <motion.div key="understand" {...fade} className="absolute inset-0">
      {words.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-[3px] border border-(--lp-brand-400)/70 bg-(--lp-brand-200)/25"
          style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: [0, 1, 0.55], scale: 1 }}
          transition={{ duration: 0.5, delay: i * 0.035 }}
        />
      ))}
      {lifted.map((l, i) => {
        const f = FIELDS.find((x) => x.key === l.key)!;
        const b = fieldBox(l.key);
        return (
          <motion.div
            key={l.key}
            className="absolute w-[236px] rounded-[12px] border border-(--lp-brand-200) bg-white px-3 py-2 shadow-[0_16px_30px_-14px_rgb(91_31_194/0.4)]"
            style={{ left: 352, top: l.top }}
            initial={{ x: b.x - 352, y: b.y - l.top, opacity: 0, scale: 0.7 }}
            animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            transition={{ ...spring.soft, delay: 0.75 + i * 0.16 }}
          >
            <p className="lp-mono text-[9.5px] font-semibold text-(--lp-brand-600)">{f.key}</p>
            <p className="lp-mono mt-0.5 text-[12px] font-medium text-(--lp-ink)">{f.value}</p>
            <p className="lp-mono mt-1 text-[9px] text-(--lp-ink-3)">
              page 1 · box {Math.round(b.x)},{Math.round(b.y - DOC_Y)},{Math.round(b.w)},{b.h}
            </p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// Step 3: the signature chain draws to the root, the QR decodes, the issuer registry answers
function Verify() {
  const nodes = [
    { label: "Chief Fire Officer", sub: "document signer", y: 300 },
    { label: "Issuing CA", sub: "licensed by CCA", y: 362 },
    { label: "CCA India root", sub: "trust anchor", y: 424 },
  ];
  const sx = SIG.x + 96;
  const sy = SIG.y + 30;
  return (
    <motion.div key="verify" {...fade} className="absolute inset-0">
      <svg className="pointer-events-none absolute inset-0" width={600} height={540} aria-hidden>
        <motion.path
          d={`M ${sx} ${sy} C ${sx + 40} ${sy}, 340 ${nodes[0].y + 18}, 372 ${nodes[0].y + 18}`}
          fill="none"
          stroke={palette.status.verified.dot}
          strokeWidth="1.6"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        />
        {[0, 1].map((i) => (
          <motion.line
            key={i}
            x1={392}
            x2={392}
            y1={nodes[i].y + 36}
            y2={nodes[i + 1].y}
            stroke={palette.status.verified.dot}
            strokeWidth="1.6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, delay: 0.55 + i * 0.4 }}
          />
        ))}
        <motion.rect
          x={QR.x - 6}
          y={QR.y - 6}
          width={QR.s + 12}
          height={QR.s + 12}
          rx="6"
          fill="none"
          stroke={palette.brand[500]}
          strokeWidth="1.6"
          initial={{ opacity: 0, scale: 1.2 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ transformOrigin: `${QR.x + QR.s / 2}px ${QR.y + QR.s / 2}px` }}
          transition={{ duration: 0.35, delay: 0.2 }}
        />
      </svg>
      {nodes.map((n, i) => (
        <motion.div
          key={n.label}
          className="absolute flex w-[208px] items-center gap-2 rounded-[12px] border border-(--lp-verified-dot)/30 bg-white px-3 py-2 shadow-[0_12px_26px_-14px_rgb(18_114_58/0.4)]"
          style={{ left: 372, top: n.y }}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.45 + i * 0.4 }}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-(--lp-verified-dot) text-white">
            <Check aria-hidden className="size-3" strokeWidth={3} />
          </span>
          <span className="min-w-0">
            <span className="block text-[11.5px] font-semibold text-(--lp-ink)">{n.label}</span>
            <span className="block text-[10px] text-(--lp-ink-3)">{n.sub}</span>
          </span>
        </motion.div>
      ))}
      <motion.div
        className="absolute w-[200px] rounded-[12px] border border-(--lp-brand-200) bg-white px-3 py-2 shadow-[0_12px_26px_-14px_rgb(91_31_194/0.4)]"
        style={{ left: 8, top: QR.y - 76 }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-(--lp-brand-600)">
          <ScanLine aria-hidden className="size-3.5" /> Signed QR decoded
        </p>
        <p className="lp-mono mt-1 text-[10px] text-(--lp-ink)">MFS/KOP/2024/0381</p>
        <p className="lp-mono text-[10px] text-(--lp-ink)">valid_to 30-06-2025</p>
      </motion.div>
      <motion.div
        className="absolute w-[236px] rounded-[12px] border border-(--lp-line) bg-white px-3 py-2.5 shadow-[0_12px_26px_-14px_rgb(60_20_110/0.35)]"
        style={{ left: 352, top: 92 }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.9 }}
      >
        <div className="flex items-center gap-2">
          <span className="relative grid size-6 place-items-center rounded-full bg-(--lp-pending-bg) text-(--lp-pending-fg)">
            <RadioTower aria-hidden className="size-3.5" />
            <motion.span
              className="absolute inset-0 rounded-full border border-(--lp-pending-dot)"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 2.1, opacity: 0 }}
              transition={{ duration: 1.1, delay: 1.1, repeat: 1 }}
            />
          </span>
          <span className="text-[11.5px] font-semibold text-(--lp-ink)">Issuer registry</span>
          <SimTag className="ml-auto" />
        </div>
        <motion.p
          className="lp-mono mt-2 text-[10px] leading-[1.5] text-(--lp-ink-2)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.9 }}
        >
          record found · valid_to 30-06-2025
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

// Step 4: the cited APH clause snaps onto the field it governs
function CheckStep() {
  const b = fieldBox("valid_up_to");
  return (
    <motion.div key="check" {...fade} className="absolute inset-0">
      <motion.div
        className="absolute rounded-[4px] border-2 border-(--lp-manual-dot) bg-(--lp-manual-dot)/10"
        style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
      />
      <svg className="pointer-events-none absolute inset-0" width={600} height={540} aria-hidden>
        <motion.path
          d={`M ${b.x + b.w + 2} ${b.y + b.h / 2} C ${b.x + b.w + 60} ${b.y + b.h / 2}, 300 186, 340 186`}
          fill="none"
          stroke={palette.status.manual.dot}
          strokeWidth="1.6"
          strokeDasharray="4 3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        />
      </svg>
      <motion.div
        className="absolute w-[256px] rounded-[16px] border border-(--lp-brand-200) bg-white p-4 shadow-[0_22px_40px_-18px_rgb(91_31_194/0.45)]"
        style={{ left: 340, top: 120 }}
        initial={{ x: 120, y: 60, rotate: 6, opacity: 0 }}
        animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
      >
        <p className="lp-mono text-[9.5px] font-semibold tracking-[0.08em] text-(--lp-brand-600)">APH 2025-26 · ANNEXURE 2.1 (v) · PAGE 97</p>
        <p className="mt-2 text-[13px] leading-snug font-medium text-(--lp-ink)">
          "A valid Fire Safety Certificate issued by the Competent Authority."
        </p>
        <div className="mt-3 space-y-1.5 border-t border-(--lp-line) pt-3 text-[10.5px]">
          <div className="flex justify-between">
            <span className="text-(--lp-ink-3)">Printed on document</span>
            <span className="lp-mono text-(--lp-ink)">30-06-2027</span>
          </div>
          <div className="flex justify-between">
            <span className="text-(--lp-ink-3)">Signed QR and issuer record</span>
            <span className="lp-mono text-(--lp-ink)">30-06-2025</span>
          </div>
        </div>
        <motion.p
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-(--lp-mismatch-bg) px-2 py-0.5 text-[10.5px] font-semibold text-(--lp-mismatch-fg)"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, ...spring.snappy }}
        >
          <span className="size-1.5 rounded-full bg-(--lp-mismatch-dot)" /> Mismatch
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

function Review() {
  return (
    <motion.div key="review" {...fade} className="absolute inset-0">
      <div className="absolute" style={{ left: 272, top: 118 }}>
        <ReviewCard />
      </div>
    </motion.div>
  );
}

export function StoryStage({ step, live = true }: { step: number; live?: boolean }) {
  return (
    <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
      <StoryDoc dim={step === 4} />
      <AnimatePresence mode="wait" initial={false}>
        {step === 0 && <Intake key="s0" live={live} />}
        {step === 1 && <Understand key="s1" />}
        {step === 2 && <Verify key="s2" />}
        {step === 3 && <CheckStep key="s3" />}
        {step === 4 && <Review key="s4" />}
      </AnimatePresence>
    </div>
  );
}
