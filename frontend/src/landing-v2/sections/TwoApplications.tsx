import { Link2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MiniEye } from "../illustrations/Glyphs";
import { useViewport } from "../lib/hooks";

const SHARED = { name: "Dr. S. Patil", role: "Assistant Professor, Civil", id: "FAC-MH-20417" };

const APPS = [
  {
    key: "kv",
    name: "Krishna Valley College",
    city: "Karad",
    tone: "bg-tang-soft",
    noc: "FNOC/KRD/2026/118",
    faculty: [
      { name: "Dr. R. Jadhav", role: "Professor, Mechanical", id: "FAC-MH-11873" },
      SHARED,
      { name: "Ms. P. Kulkarni", role: "Assistant Professor, Computer", id: "FAC-MH-30562" },
    ],
  },
  {
    key: "pg",
    name: "Panchganga Institute of Technology",
    city: "Kolhapur",
    tone: "bg-rose-soft",
    noc: "FNOC/KLP/2026/442",
    faculty: [
      { name: "Dr. M. Shinde", role: "Professor, Electrical", id: "FAC-MH-07741" },
      { name: "Mr. A. Pawar", role: "Assistant Professor, Civil", id: "FAC-MH-28890" },
      SHARED,
    ],
  },
];

function center(el: Element | null) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function TwoApplications() {
  const vp = useViewport();
  const [active, setActive] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const eyeRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const chipRefs = [useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null)];

  const draw = useCallback(() => {
    const box = boxRef.current?.getBoundingClientRect();
    const a = chipRefs[0].current?.getBoundingClientRect();
    const b = chipRefs[1].current?.getBoundingClientRect();
    if (!box || !a || !b) return;
    const side = b.left > a.right;
    if (side) {
      const x1 = a.right - box.left - 6;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left + 6;
      const y2 = b.top + b.height / 2 - box.top;
      const mx = (x1 + x2) / 2;
      setLine(`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
    } else {
      const x1 = a.left + a.width * 0.75 - box.left;
      const y1 = a.bottom - box.top - 4;
      const x2 = b.left + b.width * 0.75 - box.left;
      const y2 = b.top - box.top + 4;
      const off = Math.min(80, box.width * 0.18);
      setLine(`M ${x1} ${y1} C ${x1 + off} ${y1 + 60}, ${x2 + off} ${y2 - 60}, ${x2} ${y2}`);
    }
    // chip refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    draw();
  }, [draw, vp.w, vp.h, active]);

  const lookAt = (i: number) => (active ? () => center(eyeRefs[1 - i].current) : ("auto" as const));

  return (
    <section aria-labelledby="two-title" className="bg-paper px-5 py-24 sm:px-10 sm:py-32">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <h2 id="two-title" className="font-display text-[clamp(2.4rem,5vw,4.8rem)] leading-[0.98] font-[800]">
            Two applications tell the truth.
          </h2>
          <p className="max-w-[36rem] text-[1.1rem] leading-relaxed text-ink-2">
            Each application can look complete on its own. Pramana reads them together and links what they share: the same
            faculty member, the same fire NOC number, the same photo.
          </p>
        </div>

        <div ref={boxRef} className="relative mt-14 grid gap-16 md:grid-cols-2 md:gap-28">
          {APPS.map((app, i) => (
            <article key={app.key} className={`relative rounded-[32px] ${app.tone} p-6 sm:p-8`}>
              <header className="flex items-center gap-4">
                <div ref={eyeRefs[i]} className="shrink-0">
                  <MiniEye look={lookAt(i)} className="h-12 w-[4.2rem]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-[1.5rem] leading-tight font-[760]">{app.name}</h3>
                  <p className="text-[0.95rem] text-ink-2">
                    {app.city}. Application for 2026-27, synthetic.
                  </p>
                </div>
              </header>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-[0.9rem]">
                <div className="rounded-2xl bg-white/80 px-4 py-3">
                  <dt className="text-[0.72rem] font-bold tracking-wider text-ink-2 uppercase">Fire NOC</dt>
                  <dd className="mt-0.5 font-mono text-[0.85rem] font-medium">{app.noc}</dd>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-3">
                  <dt className="text-[0.72rem] font-bold tracking-wider text-ink-2 uppercase">Faculty on roll</dt>
                  <dd className="mt-0.5 font-mono text-[0.85rem] font-medium">{i === 0 ? "64 full time" : "71 full time"}</dd>
                </div>
              </dl>
              <p className="mt-6 text-[0.72rem] font-bold tracking-wider text-ink-2 uppercase">Faculty listed</p>
              <ul className="mt-2 grid gap-2">
                {app.faculty.map((f) => {
                  const shared = f.id === SHARED.id;
                  if (!shared)
                    return (
                      <li key={f.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-2.5">
                        <span className="min-w-0 text-[0.92rem]">
                          <span className="font-semibold">{f.name}</span>
                          <span className="text-ink-2">, {f.role}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[0.78rem] text-ink-2">{f.id}</span>
                      </li>
                    );
                  return (
                    <li key={f.id}>
                      <button
                        ref={chipRefs[i]}
                        type="button"
                        data-look
                        aria-pressed={active}
                        aria-describedby="two-finding"
                        onPointerEnter={(e) => e.pointerType === "mouse" && setActive(true)}
                        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(false)}
                        onFocus={() => setActive(true)}
                        onBlur={() => setActive(false)}
                        onClick={() => setActive((v) => !v)}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left transition-colors duration-200 ${active ? "bg-ink text-white" : "bg-white text-ink ring-2 ring-ink"}`}
                      >
                        <span className="min-w-0 text-[0.92rem]">
                          <span className="font-semibold">{f.name}</span>
                          <span className={active ? "text-white/80" : "text-ink-2"}>, {f.role}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.78rem] font-semibold ${active ? "bg-sun text-ink" : "bg-sun"}`}>
                          {f.id}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}

          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <AnimatePresence>
              {active && line && (
                <motion.g key="link" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.path
                    d={line}
                    fill="none"
                    stroke="#1B1530"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, ease: [0.3, 0.8, 0.3, 1] }}
                  />
                </motion.g>
              )}
            </AnimatePresence>
          </svg>
        </div>

        <div id="two-finding" aria-live="polite" className="mx-auto mt-8 max-w-[44rem] text-center">
          {active ? (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-start gap-3 rounded-3xl bg-ink px-5 py-4 text-left text-[1rem] leading-snug text-white"
            >
              <Link2 className="mt-0.5 size-5 shrink-0 text-sun" aria-hidden />
              <span>
                Same faculty ID <span className="font-mono text-sun">{SHARED.id}</span> is listed as full time in both
                applications for 2026-27. Linked for review; an official decides which entry holds.
              </span>
            </motion.p>
          ) : (
            <p className="text-[0.95rem] font-medium text-ink-2">
              Point at, tap or tab to the outlined faculty entry to see what the two applications share.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
