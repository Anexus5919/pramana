import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useRef, useState } from "react";
import { Reveal, Section, SimTag, dur, ease, spring } from "../kit";
import { type StatusKey, palette } from "../palette";

type Rung = {
  n: number;
  name: string;
  meaning: string;
  example: string;
  chip: string;
  tone: StatusKey;
  words: string;
  source: string;
  simulated?: boolean;
};

const RUNGS: Rung[] = [
  {
    n: 1,
    name: "Cryptographic",
    meaning: "Mathematics checks it. A digital signature or a signed QR is validated against a trusted certificate chain.",
    example: "Fire NOC signature is valid and its chain ends at CCA India root. It covers revision 1 of 3.",
    chip: "Verified, for revision 1",
    tone: "verified",
    words: "verified, mismatch, expired",
    source: "PDF signature validation, signed QR payloads",
  },
  {
    n: 2,
    name: "Issuer",
    meaning: "The issuing authority's own register answers. Pramana asks the issuer, not the applicant.",
    example: "Issuer registry lists RFO/KRD/NOC/2024/0417 for Krishna Valley College, valid up to 30-06-2025.",
    chip: "Issuer record matches",
    tone: "verified",
    words: "verified, not found in issuer registry",
    source: "Issuer registry lookup",
    simulated: true,
  },
  {
    n: 3,
    name: "Record",
    meaning: "An independent reference record agrees or disagrees: faculty registries, land records, earlier approvals.",
    example: "FAC-MH-1907-4417 is declared full-time at three institutions for 2025-26.",
    chip: "Inconsistent with record",
    tone: "mismatch",
    words: "consistent, mismatch",
    source: "Reference records and other applications",
  },
  {
    n: 4,
    name: "Rule",
    meaning: "A cited clause of the Approval Process Handbook applied to declared and extracted values.",
    example: "APH Annexure 2.1 (v), page 97 requires a valid Fire Safety Certificate. The signed validity ended 30-06-2025.",
    chip: "Rule not met",
    tone: "mismatch",
    words: "met, not met",
    source: "29 cited APH rules",
  },
  {
    n: 5,
    name: "Structural",
    meaning: "The file's own structure: revisions, incremental updates, fonts, metadata and edit history.",
    example: "Text was added over page 1 in an incremental update after the last signature.",
    chip: "Needs review",
    tone: "manual",
    words: "indicator, needs review",
    source: "Revision and object analysis",
  },
  {
    n: 6,
    name: "Heuristic",
    meaning: "Statistical signals such as image reuse, copy-move regions or layout anomalies. Useful leads, never proof.",
    example: "Lab photo matches another application at perceptual hash distance 3 of 64.",
    chip: "Needs review",
    tone: "manual",
    words: "indicator, needs review",
    source: "Perceptual hashing, OpenCV",
  },
  {
    n: 7,
    name: "Model",
    meaning: "A local language model's reading. Every value must be grounded in page text, and a model is never decisive alone.",
    example:
      "On an unfamiliar certificate layout the model read Valid until 13/03/2028. Grounding found it on the printed page, so it is kept as a model reading; a hidden line asking for 31/12/2099 was ignored and flagged.",
    chip: "Model reading, grounded",
    tone: "unchecked",
    words: "proposed, needs review",
    source: "Fine-tuned Qwen3 1.7B (v2), runs locally",
  },
];

const canVerify = (n: number) => n <= 2;

// Tiny isometric cube in a rung colour
function Cube({ color, i, show }: { color: string; i: number; show: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      width="16"
      height="18"
      viewBox="0 0 16 18"
      aria-hidden
      initial={false}
      animate={{ opacity: show ? 1 : 0.18, y: show ? 0 : 2 }}
      transition={reduced ? { duration: 0 } : { duration: dur.ui, delay: i * 0.03, ease: ease.out }}
    >
      <path d="M8 1 L15 5 L8 9 L1 5 Z" fill={color} opacity="0.55" />
      <path d="M1 5 L8 9 L8 17 L1 13 Z" fill={color} />
      <path d="M15 5 L8 9 L8 17 L15 13 Z" fill={color} opacity="0.78" />
    </motion.svg>
  );
}

export default function TrustLadder() {
  const [sel, setSel] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const r = RUNGS[sel];
  const color = palette.ev[sel];
  const st = palette.status[r.tone];

  function move(to: number) {
    const i = (to + RUNGS.length) % RUNGS.length;
    setSel(i);
    refs.current[i]?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const map: Record<string, number> = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: RUNGS.length - 1 };
    if (e.key in map) {
      e.preventDefault();
      move(map[e.key]);
    }
  }

  return (
    <Section
      id="ladder"
      eyebrow="Evidence classes"
      title="The trust ladder."
      lede="Every finding carries the class of evidence behind it, strongest first. The class decides which words Pramana is allowed to use."
    >
      <div className="mt-12 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <Reveal className="min-w-0">
          <div role="radiogroup" aria-label="Evidence class" className="relative">
            {RUNGS.map((g, i) => {
              const on = sel === i;
              return (
                <div key={g.n}>
                  {i === 2 && (
                    <div className="my-3 flex items-center gap-3 px-1" aria-hidden>
                      <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,var(--lp-ink-4)_0_6px,transparent_6px_11px)]" />
                      <span className="text-[11.5px] font-semibold text-(--lp-ink-3)">Only above this line may Pramana say verified</span>
                      <span className="h-px w-6 bg-[repeating-linear-gradient(90deg,var(--lp-ink-4)_0_6px,transparent_6px_11px)]" />
                    </div>
                  )}
                  <button
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setSel(i)}
                    onKeyDown={(e) => onKey(e, i)}
                    className="group relative mb-1.5 flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left sm:gap-4"
                  >
                    {on && (
                      <motion.span
                        layoutId="ladder-sel"
                        className="absolute inset-0 rounded-[14px] border bg-white"
                        style={{ borderColor: `${palette.ev[i]}55`, boxShadow: `0 12px 30px -16px ${palette.ev[i]}88` }}
                        transition={spring.snappy}
                      />
                    )}
                    <span
                      className="lp-mono relative grid h-9 w-11 shrink-0 place-items-center rounded-[8px] text-[13px] font-bold"
                      style={{
                        background: palette.ev[i],
                        color: i >= 5 ? palette.ink : "white",
                        boxShadow: "inset 0 -4px 0 rgb(0 0 0 / 0.2), inset 0 1px 0 rgb(255 255 255 / 0.3)",
                      }}
                    >
                      E{g.n}
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-(--lp-ink)">{g.name}</span>
                      <span className="block truncate text-[12.5px] text-(--lp-ink-3)">{g.source}</span>
                    </span>
                    <span className="relative hidden items-end gap-px sm:flex" aria-hidden>
                      {Array.from({ length: 7 }, (_, k) => (
                        <Cube key={k} i={k} color={palette.ev[i]} show={k < 7 - i} />
                      ))}
                    </span>
                    {canVerify(g.n) && (
                      <span
                        className="relative grid size-6 shrink-0 place-items-center rounded-full"
                        style={{ background: palette.status.verified.bg, color: palette.status.verified.fg }}
                        title="May say verified"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                          <path d="M2 6.5 L5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                    {!canVerify(g.n) && <span className="relative size-6 shrink-0" aria-hidden />}
                  </button>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="min-w-0 lg:sticky lg:top-28">
          <div className="relative overflow-hidden rounded-[20px] border border-(--lp-line) bg-white p-6 sm:p-8" aria-live="polite">
            <motion.div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1.5"
              initial={false}
              animate={{ backgroundColor: color }}
              transition={{ duration: dur.ui }}
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={r.n}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: dur.ui, ease: ease.out }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="lp-mono grid h-11 w-14 place-items-center rounded-[10px] text-[17px] font-bold"
                    style={{
                      background: color,
                      color: sel >= 5 ? palette.ink : "white",
                      boxShadow: "inset 0 -5px 0 rgb(0 0 0 / 0.2), inset 0 1px 0 rgb(255 255 255 / 0.3)",
                    }}
                  >
                    E{r.n}
                  </span>
                  <div>
                    <p className="lp-display text-[26px] leading-none font-semibold tracking-[-0.02em]">{r.name}</p>
                    <p className="mt-1 text-[12.5px] text-(--lp-ink-3)">Rung {r.n} of 7</p>
                  </div>
                </div>

                <p className="mt-5 text-[16px] leading-relaxed text-(--lp-ink)">{r.meaning}</p>

                <div className="mt-5 rounded-[14px] border border-(--lp-line) bg-(--lp-surface-2) p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="lp-eyebrow">Example finding</p>
                    {r.simulated && <SimTag>SIMULATED REGISTRY</SimTag>}
                  </div>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-(--lp-ink)">{r.example}</p>
                  <span
                    className="mt-3 inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] font-semibold"
                    style={{ background: st.bg, color: st.fg }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: st.dot }} />
                    {r.chip}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[14px] border border-(--lp-line) p-4">
                    <dt className="lp-eyebrow">May say “verified”</dt>
                    <dd
                      className="mt-2 text-[15px] font-semibold"
                      style={{ color: canVerify(r.n) ? palette.status.verified.fg : palette.status.mismatch.fg }}
                    >
                      {canVerify(r.n) ? "Yes, for what it covers" : "No"}
                    </dd>
                  </div>
                  <div className="rounded-[14px] border border-(--lp-line) p-4">
                    <dt className="lp-eyebrow">Words it may use</dt>
                    <dd className="lp-mono mt-2 text-[12.5px] text-(--lp-ink-2)">{r.words}</dd>
                  </div>
                </dl>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>

      <Reveal className="mt-14">
        <figure className="relative overflow-hidden rounded-[28px] bg-(--lp-pupil) px-6 py-10 text-white sm:px-12 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full opacity-40 blur-3xl"
            style={{ background: `radial-gradient(circle, ${palette.brand[500]}, transparent 70%)` }}
          />
          <p className="lp-eyebrow text-white/55!">Design principle</p>
          <blockquote className="lp-display relative mt-4 max-w-4xl text-[28px] leading-[1.12] font-semibold sm:text-[40px]">
            “The applicant's signature proves who uploaded the NOC, not who issued it.”
          </blockquote>
          <figcaption className="relative mt-5 max-w-2xl text-[15.5px] leading-relaxed text-white/70">
            A signature proves who signed and that the bytes did not change. It says nothing about whether the content is
            true. The applicant's own signature on an upload is evidence about the upload, not about the certificate
            inside it, so Pramana keeps checking down the ladder.
          </figcaption>
        </figure>
      </Reveal>
    </Section>
  );
}
