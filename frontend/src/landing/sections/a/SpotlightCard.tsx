import { motion } from "motion/react";
import { type PointerEvent, type ReactNode, useRef } from "react";

// Card with a soft cursor spotlight that signals it is interactive
export function SpotlightCard({
  children,
  className = "",
  onEnter,
  onLeave,
  as: Tag = "article",
  dark = false,
}: {
  children: ReactNode;
  className?: string;
  onEnter?: () => void;
  onLeave?: () => void;
  as?: "article" | "div" | "li";
  dark?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  function move(e: PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }
  const glow = dark ? "rgb(186 153 255 / 0.14)" : "rgb(139 61 255 / 0.07)";
  return (
    <Tag
      ref={ref as never}
      onPointerMove={move}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={`group/spot relative isolate overflow-hidden ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: `radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), ${glow}, transparent 60%)` }}
      />
      {children}
    </Tag>
  );
}

type Faces = { top: string; left: string; right: string };

export const cubeIdle: Faces = { top: "#f3edf0", left: "#ddd2d8", right: "#e8dfe4" };
export const cubeViolet: Faces = { top: "#c8b6f5", left: "#8f6fd8", right: "#a88ae9" };
export const cubeRose: Faces = { top: "#ffd3e3", left: "#e0709a", right: "#ee95b6" };

// Isometric voxel cube used by the evidence visuals; faces cross-fade when its state changes
export function IsoCube({
  cx,
  cy,
  s = 12,
  faces,
  from,
  delay = 0,
}: {
  cx: number;
  cy: number;
  s?: number;
  faces: Faces;
  from?: Faces;
  delay?: number;
}) {
  const h = s / 2;
  const t = { duration: 0.35, delay };
  return (
    <g strokeLinejoin="round">
      <motion.polygon
        points={`${cx},${cy - s} ${cx + s},${cy - h} ${cx},${cy} ${cx - s},${cy - h}`}
        initial={from ? { fill: from.top } : false}
        animate={{ fill: faces.top }}
        transition={t}
      />
      <motion.polygon
        points={`${cx - s},${cy - h} ${cx},${cy} ${cx},${cy + s} ${cx - s},${cy + h}`}
        initial={from ? { fill: from.left } : false}
        animate={{ fill: faces.left }}
        transition={t}
      />
      <motion.polygon
        points={`${cx},${cy} ${cx + s},${cy - h} ${cx + s},${cy + h} ${cx},${cy + s}`}
        initial={from ? { fill: from.right } : false}
        animate={{ fill: faces.right }}
        transition={t}
      />
    </g>
  );
}
