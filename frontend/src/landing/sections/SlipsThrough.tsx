import { ArrowUpRight } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { Reveal, Section, ease } from "../kit";
import { Count } from "./a/Count";
import { palette } from "../palette";
import { IsoCube, SpotlightCard, cubeIdle, cubeRose, cubeViolet } from "./a/SpotlightCard";

// 1 teacher, 11 colleges: lines draw out and each college block lights as the same faculty ID is found there
function TeacherVisual({ active, run }: { active: boolean; run: number }) {
  const reduced = useReducedMotion();
  const colleges = Array.from({ length: 11 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return { cx: 172 + col * 40 + (row % 2) * 20, cy: 40 + row * 44 };
  });
  const step = reduced ? 0 : 0.09;
  return (
    <svg viewBox="0 0 320 170" className="h-full w-full" role="img" aria-label="One faculty ID linked to eleven colleges">
      <g key={run}>
        {colleges.map((c, i) => (
          <motion.path
            key={`l${i}`}
            d={`M 70 86 C 118 86, ${c.cx - 50} ${c.cy}, ${c.cx - 14} ${c.cy - 2}`}
            fill="none"
            stroke={palette.brand[400]}
            strokeWidth={1.25}
            strokeLinecap="round"
            initial={{ pathLength: reduced ? 1 : 0, opacity: 0.25 }}
            animate={active ? { pathLength: 1, opacity: 0.85 } : {}}
            transition={{ duration: reduced ? 0 : 0.45, ease: ease.out, delay: 0.2 + i * step }}
          />
        ))}
        {colleges.map((c, i) => (
          <IsoCube
            key={`c${i}`}
            cx={c.cx}
            cy={c.cy}
            s={13}
            from={reduced ? undefined : cubeIdle}
            faces={active ? (i === 10 ? cubeRose : cubeViolet) : cubeIdle}
            delay={reduced ? 0 : 0.5 + i * step}
          />
        ))}
      </g>
      <circle cx="48" cy="86" r="24" fill={palette.brand[500]} />
      <circle cx="48" cy="79" r="7" fill="#fff" />
      <path d="M 35 99 C 37 89, 59 89, 61 99" fill="#fff" />
      <text x="48" y="128" textAnchor="middle" className="lp-mono" fontSize="9" fill={palette.ink3}>
        1 FACULTY ID
      </text>
      <motion.text
        x="230"
        y="162"
        textAnchor="middle"
        className="lp-mono"
        fontSize="9"
        fill={palette.status.mismatch.fg}
        initial={{ opacity: reduced ? 1 : 0 }}
        animate={active ? { opacity: 1 } : {}}
        transition={{ delay: reduced ? 0 : 1.6, duration: 0.4 }}
      >
        FULL-TIME AT 11 COLLEGES
      </motion.text>
    </svg>
  );
}

// A fire NOC whose signature draws in, then the issuer lookup comes back with no record
function NocVisual({ active, run }: { active: boolean; run: number }) {
  const reduced = useReducedMotion();
  const d = reduced ? 0 : 1;
  return (
    <div className="relative flex h-full items-center justify-center" role="img" aria-label="Fire NOC whose signature has no matching issuer record">
      <motion.div
        key={run}
        className="relative h-[136px] w-[168px] rounded-[10px] border border-(--lp-line-2) bg-white p-3 shadow-[0_14px_30px_-16px_rgb(60_20_110/0.35)]"
        initial={{ rotate: -3 }}
        animate={{ rotate: active ? -2 : -3 }}
      >
        <p className="lp-mono text-[7.5px] font-semibold tracking-[0.12em] text-(--lp-ink-3)">FIRE SAFETY NOC</p>
        <div className="mt-2 space-y-1.5">
          <div className="h-[5px] w-[86%] rounded-full bg-(--lp-surface-3)" />
          <div className="h-[5px] w-[70%] rounded-full bg-(--lp-surface-3)" />
          <div className="h-[5px] w-[78%] rounded-full bg-(--lp-surface-3)" />
        </div>
        <svg viewBox="0 0 150 60" className="absolute right-2 bottom-2 left-2 h-[58px]" aria-hidden>
          <circle cx="28" cy="32" r="19" fill="none" stroke={palette.brand[300]} strokeWidth="1.5" strokeDasharray="3 2.5" />
          <text x="28" y="35" textAnchor="middle" fontSize="7" className="lp-mono" fill={palette.brand[400]}>
            SEAL
          </text>
          <motion.path
            d="M 66 40 C 72 18, 80 18, 79 34 C 78 46, 86 22, 94 26 C 100 30, 96 42, 104 36 C 110 31, 116 28, 130 30"
            fill="none"
            stroke={palette.ink}
            strokeWidth="1.6"
            strokeLinecap="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={active ? { pathLength: 1 } : {}}
            transition={{ duration: 0.9 * d, ease: ease.inOut, delay: 0.2 * d }}
          />
          <motion.path
            d="M 14 18 L 24 28 L 20 34 L 32 44 L 40 50"
            fill="none"
            stroke={palette.status.mismatch.dot}
            strokeWidth="1.6"
            strokeLinecap="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={active ? { pathLength: 1 } : {}}
            transition={{ duration: 0.35 * d, delay: 1.5 * d }}
          />
        </svg>
      </motion.div>
      <motion.div
        key={`chip${run}`}
        className="absolute right-2 bottom-3 flex items-center gap-1.5 rounded-full border border-(--lp-mismatch-dot)/30 bg-(--lp-mismatch-bg) px-2.5 py-1 text-[10.5px] font-semibold text-(--lp-mismatch-fg) shadow-sm sm:right-4"
        initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
        animate={active ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 1.75 * d, duration: 0.4, ease: ease.out }}
      >
        <span className="size-1.5 rounded-full bg-(--lp-mismatch-dot)" />
        Issuer registry: no record
      </motion.div>
    </div>
  );
}

const PLOT = "M 112 64 L 210 54 L 236 126 L 100 136 Z";

// Three deeds slide onto one plot and land exactly on top of each other; hovering fans them back out
function DeedVisual({ active, fanned }: { active: boolean; fanned: boolean }) {
  const reduced = useReducedMotion();
  const starts = [
    { x: -78, y: -14, r: -8 },
    { x: 0, y: -34, r: 0 },
    { x: 78, y: -14, r: 8 },
  ];
  const fan = [
    { x: -34, y: 8, r: -5 },
    { x: 0, y: -4, r: 0 },
    { x: 34, y: 8, r: 5 },
  ];
  const labels = ["DEED A", "DEED B", "DEED C"];
  const strokes = [palette.brand[300], palette.brand[500], palette.brand[700]];
  return (
    <svg viewBox="0 0 320 170" className="h-full w-full" role="img" aria-label="Three deeds that all describe the same 10.29 acre plot">
      <motion.path
        d={PLOT}
        initial={{ fill: "rgb(248 205 224 / 0)" }}
        animate={{ fill: active && !fanned ? "rgb(229 72 77 / 0.12)" : "rgb(248 205 224 / 0)" }}
        transition={{ delay: active && !fanned && !reduced ? 1.3 : 0, duration: 0.4 }}
        stroke={palette.line2}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {starts.map((s, i) => {
        const target = !active ? s : fanned ? fan[i] : { x: 0, y: 0, r: 0 };
        return (
          <motion.g
            key={i}
            initial={reduced ? false : { x: s.x, y: s.y, rotate: s.r, opacity: 0.4 }}
            animate={{ x: target.x, y: target.y, rotate: target.r, opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.7, ease: ease.out, delay: active && !fanned && !reduced ? 0.25 + i * 0.28 : 0 }}
            style={{ transformBox: "view-box", transformOrigin: "168px 95px" }}
          >
            <path d={PLOT} fill="none" stroke={strokes[i]} strokeWidth={1.8} strokeLinejoin="round" />
            <text x={112 + i * 6} y={58 - i * 0} fontSize="8" className="lp-mono" fill={strokes[i]} opacity={fanned || !active ? 1 : 0}>
              {labels[i]}
            </text>
          </motion.g>
        );
      })}
      <motion.text
        x="168"
        y="102"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        className="lp-mono"
        fill={palette.status.mismatch.fg}
        initial={{ opacity: reduced ? 1 : 0 }}
        animate={{ opacity: active && !fanned ? 1 : 0 }}
        transition={{ delay: active && !fanned && !reduced ? 1.35 : 0, duration: 0.3 }}
      >
        3 DEEDS, 1 PLOT
      </motion.text>
      <text x="168" y="160" textAnchor="middle" fontSize="9" className="lp-mono" fill={palette.ink3}>
        {fanned ? "THREE DEEDS, SAME BOUNDARY" : "SAME 10.29 ACRES"}
      </text>
    </svg>
  );
}

type CaseCard = {
  key: string;
  value: number;
  decimals?: number;
  unit: string;
  body: string;
  source: string;
  where: string;
  href: string;
  visual: (s: { active: boolean; run: number; hovered: boolean }) => ReactNode;
};

const CASES: CaseCard[] = [
  {
    key: "faculty",
    value: 353,
    unit: "teachers",
    body: "listed as full-time faculty at more than one engineering college at the same time. One name appeared at 11.",
    source: "The News Minute",
    where: "Anna University affiliation, 2023-24",
    href: "https://thenewsminute.com/tamil-nadu/same-prof-in-11-colleges-ngo-exposes-alleged-fraud-in-anna-university-affiliation",
    visual: ({ active, run }) => <TeacherVisual active={active} run={run} />,
  },
  {
    key: "noc",
    value: 8,
    unit: "colleges",
    body: "in Hyderabad booked for submitting fire safety NOCs carrying the signatures of officials who never signed them.",
    source: "Careers360",
    where: "Telangana, August 2026",
    href: "https://news.careers360.com/hyderabad-eight-private-colleges-booked-for-submitting-fake-fire-nocs-telangana-board-intermediate-education-college-managements",
    visual: ({ active, run }) => <NocVisual active={active} run={run} />,
  },
  {
    key: "land",
    value: 10.29,
    decimals: 2,
    unit: "acres",
    body: "of the same land shown under three different deeds to meet the land requirement, flagged by university vigilance.",
    source: "Deccan Chronicle",
    where: "JNTU-H vigilance, 2024",
    href: "https://www.deccanchronicle.com/southern-states/telangana/vigilance-red-flags-faulty-affiliation-process-at-jntu-h-1893724",
    visual: ({ active, hovered }) => <DeedVisual active={active} fanned={hovered} />,
  },
];

function Case({ c, index }: { c: CaseCard; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useInView(ref, { once: true, margin: "0px 0px -18% 0px" });
  const [run, setRun] = useState(0);
  const [hovered, setHovered] = useState(false);
  return (
    <Reveal delay={index * 0.08} className="h-full">
      <SpotlightCard
        className="flex h-full flex-col rounded-[20px] border border-(--lp-line) bg-white lp-shadow-md"
        onEnter={() => {
          setHovered(true);
          if (active && c.key !== "land") setRun((r) => r + 1);
        }}
        onLeave={() => setHovered(false)}
      >
        <div
          ref={ref}
          className="relative h-[190px] border-b border-(--lp-line) bg-[linear-gradient(160deg,#fff7f1_0%,#fdf0f6_55%,#f6f1ff_100%)] px-3 py-2"
        >
          {c.visual({ active, run, hovered })}
        </div>
        <div className="flex flex-1 flex-col p-6">
          <p className="lp-display flex items-baseline gap-2 text-(--lp-ink)">
            <Count value={c.value} decimals={c.decimals ?? 0} className="text-[52px] leading-none font-semibold" />
            <span className="text-[19px] font-semibold tracking-[-0.02em] text-(--lp-ink-2)">{c.unit}</span>
          </p>
          <p className="mt-3 flex-1 text-[15px] leading-relaxed text-(--lp-ink-2)">{c.body}</p>
          <a
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link mt-5 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-(--lp-ink-3) transition-colors hover:text-(--lp-brand-600)"
          >
            <span>
              <span className="font-semibold text-(--lp-ink-2) group-hover/link:text-(--lp-brand-600)">{c.source}</span> · {c.where}
            </span>
            <ArrowUpRight aria-hidden className="size-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </SpotlightCard>
    </Reveal>
  );
}

export default function SlipsThrough() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="What slips through today."
      lede="Approval scrutiny reads an application one document at a time. These cases were reported only after someone compared colleges, deeds and issuers side by side."
    >
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {CASES.map((c, i) => (
          <Case key={c.key} c={c} index={i} />
        ))}
      </div>
      <Reveal className="mt-16 md:mt-20" delay={0.1}>
        <p className="lp-display mx-auto max-w-4xl text-center text-[28px] leading-[1.12] font-semibold tracking-[-0.025em] text-(--lp-ink) sm:text-[36px]">
          Each passes document-by-document review.{" "}
          <span className="block bg-[linear-gradient(90deg,#8b3dff,#d0559a)] bg-clip-text text-transparent">None survives cross-checking.</span>
        </p>
      </Reveal>
    </Section>
  );
}
