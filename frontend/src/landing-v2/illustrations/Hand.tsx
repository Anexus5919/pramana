import { motion } from "motion/react";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { addLean, prefersReduced, wake, type EyeMode, type LookSource } from "../lib/gaze";
import { Eye } from "./Eye";

// Geometry for a right hand seen palm first, thumb and index forming a ring on the left
export const RING = { x: 112, y: 222 };
export const RING_INNER = 46;
const PALM_EYE = { x: 243, y: 326 };
const PIVOT = { x: 243, y: 456 };

const INDEX = {
  ok: "M 178 262 C 178 185.5 148.5 156 112 156 C 71 156 39.9 193.1 47 233.5",
  open: "M 178 262 C 177.5 226 177 200 176.5 176 C 176 150 175 120 174 92",
};
const THUMB = {
  ok: "M 172 350 C 160 318 140 288 112 288 C 88.4 288 66.6 275.4 54.8 255",
  open: "M 172 350 C 154 336 136 322 118 306 C 100 290 84 272 70 250",
};
const INDEX_NAIL = { ok: { cx: 46, cy: 224 }, open: { cx: 174, cy: 104 } };

export const HUES = {
  rose: { base: "#F06C9B", shade: "#DB4F86", tips: ["#F8C22E", "#FF6B2C", "#FFF4DE"], nail: "#FFF4DE", dots: "#FF6B2C" },
  tang: { base: "#FF6B2C", shade: "#E8521A", tips: ["#F06C9B", "#F8C22E", "#FFF4DE"], nail: "#FFF4DE", dots: "#F06C9B" },
} as const;

export type Pose = "ok" | "open";

type Props = {
  hue: keyof typeof HUES;
  mirror?: boolean;
  pose?: Pose;
  eye?: { look?: LookSource; mode?: EyeMode } | null;
  tap?: number;
  lean?: { max: number; enabled: boolean; extra?: number } | null;
  height?: number;
  top?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

const ease = [0.22, 0.9, 0.24, 1] as const;

export function Hand({
  hue,
  mirror = false,
  pose = "ok",
  eye = {},
  tap = 0,
  lean = null,
  height = 900,
  top = 0,
  label,
  className,
  style,
}: Props) {
  const c = HUES[hue];
  const id = useId().replace(/:/g, "");
  const leanRef = useRef<SVGGElement>(null);
  const pivotRef = useRef<SVGCircleElement>(null);
  const indexRef = useRef<SVGGElement>(null);
  const enabled = useRef(!!lean?.enabled);
  const extra = useRef(lean?.extra ?? 0);
  enabled.current = !!lean?.enabled;
  extra.current = lean?.extra ?? 0;
  const hasLean = !!lean;
  const max = lean?.max ?? 0;

  useEffect(() => {
    if (!hasLean || !leanRef.current || !pivotRef.current) return;
    const pivotEl = pivotRef.current;
    return addLean({
      el: leanRef.current,
      pivot: () => {
        const r = pivotEl.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      pivotLocal: PIVOT,
      sign: mirror ? -1 : 1,
      max,
      extra,
      enabled,
      r: { x: 0, v: 0 },
      visible: true,
      last: "",
    });
  }, [hasLean, mirror, max]);

  useEffect(() => {
    wake();
  }, [lean?.enabled, lean?.extra]);

  useEffect(() => {
    if (!tap || !indexRef.current || prefersReduced()) return;
    // index lifts off the thumb and presses back twice: the ring "confirms"
    indexRef.current.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(11deg)", offset: 0.22 },
        { transform: "rotate(-2deg)", offset: 0.42 },
        { transform: "rotate(8deg)", offset: 0.62 },
        { transform: "rotate(0deg)" },
      ],
      { duration: 760, easing: "ease-in-out" },
    );
  }, [tap]);

  const flip = mirror ? "translate(360 0) scale(-1 1)" : undefined;
  const eyeAt = pose === "ok" ? RING : PALM_EYE;
  const reduced = prefersReduced();
  const t = reduced ? { duration: 0 } : { duration: 0.55, ease };

  return (
    <svg
      viewBox={`0 ${top} 360 ${height - top}`}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={className}
      style={style}
    >
      <defs>
        <pattern id={`dots-${id}`} width="34" height="34" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="10" r="6.5" fill={c.dots} />
          <circle cx="25" cy="27" r="6.5" fill={c.dots} />
        </pattern>
      </defs>
      <g transform={flip}>
        <rect x="180" y="390" width="126" height="100" fill={c.base} />
        <rect x="158" y="450" width="170" height={Math.max(60, height - 450 + 40)} rx="30" fill="#FFFDF8" />
        <rect x="158" y="480" width="170" height={Math.max(30, height - 480 + 40)} fill={`url(#dots-${id})`} />
        <rect x="158" y="450" width="170" height="30" rx="15" fill="#FFE9C2" />
        <circle ref={pivotRef} cx={PIVOT.x} cy={PIVOT.y} r="0.5" fill="transparent" />
        <g ref={leanRef}>
          <g ref={indexRef} style={{ transformBox: "view-box", transformOrigin: "178px 244px" }}>
            <motion.path
              initial={false}
              animate={{ d: INDEX[pose] }}
              transition={t}
              fill="none"
              stroke={c.shade}
              strokeWidth="40"
              strokeLinecap="round"
            />
            <motion.circle initial={false} animate={INDEX_NAIL[pose]} transition={t} r="9.5" fill={c.nail} />
          </g>
          <path d="M 222 262 L 220 72" stroke={c.base} strokeWidth="43" strokeLinecap="round" />
          <path d="M 267 264 L 271 90" stroke={c.base} strokeWidth="43" strokeLinecap="round" />
          <path d="M 309 272 L 319 142" stroke={c.base} strokeWidth="39" strokeLinecap="round" />
          <circle cx="220" cy="84" r="10" fill={c.tips[0]} />
          <circle cx="271" cy="102" r="10" fill={c.tips[1]} />
          <circle cx="318.5" cy="153" r="9" fill={c.tips[2]} />
          <motion.path
            initial={false}
            animate={{ d: THUMB[pose] }}
            transition={t}
            fill="none"
            stroke={c.base}
            strokeWidth="48"
            strokeLinecap="round"
          />
          <rect x="150" y="206" width="186" height="232" rx="58" fill={c.base} />
          {eye && (
            <g transform={flip}>
              <motion.g
                initial={false}
                animate={{ x: mirror ? 360 - eyeAt.x : eyeAt.x, y: eyeAt.y, scale: pose === "ok" ? 1 : 1.08 }}
                transition={t}
              >
                <Eye look={eye.look} mode={eye.mode} />
              </motion.g>
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}
