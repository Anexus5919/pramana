// Motion v2: feedback and orientation only. Nothing loops except real progress.
/** 150 ms for hover, press and colour changes; 200 ms for panels, drawers and disclosure. */
export const dur2 = { fast: 0.15, base: 0.2 } as const;
/** Standard ease-out for enters and state changes. */
export const ease2 = [0.2, 0, 0, 1] as const;
/** Drawer and popover enter: a short fade with a 4px offset. */
export const enter2 = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: dur2.base, ease: ease2 } },
  exit: { opacity: 0, transition: { duration: dur2.fast, ease: ease2 } },
} as const;
