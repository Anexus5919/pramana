import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn, ease2 } from "../ui2";

/** Lasting states, driven by the request: waiting for a reply, or the last one failed. */
export type MascotMood = "idle" | "thinking" | "error";
/** One-off reactions to a reply; `at` makes a repeat of the same reaction play again. */
export interface MascotCue {
  type: "happy" | "refuse";
  at: number;
}

export interface DrishtiMascotProps {
  /** Rendered size in px; the art is drawn on a 56 px grid */
  size?: number;
  mood?: MascotMood;
  cue?: MascotCue | null;
  /** Glance toward the open chat window, which sits above and to the left */
  lookAt?: "panel" | null;
  hover?: boolean;
  /** Follow the pointer with the pupil */
  track?: boolean;
  /** Idle life: blinks, glances and a slow float */
  lively?: boolean;
  className?: string;
}

// The eye on the 56 px grid
const CX = 28;
const CY = 29;
/** How far the iris may travel from the centre */
const REACH = 4.5;
/** Upper lid offset: open, thinking, drooping after an error, shut mid-blink */
const LID = { idle: 0, thinking: 2.5, error: 9 } as const;
// Shut leaves the lash line just inside the bottom of the eye, so a blink reads as a closed eye, not an empty badge
const LID_SHUT = 27;
const CUE_MS = { happy: 700, refuse: 1400 } as const;

const BROW = {
  rest: { y: 0, rotate: 0 },
  hover: { y: -2, rotate: 0 },
  thinking: { y: -1.5, rotate: -6 },
  happy: { y: -2.5, rotate: 0 },
  refuse: { y: -2.5, rotate: -10 },
  error: { y: 1.2, rotate: 7 },
};

type Gaze = { x: number; y: number };

/**
 * Drishti's own face: a round badge holding one big friendly eye. Deliberately unlike the Pramana eye
 * mark, which stays the product logo. Purely decorative; the button around it carries the name.
 */
export function DrishtiMascot({
  size = 56,
  mood = "idle",
  cue = null,
  lookAt = null,
  hover = false,
  track = true,
  lively = true,
  className,
}: DrishtiMascotProps) {
  const uid = `dm${useId().replace(/:/g, "")}`;
  const reduce = !!useReducedMotion();
  const svg = useRef<SVGSVGElement>(null);
  const [reaction, setReaction] = useState<MascotCue["type"] | null>(null);
  const happy = reaction === "happy";

  // A reaction plays for a moment, then the face settles back
  const cueType = cue?.type;
  const cueAt = cue?.at;
  useEffect(() => {
    if (!cueType) return;
    setReaction(cueType);
    const t = window.setTimeout(() => setReaction(null), CUE_MS[cueType]);
    return () => window.clearTimeout(t);
  }, [cueType, cueAt]);

  /* Upper lid: rests by mood, shuts briefly to blink */
  const lid = useMotionValue<number>(LID[mood]);
  const lidRest = useRef<number>(LID[mood]);
  // Lashes ride the lid but fade on the way down, so a shut eye shows no stray marks below it
  const lashes = useTransform(lid, [0, 12, 20], [1, 1, 0]);
  useEffect(() => {
    lidRest.current = LID[mood];
    if (reduce) lid.jump(LID[mood]);
    else animate(lid, LID[mood], { duration: 0.3, ease: ease2 });
  }, [mood, reduce, lid]);

  const blink = useCallback(() => {
    if (reduce) return;
    animate(lid, [lid.get(), LID_SHUT, lidRest.current], { duration: 0.26, times: [0, 0.42, 1], ease: "easeInOut" });
  }, [reduce, lid]);

  // A natural blink every 3 to 6 s, quicker while thinking
  useEffect(() => {
    if (!lively || reduce) return;
    let t = 0;
    const next = () => {
      const wait = mood === "thinking" ? 1400 + Math.random() * 1400 : 3000 + Math.random() * 3000;
      t = window.setTimeout(() => {
        if (!document.hidden) blink();
        next();
      }, wait);
    };
    next();
    return () => window.clearTimeout(t);
  }, [lively, reduce, mood, blink]);

  // A quick happy blink as the pointer arrives
  useEffect(() => {
    if (hover) blink();
  }, [hover, blink]);

  /* Gaze: thinking looks up and away, an open window draws the eye, otherwise the pointer or an idle glance */
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const pupilX = useTransform(gx, (v) => v * 0.22);
  const pupilY = useTransform(gy, (v) => v * 0.22);
  const pointer = useRef<Gaze | null>(null);
  const glance = useRef<Gaze | null>(null);
  const live = useRef({ mood, lookAt });
  live.current = { mood, lookAt };

  const aim = useCallback(
    (slow = false) => {
      const s = live.current;
      let to: Gaze = { x: 0, y: 0 };
      if (s.mood === "thinking") to = { x: 3.4, y: -3.6 };
      else if (s.lookAt === "panel") to = { x: -3.6, y: -3.2 };
      else if (pointer.current) to = pointer.current;
      else if (glance.current) to = glance.current;
      if (reduce) {
        gx.jump(to.x);
        gy.jump(to.y);
        return;
      }
      const how = slow
        ? { duration: 0.7, ease: "easeInOut" as const }
        : { type: "spring" as const, stiffness: 240, damping: 26, mass: 0.6 };
      animate(gx, to.x, how);
      animate(gy, to.y, how);
    },
    [reduce, gx, gy],
  );

  useEffect(() => aim(), [mood, lookAt, aim]);

  // The pupil follows the pointer, at most once a frame, and rests after a quiet spell or when the tab hides
  useEffect(() => {
    if (!track || reduce) return;
    let raf = 0;
    let rest = 0;
    let last: Gaze | null = null;
    const apply = () => {
      raf = 0;
      const el = svg.current;
      if (!last || !el || document.hidden) return;
      const r = el.getBoundingClientRect();
      const dx = last.x - (r.left + r.width / 2);
      const dy = last.y - (r.top + (r.height * CY) / 56);
      const d = Math.hypot(dx, dy);
      const k = d < 1 ? 0 : (REACH * Math.min(1, d / 180)) / d;
      pointer.current = { x: dx * k, y: dy * k * 0.85 };
      aim();
      window.clearTimeout(rest);
      rest = window.setTimeout(() => {
        pointer.current = null;
        aim(true);
      }, 2500);
    };
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onVisibility = () => {
      if (!document.hidden) return;
      pointer.current = null;
      aim();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(rest);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      pointer.current = null;
    };
  }, [track, reduce, aim]);

  // Now and then, with nothing else to look at, a slow glance to one side
  useEffect(() => {
    if (!lively || reduce) return;
    let t = 0;
    let back = 0;
    const next = () => {
      t = window.setTimeout(() => {
        const s = live.current;
        if (!document.hidden && !pointer.current && s.mood === "idle" && !s.lookAt) {
          glance.current = { x: Math.random() < 0.5 ? -4 : 4, y: 0.6 };
          aim(true);
          back = window.setTimeout(() => {
            glance.current = null;
            aim(true);
          }, 1400);
        }
        next();
      }, 7000 + Math.random() * 6000);
    };
    next();
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(back);
      glance.current = null;
    };
  }, [lively, reduce, aim]);

  const brow =
    reaction === "refuse" ? BROW.refuse : happy ? BROW.happy : mood === "error" ? BROW.error : mood === "thinking" ? BROW.thinking : hover ? BROW.hover : BROW.rest;
  const thinking = mood === "thinking" && !happy;
  const soft = { duration: 0.25, ease: ease2 };

  return (
    <svg
      ref={svg}
      viewBox="0 0 56 56"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} gradientUnits="userSpaceOnUse" x1="12" y1="2" x2="44" y2="56">
          <stop offset="0" style={{ stopColor: "var(--brand-400)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-solid)" }} />
        </linearGradient>
        <radialGradient id={`${uid}-iris`} cx="0.4" cy="0.36" r="0.72">
          <stop offset="0" style={{ stopColor: "var(--brand-400)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-solid)" }} />
        </radialGradient>
        <clipPath id={`${uid}-eye`}>
          <ellipse cx={CX} cy={CY} rx="15" ry="14" />
        </clipPath>
        {/* The upper lid as a mask: only what lies below its edge shows, so the badge behind needs no matching fill */}
        <mask id={`${uid}-lid`} maskUnits="userSpaceOnUse" x="0" y="0" width="56" height="56">
          <motion.path d="M0 24H10Q28 6 46 24H56V80H0Z" fill="white" style={{ y: lid }} />
        </mask>
      </defs>

      {/* The badge */}
      <circle cx="28" cy="28" r="28" fill={`url(#${uid}-bg)`} />
      <circle cx="28" cy="28" r="27.5" fill="none" stroke="white" strokeOpacity="0.2" />

      <motion.g
        animate={lively && !reduce ? { y: [0, -1.5, 0] } : { y: 0 }}
        transition={lively && !reduce ? { duration: 4.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      >
        <motion.g
          animate={reaction === "refuse" && !reduce ? { rotate: [0, -9, 7, -4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* Eyebrow */}
          <motion.path
            d="M18 12.5Q25.5 7.5 33 10.5"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeOpacity="0.95"
            initial={false}
            animate={brow}
            transition={reduce ? { duration: 0 } : soft}
          />

          {/* The open eye: hidden while it smiles */}
          <motion.g
            initial={false}
            animate={{ opacity: happy ? 0 : 1, scaleY: happy ? 0.3 : 1 }}
            transition={{ duration: reduce ? 0 : 0.15, ease: ease2 }}
          >
            <g clipPath={`url(#${uid}-eye)`}>
              <g mask={`url(#${uid}-lid)`}>
                <ellipse cx={CX} cy={CY} rx="15" ry="14" fill="white" />
                <motion.g style={{ x: gx, y: gy }}>
                  <circle cx={CX} cy={CY} r="9" fill={`url(#${uid}-iris)`} />
                  <circle cx={CX} cy={CY} r="8.6" fill="none" stroke="var(--pupil)" strokeOpacity="0.25" strokeWidth="0.8" />
                  <motion.circle cx={CX} cy={CY} r="4.6" style={{ x: pupilX, y: pupilY, fill: "var(--pupil)" }} />
                  <circle cx={CX + 2.9} cy={CY - 3} r="2.1" fill="white" />
                  <circle cx={CX - 2.5} cy={CY + 2.8} r="1" fill="white" fillOpacity="0.9" />
                  {/* Thinking: a short trail of dots circling the iris, slipping behind the lid at the top */}
                  {thinking && (
                    <motion.g
                      animate={reduce ? { rotate: 0 } : { rotate: 360 }}
                      transition={reduce ? { duration: 0 } : { duration: 1.3, repeat: Infinity, ease: "linear" }}
                    >
                      <circle cx={CX} cy={CY} r="11.8" fill="none" />
                      <circle cx={CX + 11.6} cy={CY} r="1.35" style={{ fill: "var(--brand-solid)" }} />
                      <circle cx={CX + 10.2} cy={CY + 5.5} r="1.15" style={{ fill: "var(--brand-solid)" }} fillOpacity="0.65" />
                      <circle cx={CX + 6.6} cy={CY + 9.6} r="0.95" style={{ fill: "var(--brand-solid)" }} fillOpacity="0.35" />
                    </motion.g>
                  )}
                </motion.g>
              </g>
              {/* The lash line along the lid's edge */}
              <motion.path d="M10 24Q28 6 46 24" fill="none" stroke="var(--pupil)" strokeWidth="2.4" style={{ y: lid }} />
            </g>
            <motion.g style={{ y: lid, opacity: lashes }} stroke="var(--pupil)" strokeWidth="1.6" strokeLinecap="round">
              <path d="M36 16.8L37.2 13.6" />
              <path d="M40.5 19.3L42.9 16.7" />
              <path d="M44 22.1L47.2 20.5" />
            </motion.g>
          </motion.g>

          {/* Reply arrived: the eye smiles shut */}
          <motion.path
            d="M17 33Q28 20 39 33"
            fill="none"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
            initial={false}
            animate={{ opacity: happy ? 1 : 0, y: happy || reduce ? 0 : 2 }}
            transition={{ duration: reduce ? 0 : 0.15, ease: ease2 }}
          />
        </motion.g>
      </motion.g>
    </svg>
  );
}
