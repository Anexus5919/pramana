import type { Transition, Variants } from "motion/react";

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const spring = {
  snappy: { type: "spring", stiffness: 420, damping: 34 } satisfies Transition,
  soft: { type: "spring", stiffness: 180, damping: 24 } satisfies Transition,
};

export const dur = { micro: 0.12, ui: 0.2, panel: 0.32, story: 0.7 } as const;

export const tap = { scale: 0.97 } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: dur.panel, ease: ease.out } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: dur.ui, ease: ease.out } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: dur.ui, ease: ease.out } },
};

/** Parent variants for a staggered list reveal; children use fadeUp. */
export function stagger(step = 0.045, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: step, delayChildren: delay } },
  };
}

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { duration: dur.ui, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: { duration: dur.micro, ease: ease.inOut } },
};
