import { ArrowUpRight } from "lucide-react";
import { useInView } from "motion/react";
import { useRef } from "react";
import { useCountUp, useReducedMotionPref } from "../lib/hooks";

type Case = {
  value: number;
  decimals: number;
  unit: string;
  headline: string;
  body: string;
  quote?: string;
  where: string;
  source: string;
  href: string;
  tone: string;
};

const CASES: Case[] = [
  {
    value: 353,
    decimals: 0,
    unit: "teachers",
    headline: "listed as faculty at more than one college.",
    body: "One professor appeared on the rolls of 11 colleges at once.",
    where: "Anna University affiliations, Tamil Nadu",
    source: "The News Minute",
    href: "https://thenewsminute.com/tamil-nadu/same-prof-in-11-colleges-ngo-exposes-alleged-fraud-in-anna-university-affiliation",
    tone: "bg-rose",
  },
  {
    value: 8,
    decimals: 0,
    unit: "colleges",
    headline: "booked over fire safety certificates.",
    body: "The headline, in its own words:",
    quote: "Eight private colleges booked for submitting fake fire NOCs",
    where: "Hyderabad, August 2026",
    source: "Careers360",
    href: "https://news.careers360.com/hyderabad-eight-private-colleges-booked-for-submitting-fake-fire-nocs-telangana-board-intermediate-education-college-managements",
    tone: "bg-tang",
  },
  {
    value: 10.29,
    decimals: 2,
    unit: "acres",
    headline: "shown under three different deeds.",
    body: "Vigilance red-flagged the same land in an affiliation process.",
    where: "JNTU Hyderabad affiliations",
    source: "Deccan Chronicle",
    href: "https://www.deccanchronicle.com/southern-states/telangana/vigilance-red-flags-faulty-affiliation-process-at-jntu-h-1893724",
    tone: "bg-sun",
  },
];

function CaseCard({ c, run, instant }: { c: Case; run: boolean; instant: boolean }) {
  const shown = useCountUp(c.value, run, c.decimals, 1400, instant);
  return (
    <article data-look className={`flex flex-col rounded-[32px] ${c.tone} p-7 text-ink sm:p-8`}>
      <p className="text-[0.8rem] font-bold tracking-[0.14em] uppercase">{c.where}</p>
      <p className="mt-6 font-display leading-none font-[800]" aria-label={`${c.value} ${c.unit}`}>
        <span aria-hidden className="text-[clamp(4rem,7vw,6.2rem)] tabular-nums">
          {shown}
        </span>
        <span aria-hidden className="ml-2 text-[1.5rem] font-[650]">
          {c.unit}
        </span>
      </p>
      <p className="mt-3 font-display text-[1.45rem] leading-tight font-[650]">{c.headline}</p>
      <p className="mt-4 text-[1rem] leading-relaxed">{c.body}</p>
      {c.quote && (
        <blockquote className="mt-2 rounded-2xl bg-white/85 px-4 py-3 text-[0.98rem] leading-snug font-semibold">
          "{c.quote}"
        </blockquote>
      )}
      <a
        href={c.href}
        target="_blank"
        rel="noreferrer"
        className="mt-auto inline-flex items-center gap-1.5 self-start pt-7 text-[0.95rem] font-bold"
      >
        <span className="underline-link">Read the report in {c.source}</span>
        <ArrowUpRight className="size-4" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </article>
  );
}

export function SlipsThrough() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduced = useReducedMotionPref();
  return (
    <section aria-labelledby="slips-title" className="bg-paper px-5 py-24 sm:px-10 sm:py-32">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <h2 id="slips-title" className="font-display text-[clamp(2.4rem,5vw,4.8rem)] leading-[0.98] font-[800]">
            What slips through today.
          </h2>
          <p className="max-w-[36rem] text-[1.1rem] leading-relaxed text-ink-2">
            Three reported cases. Each turns on papers that did not agree with their evidence, or with each other. These
            are the gaps Pramana is built to show early.
          </p>
        </div>
        <div ref={ref} className="mt-12 grid gap-5 md:grid-cols-3">
          {CASES.map((c) => (
            <CaseCard key={c.source} c={c} run={inView} instant={reduced} />
          ))}
        </div>
      </div>
    </section>
  );
}
