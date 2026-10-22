import { ArrowRight } from "lucide-react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { PrimaryLink, Reveal, useWorkspaceHref } from "../kit";
import { palette } from "../palette";

const SIZE = 300;
const C = SIZE / 2;
const RINGS = [
  { r: 74, n: 30, w: 10, h: 16 },
  { r: 96, n: 38, w: 10, h: 18 },
  { r: 119, n: 46, w: 10, h: 18 },
];

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(" ")})`;
}

// Voxel iris: segments facing the cursor brighten and the pupil follows, the eye looks where you look
function VoxelIris({ area }: { area: RefObject<HTMLElement | null> }) {
  const reduced = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const [angle, setAngle] = useState<number | null>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 180, damping: 24 });
  const sy = useSpring(py, { stiffness: 180, damping: 24 });

  const segs = useMemo(
    () =>
      RINGS.flatMap((ring, ri) =>
        Array.from({ length: ring.n }, (_, i) => {
          const a = (i / ring.n) * Math.PI * 2;
          const jitter = ((i * 37 + ri * 11) % 7) / 7;
          return {
            key: `${ri}-${i}`,
            a,
            x: C + Math.cos(a) * ring.r,
            y: C + Math.sin(a) * ring.r,
            w: ring.w,
            h: ring.h - jitter * 4,
            deg: (a * 180) / Math.PI + 90,
            fill: mix(palette.voxel.irisInner, palette.voxel.irisOuter, ri / 2 * 0.85 + jitter * 0.15),
          };
        }),
      ),
    [],
  );

  useEffect(() => {
    const el = area.current;
    if (!el || reduced) return;
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  });

  function onMove(e: globalThis.PointerEvent) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 500) * 16;
    px.set((dx / d) * k);
    py.set((dy / d) * k);
    setAngle(Math.atan2(dy, dx));
  }
  function onLeave() {
    px.set(0);
    py.set(0);
    setAngle(null);
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        ref={ref}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      >
        <defs>
          <radialGradient id="cta-glow">
            <stop offset="0%" stopColor="rgb(139 61 255 / 0.35)" />
            <stop offset="100%" stopColor="rgb(139 61 255 / 0)" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={148} fill="url(#cta-glow)" />
        {segs.map((s) => {
          let o = 0.42;
          if (angle !== null) {
            const diff = Math.abs(Math.atan2(Math.sin(s.a - angle), Math.cos(s.a - angle)));
            o = 0.3 + 0.7 * Math.max(0, 1 - diff / 0.9);
          }
          return (
            <rect
              key={s.key}
              x={s.x - s.w / 2}
              y={s.y - s.h / 2}
              width={s.w}
              height={s.h}
              rx={1.5}
              fill={s.fill}
              opacity={o}
              transform={`rotate(${s.deg} ${s.x} ${s.y})`}
              style={{ transition: "opacity 260ms ease-out" }}
            />
          );
        })}
        <circle cx={C} cy={C} r={131} fill="none" stroke={palette.voxel.limbal} strokeWidth="3" opacity="0.8" />
        <motion.g style={{ x: sx, y: sy }}>
          <circle cx={C} cy={C} r={58} fill={palette.pupil} />
          <circle cx={C} cy={C} r={58} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="1" />
          <circle cx={C + 20} cy={C - 22} r={9} fill="rgb(255 250 246 / 0.85)" />
          <circle cx={C + 32} cy={C - 8} r={3.5} fill="rgb(255 250 246 / 0.5)" />
        </motion.g>
      </svg>
    </div>
  );
}

export default function FinalCta() {
  const href = useWorkspaceHref();
  const area = useRef<HTMLElement>(null);
  return (
    <section
      ref={area}
      id="cta"
      aria-labelledby="cta-title"
      className="relative isolate overflow-hidden bg-(--lp-pupil) px-4 py-28 text-white sm:px-6 md:py-36"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(186_153_255/0.5),transparent)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Reveal className="relative z-10 order-2 text-center md:order-1 md:text-left">
          <p className="lp-eyebrow text-white/55!">Pratyaksha, perception by the eye</p>
          <h2 id="cta-title" className="lp-display mt-3 text-[56px] leading-none font-semibold text-white sm:text-[88px]">
            Look closer.
          </h2>
          <p className="mx-auto mt-6 max-w-md text-[17px] leading-relaxed text-white/70 md:mx-0">
            Sign in with a demo account and follow any finding back to the page, the record and the rule behind it.
          </p>
          <div className="mt-9 flex justify-center md:justify-start">
            <PrimaryLink to={href} className="h-13 px-7 text-[16px]">
              Open the workspace <ArrowRight aria-hidden className="size-4" />
            </PrimaryLink>
          </div>
        </Reveal>
        <div className="relative order-1 mx-auto aspect-square w-full max-w-[300px] md:order-2 md:max-w-[460px]">
          <VoxelIris area={area} />
        </div>
      </div>
    </section>
  );
}
