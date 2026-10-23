import type { ReactNode } from "react";
import { IntakeGlyph, ReadGlyph, RulesGlyph } from "../illustrations/Glyphs";
import { Hand } from "../illustrations/Hand";

type Step = { name: string; text: string; tone: string; art: ReactNode; artLabel: string };

const STEPS: Step[] = [
  {
    name: "Intake",
    text: "Every document in the application comes in: forms, certificates, scans and photos.",
    tone: "bg-cream",
    art: <IntakeGlyph />,
    artLabel: "A small stack of documents with an eye on top",
  },
  {
    name: "Understand",
    text: "A small model that runs locally reads each page and pulls out the fields: names, numbers, dates, signatories.",
    tone: "bg-rose-soft",
    art: <ReadGlyph />,
    artLabel: "An eye reading lines of text",
  },
  {
    name: "Verify",
    text: "Signatures are checked against India PKI, QR codes against their issuers, records against issuer registries.",
    tone: "bg-sun",
    art: (
      <Hand hue="tang" pose="ok" height={500} top={40} className="mx-auto h-full w-auto overflow-visible" eye={{ look: "auto" }} />
    ),
    artLabel: "A hand making an OK sign around an eye: confirmed",
  },
  {
    name: "Check",
    text: "29 APH rules run on the facts, each finding citing its rule. Edits after signing and links across applications surface here.",
    tone: "bg-tang-soft",
    art: <RulesGlyph />,
    artLabel: "A list of rule checks, one of them flagged",
  },
  {
    name: "Review",
    text: "An official reads each finding with its evidence and decides. Pramana never approves or rejects.",
    tone: "bg-white",
    art: (
      <Hand hue="rose" mirror pose="open" height={500} top={40} className="mx-auto h-full w-auto overflow-visible" eye={{ look: "auto" }} />
    ),
    artLabel: "An open palm with an eye: a person decides",
  },
];

export function HowItReads() {
  return (
    <section id="how" aria-labelledby="how-title" className="bg-paper px-5 pb-24 sm:px-10 sm:pb-32">
      <div className="mx-auto max-w-[1400px] rounded-[40px] bg-ink/[0.035] px-5 py-14 sm:rounded-[56px] sm:px-10 sm:py-20">
        <div className="max-w-[46rem]">
          <p className="text-[0.8rem] font-bold tracking-[0.14em] text-ink-2 uppercase">Five steps, in order</p>
          <h2 id="how-title" className="mt-3 font-display text-[clamp(2.4rem,5vw,4.8rem)] leading-[0.98] font-[800]">
            How it reads an application.
          </h2>
        </div>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.name} data-look className={`flex flex-col rounded-[28px] ${s.tone} p-6 ${s.tone === "bg-white" ? "ring-2 ring-ink/10" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-full bg-ink font-display text-[1rem] font-[800] text-white">
                  {i + 1}
                </span>
              </div>
              <div role="img" aria-label={s.artLabel} className="mt-3 h-36 overflow-hidden">
                {s.art}
              </div>
              <h3 className="mt-4 font-display text-[1.65rem] leading-none font-[780]">{s.name}</h3>
              <p className="mt-3 text-[0.98rem] leading-relaxed text-ink">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
