import { motion } from "motion/react";
import { ease } from "../../ui/motion";

/** Face colours derived from one base colour, lit from the top-left like the landing voxels. */
export function faces(color: string) {
  return {
    top: `color-mix(in oklab, ${color} 45%, white)`,
    left: color,
    right: `color-mix(in oklab, ${color} 68%, black)`,
  };
}

export interface IsoCubeProps {
  /** Top vertex of the top face */
  x: number;
  y: number;
  /** Half-width of the cube */
  s: number;
  color: string;
  ghost?: boolean;
  delay?: number;
  animate?: boolean;
}

/** One isometric voxel. Drops in once on first render when `animate` is set. */
export function IsoCube({ x, y, s, color, ghost = false, delay = 0, animate = true }: IsoCubeProps) {
  const f = faces(color);
  const h = s;
  const top = `M${x} ${y}L${x + s} ${y + s / 2}L${x} ${y + s}L${x - s} ${y + s / 2}Z`;
  const left = `M${x - s} ${y + s / 2}L${x} ${y + s}L${x} ${y + s + h}L${x - s} ${y + s / 2 + h}Z`;
  const right = `M${x + s} ${y + s / 2}L${x} ${y + s}L${x} ${y + s + h}L${x + s} ${y + s / 2 + h}Z`;
  return (
    <motion.g
      initial={animate ? { opacity: 0, y: -14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: ease.out }}
    >
      {ghost ? (
        <>
          <path d={top} fill="none" stroke="var(--line-2)" strokeDasharray="2 2" />
          <path d={left} fill="none" stroke="var(--line-2)" strokeDasharray="2 2" />
          <path d={right} fill="none" stroke="var(--line-2)" strokeDasharray="2 2" />
        </>
      ) : (
        <>
          <path d={left} style={{ fill: f.left }} />
          <path d={right} style={{ fill: f.right }} />
          <path d={top} style={{ fill: f.top }} />
          <path d={`M${x - s} ${y + s / 2}L${x} ${y + s}L${x + s} ${y + s / 2}`} fill="none" stroke="white" strokeOpacity={0.35} strokeWidth={0.8} />
        </>
      )}
    </motion.g>
  );
}
