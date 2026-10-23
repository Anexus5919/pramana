import { Info } from "lucide-react";
import { motion } from "motion/react";
import { Reveal, Section } from "../kit";
import { Count } from "./a/Count";
import { FieldGrid } from "./a/FieldGrid";

type Stat = { value: number; decimals?: number; prefix?: string; of?: string; unit?: string; label: string; sub: string };

// Held-out layouts the models never saw in training; 60 synthetic documents, same prompts for both
const FT_ROWS: { label: string; base: number; tuned: number; fmt: (v: number) => string; better: "higher" | "lower"; max: number }[] = [
  { label: "Values copied exactly", base: 0.874, tuned: 0.922, fmt: (v) => `${Math.round(v * 100)}%`, better: "higher", max: 1 },
  { label: "Empty fields left empty", base: 0.667, tuned: 1, fmt: (v) => `${Math.round(v * 100)}%`, better: "higher", max: 1 },
  { label: "Planted instructions followed", base: 3, tuned: 1, fmt: (v) => `${v} of 8`, better: "lower", max: 8 },
  { label: "Seconds per document", base: 2.08, tuned: 1.08, fmt: (v) => `${v.toFixed(1)} s`, better: "lower", max: 2.5 },
];

function FineTune() {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 sm:p-8 lp-shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="lp-display text-[22px] font-semibold tracking-[-0.02em] text-(--lp-ink)">
          We fine-tuned a smaller model to do this one job
        </h3>
        <p className="text-[13px] text-(--lp-ink-3)">Qwen3 1.7B, QLoRA on 2,400 synthetic prompts, 23 min on a free GPU</p>
      </div>
      <div className="mt-6 grid gap-5">
        {FT_ROWS.map((r) => (
          <div key={r.label} className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
            <p className="text-[14px] font-medium text-(--lp-ink-2)">{r.label}</p>
            <div className="grid gap-1.5">
              {(["base", "tuned"] as const).map((k) => {
                const v = r[k];
                const tuned = k === "tuned";
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12px] text-(--lp-ink-3)">{tuned ? "Fine-tuned 1.7B" : "General 4B"}</span>
                    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-(--lp-brand-50)">
                      <motion.div
                        className={`absolute inset-y-0 left-0 rounded-full ${tuned ? "bg-(--lp-brand-500)" : "bg-(--lp-ink-4)"}`}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(v / r.max) * 100}%` }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: tuned ? 0.15 : 0 }}
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
        Measured on 60 held-out documents with label wordings and layouts never seen in training. The model only proposes values;
        a value is kept only when it is found on the page, so a wrong proposal becomes a manual review, never a wrong fact.
      </p>
    </div>
  );
}

const STATS: Stat[] = [
  { value: 42, of: "of 42", label: "planted conditions found", sub: "Across 11 synthetic applications, deterministic mode." },
  { value: 0, label: "false alarms", sub: "On the benign control set." },
  { value: 323, of: "of 328", label: "printed fields read by patterns", sub: "The 5 misses are all in one unfamiliar issuer layout." },
  { value: 1.1, decimals: 1, prefix: "~", unit: "s", label: "per validation run", sub: "About 1.1 seconds on a laptop CPU." },
  { value: 22, label: "automated tests", sub: "Run on every change to the checks." },
  { value: 29, label: "cited APH rules", sub: "Each finding names its annexure and page." },
];

export default function HonestNumbers() {
  return (
    <Section
      id="numbers"
      eyebrow="Evaluation"
      title="Honest numbers."
      lede="What the prototype does on the team's synthetic test set, including the one place the model was led astray."
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
                  suffix={s.unit ? ` ${s.unit}` : ""}
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
            The model was fooled once.{" "}
            <span className="block bg-[linear-gradient(90deg,#8b3dff,#d0559a)] bg-clip-text text-transparent">The evidence check was not.</span>
          </blockquote>
          <figcaption className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-(--lp-ink-2)">
            On the unfamiliar layout, a general local model (Qwen3 4B) recovered 4 of the 5 missed fields. Its 5th proposal was a value
            planted by a hidden instruction line. Grounding found it nowhere on the printed page and rejected it. Our fine-tuned extractor
            read that field correctly and ignored the instruction.
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
            <p className="text-[13px] text-(--lp-ink-3)">Hover or tab through the 5 misses</p>
          </div>
          <FieldGrid />
        </div>
      </Reveal>

      <Reveal className="mt-8">
        <p className="mx-auto flex max-w-3xl items-start justify-center gap-2.5 rounded-[14px] border border-(--lp-manual-dot)/35 bg-(--lp-manual-bg) px-4 py-3 text-[14px] leading-snug font-medium text-(--lp-manual-fg)">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          Measured on synthetic data generated by the team: an upper bound, not field accuracy.
        </p>
      </Reveal>
    </Section>
  );
}
