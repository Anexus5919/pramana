import { Scale } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal, Section, ease, spring } from "../kit";
import { palette } from "../palette";

type Tool = { name: string; role: string };
type Layer = { name: string; color: string; tools: Tool[] };

const LAYERS: Layer[] = [
  {
    name: "Read",
    color: palette.brand[300],
    tools: [
      { name: "RapidOCR", role: "Reads scanned pages into word boxes with their coordinates." },
      { name: "OpenCV", role: "Decodes QR codes and compares images to find reused photos." },
    ],
  },
  {
    name: "Verify",
    color: palette.ev[1],
    tools: [{ name: "pyHanko", role: "Validates PDF signatures up to the CCA India root and spots edits made after signing." }],
  },
  {
    name: "Serve",
    color: palette.brand[500],
    tools: [{ name: "FastAPI", role: "Runs the checks, the review API and the hash-chained audit log." }],
  },
  {
    name: "Show",
    color: "#d0559a",
    tools: [
      { name: "React", role: "The reviewer workspace you are about to open." },
      { name: "three.js", role: "Draws the moving block floor and the hands at the top of this page." },
    ],
  },
  {
    name: "Assist",
    color: palette.ev[5],
    tools: [{ name: "Qwen3 local model", role: "Optional. Proposes values for unfamiliar layouts on the laptop; grounding decides what is kept." }],
  },
];

const ALL = LAYERS.flatMap((l) => l.tools.map((t) => ({ ...t, layer: l.name, color: l.color })));

export default function BuiltInOpen() {
  const [sel, setSel] = useState<string | null>(null);
  const active = ALL.find((t) => t.name === sel);
  return (
    <Section
      id="open"
      eyebrow="Stack"
      title="Built in the open."
      lede="Every component is free and open source, so a state board can run, audit and extend it without a licence."
    >
      <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Reveal>
          <div className="rounded-[28px] border border-(--lp-line) bg-white p-5 sm:p-7 lp-shadow-md" onPointerLeave={() => setSel(null)}>
            <ul className="space-y-2.5">
              {LAYERS.map((l) => {
                const lit = active?.layer === l.name;
                return (
                  <li key={l.name} className="flex items-center gap-4">
                    <span
                      className={`lp-eyebrow w-14 shrink-0 transition-colors duration-200 ${lit ? "text-(--lp-ink)!" : ""}`}
                    >
                      {l.name}
                    </span>
                    <div className="flex flex-1 flex-wrap gap-2 border-l border-(--lp-line) pl-4">
                      {l.tools.map((t) => {
                        const on = sel === t.name;
                        return (
                          <motion.button
                            key={t.name}
                            type="button"
                            onPointerEnter={() => setSel(t.name)}
                            onFocus={() => setSel(t.name)}
                            onBlur={() => setSel(null)}
                            onClick={() => setSel(t.name)}
                            aria-describedby="stack-role"
                            animate={{ y: on ? -2 : 0 }}
                            transition={spring.snappy}
                            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[14px] font-semibold transition-[border-color,background-color,box-shadow] duration-200 ${
                              on
                                ? "border-transparent bg-(--lp-ink) text-white shadow-[0_10px_24px_-12px_rgb(28_22_34/0.6)]"
                                : "border-(--lp-line-2) bg-(--lp-surface) text-(--lp-ink) hover:border-(--lp-ink-4)"
                            }`}
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                              <polygon points="7,1 13,4 7,7 1,4" fill={l.color} opacity={0.55} />
                              <polygon points="1,4 7,7 7,13 1,10" fill={l.color} />
                              <polygon points="7,7 13,4 13,10 7,13" fill={l.color} opacity={0.8} />
                            </svg>
                            {t.name}
                          </motion.button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div id="stack-role" className="mt-6 min-h-[52px] rounded-[14px] bg-(--lp-surface-2) px-4 py-3" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={active?.name ?? "none"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: ease.out }}
                  className="text-[14.5px] leading-snug text-(--lp-ink-2)"
                >
                  {active ? (
                    <>
                      <span className="font-semibold text-(--lp-ink)">{active.name}.</span> {active.role}
                    </>
                  ) : (
                    "Point at a component to see the job it does in Pramana."
                  )}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-(--lp-pupil) p-7 text-white sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-60 blur-3xl"
              style={{ background: "radial-gradient(circle, rgb(139 61 255 / 0.55), transparent 65%)" }}
            />
            <Scale aria-hidden className="relative size-6 text-(--lp-brand-300)" />
            <p className="lp-eyebrow relative mt-6 text-white/55!">The principle</p>
            <p className="lp-display relative mt-2 text-[40px] leading-[1.02] font-semibold">Decision support only.</p>
            <ul className="relative mt-6 space-y-3 text-[15px] leading-snug text-white/75">
              <li className="flex gap-3">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-[2px] bg-(--lp-brand-300)" />
                Findings are preliminary indicators, never verdicts on an institution.
              </li>
              <li className="flex gap-3">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-[2px] bg-(--lp-brand-300)" />
                Officials decide, and every accept or dismiss records a reason.
              </li>
              <li className="flex gap-3">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-[2px] bg-(--lp-brand-300)" />
                Anything simulated is labelled SIMULATED where it appears.
              </li>
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
