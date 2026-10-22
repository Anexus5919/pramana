import { useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { cn } from "../ui/cn";

const CELL = 3.6;
const GAP = 0.7;
const SPAN = CELL * 3 + GAP * 2;
const OX = 20 - SPAN / 2;
const OY = 12 - SPAN / 2;

// Iris shades around the pupil: corners lighter, edges deeper, like lit voxel faces
const SHADE = [
  ["var(--brand-300)", "var(--brand-400)", "var(--brand-300)"],
  ["var(--brand-500)", "pupil", "var(--brand-500)"],
  ["var(--brand-400)", "var(--brand-600)", "var(--brand-400)"],
];

export interface EyeMarkProps {
  /** Rendered width in px; height follows the 40:24 ratio */
  size?: number;
  /** The iris scans while work is in progress */
  active?: boolean;
  /** Increment to blink once (e.g. after a successful mutation) */
  blink?: number;
  className?: string;
  title?: string;
}

/** Pramana mark: almond outline, 3x3 voxel iris and a square pupil. */
export function EyeMark({ size = 32, active = false, blink = 0, className, title }: EyeMarkProps) {
  const clip = `eye-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 40 24"
      width={size}
      height={(size * 24) / 40}
      className={cn("shrink-0 overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <motion.g
        key={blink}
        initial={false}
        animate={blink > 0 ? { scaleY: [1, 0.06, 1] } : { scaleY: 1 }}
        transition={{ duration: 0.32, times: [0, 0.45, 1], ease: "easeInOut" }}
        style={{ originX: "20px", originY: "12px" }}
      >
        <path
          d="M2 12C8.5 3 31.5 3 38 12C31.5 21 8.5 21 2 12Z"
          fill="var(--surface)"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        <clipPath id={clip}>
          <path d="M3.4 12C9.5 4.2 30.5 4.2 36.6 12C30.5 19.8 9.5 19.8 3.4 12Z" />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          <motion.g
            animate={active ? { x: [0, -3.2, 3.2, 0] } : { x: 0 }}
            transition={
              active ? { duration: 1.6, repeat: Infinity, ease: "easeInOut", times: [0, 0.3, 0.75, 1] } : { duration: 0.3 }
            }
          >
            {SHADE.map((row, r) =>
              row.map((fill, c) => {
                const x = OX + c * (CELL + GAP);
                const y = OY + r * (CELL + GAP);
                const pupil = fill === "pupil";
                return (
                  <g key={`${r}-${c}`}>
                    <rect x={x} y={y} width={CELL} height={CELL} rx={0.6} style={{ fill: pupil ? "var(--pupil)" : fill }} />
                    {pupil && <rect x={x + 0.7} y={y + 0.7} width={1.1} height={1.1} fill="white" opacity={0.9} />}
                  </g>
                );
              }),
            )}
          </motion.g>
        </g>
      </motion.g>
    </svg>
  );
}

/** Global activity from TanStack Query: busy with a little hysteresis, and a blink per successful mutation. */
export function useActivity(): { active: boolean; blink: number } {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const qc = useQueryClient();
  const busy = fetching + mutating > 0;
  const [active, setActive] = useState(false);
  const [blink, setBlink] = useState(0);

  useEffect(() => {
    // Ignore sub-150ms blips; once scanning, keep going at least 600ms so it reads as motion
    const t = window.setTimeout(() => setActive(busy), busy ? 150 : 600);
    return () => window.clearTimeout(t);
  }, [busy]);

  useEffect(
    () =>
      qc.getMutationCache().subscribe((e) => {
        if (e.type === "updated" && e.action.type === "success") setBlink((b) => b + 1);
      }),
    [qc],
  );

  return { active, blink };
}

export interface WordmarkProps {
  size?: number;
  active?: boolean;
  blink?: number;
  /** Hide the word, keeping only the mark */
  markOnly?: boolean;
  className?: string;
}

export function Wordmark({ size = 30, active, blink, markOnly = false, className }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <EyeMark size={size} active={active} blink={blink} />
      {!markOnly && (
        <span className="font-display text-[19px] leading-none font-semibold tracking-[-0.03em]">Pramana</span>
      )}
    </span>
  );
}
