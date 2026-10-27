import { motion } from "motion/react";
import { Reveal, Section } from "../kit";
import { Count } from "./a/Count";
import { FieldGrid } from "./a/FieldGrid";

type Stat = { value: number; decimals?: number; prefix?: string; of?: string; suffix?: string; label: string; sub: string };

type Model = "general" | "cloud" | "tuned";

const MODELS: { id: Model; label: string }[] = [
  { id: "general", label: "General 4B" },
  { id: "cloud", label: "Cloud 20B" },
  { id: "tuned", label: "Our 1.7B v2" },
];

// 200 held-out documents with label wordings and layouts never seen in training, same prompts for every model
const FT_ROWS: { label: string; values: Record<Model, number>; fmt: (v: number) => string; max: number }[] = [
  { label: "Fields fully correct", values: { general: 0.825, cloud: 0.891, tuned: 0.947 }, fmt: (v) => `${(v * 100).toFixed(1)}%`, max: 1 },
  { label: "Absent fields left empty", values: { general: 0.542, cloud: 0.594, tuned: 1 }, fmt: (v) => `${Math.round(v * 100)}%`, max: 1 },
  { label: "Hidden instructions followed", values: { general: 9, cloud: 3, tuned: 0 }, fmt: (v) => `${v} of 30`, max: 30 },
  { label: "Seconds per document", values: { general: 1.71, cloud: 4.95, tuned: 1.1 }, fmt: (v) => `${v.toFixed(1)} s`, max: 5 },
];

function FineTune() {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 sm:p-8 lp-shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="lp-display text-[22px] font-semibold tracking-[-0.02em] text-(--lp-ink)">
          We fine-tuned a smaller model to do this one job
        </h3>
        <p className="text-[13px] text-(--lp-ink-3)">pramana-extract-v2: Qwen3 1.7B, QLoRA, runs on the laptop</p>
      </div>
      <div className="mt-6 grid gap-5">
        {FT_ROWS.map((r) => (
          <div key={r.label} className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
            <p className="text-[14px] font-medium text-(--lp-ink-2)">{r.label}</p>
            <div className="grid gap-1.5">
              {MODELS.map((m, i) => {
                const v = r.values[m.id];
                const tuned = m.id === "tuned";
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12px] text-(--lp-ink-3)">{m.label}</span>
                    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-(--lp-brand-50)">
                      <motion.div
                        className={`absolute inset-y-0 left-0 rounded-full ${tuned ? "bg-(--lp-brand-500)" : "bg-(--lp-ink-4)"}`}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(v / r.max) * 100}%` }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }}
                      />
                    </div>
                    <span className={`w-16 shrink-0 text-right text-[13px] tabular-nums ${tuned ? "font-semibold text-(--lp-ink)" : "text-(--lp-ink-3)"}`}>
                      {r.fmt(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-(--lp-ink-3)">
        Measured on 200 held-out documents with label wordings and layouts never seen in training. The cloud model is GPT-OSS 20B, for comparison
        only; its time includes the network. Our model keeps document text on the machine. It only proposes values: a value is kept only when it is
        found on the page, so a wrong proposal becomes a manual review, never a wrong fact.
      </p>
    </div>
  );
}

const STATS: Stat[] = [
  { value: 54, of: "of 54", label: "planted conditions found", sub: "11 test applications, 83 documents. 0 false positives." },
  {
    value: 100,
    suffix: "%",
    label: "recall and precision on fresh seeds",
    sub: "Randomised blind test, rerun it with any seed: 200 new applications, 0 false alarms on the 55 clean ones. Before the fixes, 300 applications over 3 seeds gave 99.2% recall and 91.6% precision.",
  },
  { value: 18, of: "of 18", label: "everyday edits caught", sub: "Certificate edits made with Edge, a PDF reader, Word, LibreOffice, a PDF printer or a phone camera." },
  { value: 9, label: "real signed e-Gazettes verified", sub: "Government of India PDFs, each signature checked offline against the CCA India roots. 0 false indicators." },
  { value: 328, of: "of 328", label: "printed fields read", sub: "323 by rules alone. Our fine-tuned model reads the 5 in the one unfamiliar issuer layout, each grounded on the page." },
  { value: 220, label: "automated tests", sub: "Run on every change to the checks." },
];

export default function HonestNumbers() {
  return (
    <Section
      id="numbers"
      eyebrow="Evaluation"
      title="Measured results."
      lede="What Pramana finds on its test applications, on a randomised blind test anyone can rerun, and on real signed Government documents."
    >
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05} className="h-full">
            <div className="group h-full rounded-[20px] border border-(--lp-line) bg-white p-6 transition-shadow duration-300 hover:shadow-[0_18px_40px_-20px_rgb(60_20_110/0.3)]">
              <p className="lp-display flex items-baseline gap-2 text-(--lp-ink)">
                <Count
                  value={s.value}
                  decimals={s.decimals ?? 0}
                  prefix={s.prefix}
                  suffix={s.suffix ?? ""}
                  className="text-[52px] leading-none font-semibold"
                />
                {s.of && <span className="text-[20px] font-semibold tracking-[-0.02em] text-(--lp-ink-3)">{s.of}</span>}
              </p>
              <p className="mt-3 text-[15px] font-semibold text-(--lp-ink)">{s.label}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-(--lp-ink-3)">{s.sub}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-20">
        <figure className="relative mx-auto max-w-4xl text-center">
          <blockquote className="lp-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-(--lp-ink) sm:text-[42px]">
            A general model was fooled once.{" "}
            <span className="block bg-[linear-gradient(90deg,#8b3dff,#d0559a)] bg-clip-text text-transparent">The evidence check was not.</span>
          </blockquote>
          <figcaption className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-(--lp-ink-2)">
            On the unfamiliar layout, a general local model (Qwen3 4B) proposed a validity date planted by a hidden instruction line. Grounding found it
            only in that flagged line and rejected it. Our fine-tuned extractor reads all five fields of that certificate correctly and ignores the
            instruction.
          </figcaption>
        </figure>
      </Reveal>

      <Reveal className="mt-14">
        <FineTune />
      </Reveal>

      <Reveal className="mt-14">
        <div className="rounded-[28px] border border-white/70 bg-[linear-gradient(150deg,#fff3ea_0%,#fdeef5_55%,#f1ebff_100%)] p-5 sm:p-8 lp-shadow-md">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="lp-display text-[22px] font-semibold tracking-[-0.02em] text-(--lp-ink)">All 328 printed fields</h3>
            <p className="text-[13px] text-(--lp-ink-3)">Hover or tab through the 5 the model reads</p>
          </div>
          <FieldGrid />
        </div>
      </Reveal>
    </Section>
  );
}
